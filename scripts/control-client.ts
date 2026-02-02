type Args = {
  cmd: "health" | "status" | "tick";
  url: string;
  token?: string;
  reason?: string;
};

function usageAndExit(code: number): never {
  // Avoid printing secrets; only show flags.
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  tsx scripts/control-client.ts <health|status|tick> [--url <baseUrl>] [--token <token>] [--reason <text>]",
      "",
      "Defaults:",
      "  --url    $CONTROL_URL or http://basedintern.railway.internal:8080",
      "  --token  $CONTROL_TOKEN (required for status/tick)",
      "",
      "Examples:",
      "  tsx scripts/control-client.ts health",
      "  tsx scripts/control-client.ts status --token $CONTROL_TOKEN",
      "  tsx scripts/control-client.ts tick --reason openclaw --token $CONTROL_TOKEN"
    ].join("\n")
  );
  process.exit(code);
}

function parseArgs(argv: string[]): Args {
  const first = argv[2];
  if (first === "-h" || first === "--help" || !first) usageAndExit(0);

  const cmd = first as Args["cmd"];
  if (cmd !== "health" && cmd !== "status" && cmd !== "tick") usageAndExit(2);

  const url = process.env.CONTROL_URL?.trim() || "http://basedintern.railway.internal:8080";
  const out: Args = { cmd, url };

  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") {
      const v = argv[++i];
      if (!v) usageAndExit(2);
      out.url = v;
      continue;
    }
    if (a === "--token") {
      const v = argv[++i];
      if (!v) usageAndExit(2);
      out.token = v;
      continue;
    }
    if (a === "--reason") {
      const v = argv[++i];
      if (!v) usageAndExit(2);
      out.reason = v;
      continue;
    }
    if (a === "-h" || a === "--help") usageAndExit(0);
    usageAndExit(2);
  }

  if (!out.token && process.env.CONTROL_TOKEN?.trim()) {
    out.token = process.env.CONTROL_TOKEN.trim();
  }

  return out;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    (err as any).details = parsed;
    throw err;
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv);
  const base = args.url.replace(/\/$/, "");

  if (args.cmd === "health") {
    const data = await requestJson(`${base}/healthz`, { method: "GET" });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (!args.token || args.token.trim().length === 0) {
    // eslint-disable-next-line no-console
    console.error("CONTROL_TOKEN is required for this command.");
    usageAndExit(2);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.token}`
  };

  if (args.cmd === "status") {
    const data = await requestJson(`${base}/status`, { method: "GET", headers });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const reason = encodeURIComponent(args.reason ?? "manual");
  const data = await requestJson(`${base}/tick?reason=${reason}`, { method: "POST", headers });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  const details = (err as any)?.details;
  if (details) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(details, null, 2));
  }
  process.exitCode = 1;
});
