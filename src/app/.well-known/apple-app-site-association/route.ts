import { ensureSettings } from "@/lib/settings";
import { buildAppSiteAssociation } from "@/domain/app-links";

export const dynamic = "force-dynamic";

// Universal Links: tells iOS which website paths open in the app. Served as JSON without a file
// extension, as Apple requires. 404 until the identifiers are saved in Admin › Settings.
export async function GET() {
  await ensureSettings();
  const body = buildAppSiteAssociation(process.env.IOS_TEAM_ID, process.env.IOS_BUNDLE_ID);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
