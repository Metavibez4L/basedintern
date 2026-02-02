import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type SkillJson = {
  name: string;
  version: string;
  fetchedAt: string;
  baseUrl: string;
  requiredHost: string;
  auth: {
    modes: Array<"bearer" | "apiKey" | "cookie">;
    headerName?: string;
    scheme?: string;
    warning?: string;
  };
  headers: Record<string, string>;
  endpoints: {
    register?: { method: string; path: string };
    whoami?: { method: string; path: string };
    status?: { method: string; path: string };
    getProfileByName?: { method: string; path: string; query?: Record<string, string> };
    updateProfile?: { method: string; path: string };
    uploadAvatar?: { method: string; path: string };
    deleteAvatar?: { method: string; path: string };
    createPost?: { method: string; path: string };
    getTimeline?: { method: string; path: string };
    getSubmoltFeed?: { method: string; path: string };
  };
  rateLimits?: {
    postCooldownMinutes?: number;
    commentCooldownSeconds?: number;
  };
  limits?: {
    postContentMaxChars?: number;
  };
};

function dataPath(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

async function runCurl(url: string): Promise<string> {
  // Requirement: use curl. On Windows, `curl` is often a PowerShell alias for Invoke-WebRequest.
  // Prefer curl.exe, then curl.
  const candidates = process.platform === "win32" ? ["curl.exe", "curl"] : ["curl"];

  let lastErr: unknown = null;
  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ["-sL", url], {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });
      if (typeof stdout === "string" && stdout.trim().length > 0) return stdout;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`failed to fetch ${url} via curl (${String(lastErr)})`);
}

function tryParseFrontmatter(md: string): { name?: string; version?: string; metadata?: any } {
  // Very small frontmatter parser for the initial `--- ... ---` block.
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) return {};
  const block = m[1];
  const out: any = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (key === "metadata") {
      try {
        out.metadata = JSON.parse(value);
      } catch {
        // ignore
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

function parseSkill(md: string): SkillJson {
  const fm = tryParseFrontmatter(md);
  const apiBaseFromMetadata = fm?.metadata?.moltbot?.api_base as string | undefined;

  const baseUrlLine = md.match(/\*\*Base URL:\*\*\s*`([^`]+)`/);
  const baseUrl = (apiBaseFromMetadata || baseUrlLine?.[1] || "https://www.moltbook.com/api/v1").trim();

  const base = new URL(baseUrl);
  const requiredHost = base.hostname;

  // Endpoints (best-effort extraction; keep defaults known from spec)
  const endpoints: SkillJson["endpoints"] = {
    register: { method: "POST", path: "/agents/register" },
    whoami: { method: "GET", path: "/agents/me" },
    status: { method: "GET", path: "/agents/status" },
    getProfileByName: { method: "GET", path: "/agents/profile", query: { name: "MOLTY_NAME" } },
    updateProfile: { method: "PATCH", path: "/agents/me" },
    uploadAvatar: { method: "POST", path: "/agents/me/avatar" },
    deleteAvatar: { method: "DELETE", path: "/agents/me/avatar" },
    createPost: { method: "POST", path: "/posts" },
    getTimeline: { method: "GET", path: "/posts" },
    getSubmoltFeed: { method: "GET", path: "/submolts/{submolt}/feed" }
  };

  // Rate limits (spec currently describes these explicitly)
  const postCooldownMinutes = md.match(/\*\*Post cooldown:\*\*[^\n]*?(\d+)\s*minutes/i);
  const commentCooldownSeconds = md.match(/\*\*Comment cooldown:\*\*[^\n]*?(\d+)\s*seconds/i);

  const out: SkillJson = {
    name: (fm.name || "moltbook").trim(),
    version: (fm.version || "unknown").trim(),
    fetchedAt: new Date().toISOString(),
    baseUrl,
    requiredHost,
    auth: {
      // Spec describes `Authorization: Bearer YOUR_API_KEY`.
      modes: ["bearer", "apiKey"],
      headerName: "Authorization",
      scheme: "Bearer",
      warning:
        "Only send your Moltbook API key to https://www.moltbook.com/api/v1/* (with www). The spec warns redirects can strip Authorization headers."
    },
    headers: {
      Accept: "application/json"
    },
    endpoints,
    rateLimits: {
      postCooldownMinutes: postCooldownMinutes ? parseInt(postCooldownMinutes[1], 10) : 30,
      commentCooldownSeconds: commentCooldownSeconds ? parseInt(commentCooldownSeconds[1], 10) : 20
    }
  };

  return out;
}

async function main(): Promise<void> {
  const outDir = dataPath("data", "moltbook");
  await mkdir(outDir, { recursive: true });

  // Start from moltbook.com and follow redirects (per task requirement).
  // The spec itself recommends using `www`, but redirects are safe here (no secrets involved).
  const url = "https://moltbook.com/skill.md";
  const md = await runCurl(url);

  const mdPath = path.join(outDir, "skill.md");
  await writeFile(mdPath, md, "utf8");

  const parsed = parseSkill(md);

  const jsonPath = path.join(outDir, "skill.json");
  await writeFile(jsonPath, JSON.stringify(parsed, null, 2), "utf8");

  // Small confirmation without secrets.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        wrote: { md: path.relative(process.cwd(), mdPath), json: path.relative(process.cwd(), jsonPath) },
        baseUrl: parsed.baseUrl,
        authModes: parsed.auth.modes
      },
      null,
      2
    )
  );
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
