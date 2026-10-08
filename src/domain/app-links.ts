// Website <-> app association files. Only the signed-in area opens in the app: marketing pages stay
// in the browser so search engines and shared links keep working for everyone.
export function buildAssetLinks(packageName: string | undefined, fingerprints: string | undefined) {
  const prints = (fingerprints ?? "").split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (!packageName?.trim() || prints.length === 0) return null;
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName.trim(), sha256_cert_fingerprints: prints }
  }];
}

export const APP_LINK_PATHS = ["/app", "/app/*"];

export function buildAppSiteAssociation(teamId: string | undefined, bundleId: string | undefined) {
  if (!teamId?.trim() || !bundleId?.trim()) return null;
  const appID = `${teamId.trim()}.${bundleId.trim()}`;
  return {
    applinks: {
      details: [{ appIDs: [appID], components: APP_LINK_PATHS.map((path) => ({ "/": path })) }]
    },
    webcredentials: { apps: [appID] }
  };
}
