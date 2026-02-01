export function redactToken(token: string, opts?: { prefix?: number; suffix?: number }): string {
  const prefix = opts?.prefix ?? 8;
  const suffix = opts?.suffix ?? 4;
  const t = token ?? "";
  if (t.length <= prefix + suffix + 3) return "***";
  return `${t.slice(0, prefix)}...${t.slice(-suffix)}`;
}

export function redactCookieHeader(cookie: string): string {
  // Cookies can contain multiple key=value pairs; show only cookie names.
  const parts = cookie
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 20);
  const names = parts.map((p) => p.split("=")[0]?.trim() || "?").filter(Boolean);
  return `cookies(${names.length}): ${names.join(",")}`;
}

export function safeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
