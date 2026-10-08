import { ensureSettings } from "@/lib/settings";
import { buildAssetLinks } from "@/domain/app-links";

export const dynamic = "force-dynamic";

// Digital Asset Links: proves to Android that this website and the app belong together, so website
// links open in the app. Absent (404) until the app identifiers are saved in Admin › Settings.
export async function GET() {
  await ensureSettings();
  const body = buildAssetLinks(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_CERT_FINGERPRINTS);
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
