// The left-most X-Forwarded-For entry is whatever the caller wrote, so keying a rate limit on it
// lets anyone dodge the limit by sending a different header each time. Every trusted proxy appends
// the address it received the request from, so the entry that counts is the one that many hops from
// the right. TRUSTED_PROXY_HOPS is the number of proxies in front of the app (default 1).
export function clientIp(forwardedFor: string | null | undefined, hops = 1): string {
  const parts = (forwardedFor ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "unknown";
  const count = Number.isInteger(hops) && hops > 0 ? hops : 1;
  return parts[Math.max(0, parts.length - count)];
}

export function requestIp(request: Request): string {
  return clientIp(request.headers.get("x-forwarded-for"), Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
}
