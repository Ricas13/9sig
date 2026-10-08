import { z } from "zod";
import { assertSameOrigin, consumeRateLimit } from "@/lib/security";
import { requestIp } from "@/domain/client-ip";
import { completeSetup } from "@/lib/setup";
import { ensureSettings, saveSettings } from "@/lib/settings";

const schema = z.object({ code: z.string().min(8).max(32), email: z.string().email().max(254), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  try {
    await ensureSettings();
    // Before a public address has been saved there is nothing to compare the origin with, so the
    // browser's own origin must match the host it called; the address is then saved from it below.
    if (process.env.NEXT_PUBLIC_APP_URL) assertSameOrigin(request);
    else assertBrowserCalledItsOwnHost(request);
    // Guessing the one-time code must be impractical: a handful of tries per hour per address.
    await consumeRateLimit("setup:" + requestIp(request), 8, 3600);
    await consumeRateLimit("setup:global", 40, 3600);
    const input = schema.parse(await request.json());
    const result = await completeSetup(input);
    if (!result.ok) {
      const message = result.reason === "CLOSED" ? "Setup is already complete. Sign in instead." : result.reason === "EMAIL_IN_USE" ? "That email belongs to a closed account." : "That setup code is not correct. Use the code printed in the server log.";
      return Response.json({ error: message }, { status: result.reason === "CLOSED" ? 409 : 400 });
    }
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      const origin = request.headers.get("origin");
      if (origin) await saveSettings(result.userId, [{ key: "NEXT_PUBLIC_APP_URL", value: origin }]).catch(() => undefined);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Enter the setup code, a valid email and a password of at least 12 characters." }, { status: 400 });
    if (error instanceof Error && (error.message === "INVALID_ORIGIN" || error.message === "APP_ORIGIN_NOT_CONFIGURED")) return Response.json({ error: "Request origin was not accepted." }, { status: 403 });
    if (error instanceof Error && error.message === "RATE_LIMITED") return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    return Response.json({ error: "Could not complete setup." }, { status: 500 });
  }
}

function assertBrowserCalledItsOwnHost(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost = "";
  try { originHost = origin ? new URL(origin).host : ""; } catch { /* handled below */ }
  if (!originHost || !host || originHost !== host.split(",")[0].trim()) throw new Error("INVALID_ORIGIN");
}
