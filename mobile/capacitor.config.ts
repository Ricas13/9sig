import type { CapacitorConfig } from "@capacitor/cli";

// The apps are a native shell around the live website, so every fix to the web app reaches phones
// immediately and there is one codebase to maintain. Set these when building:
//   REBALUNE_APP_ID    reverse-domain id, e.g. com.yourcompany.rebalune (must match Admin > Settings > Mobile apps)
//   REBALUNE_APP_NAME  name under the icon
//   REBALUNE_APP_URL   the https address of the deployed site
const appId = process.env.REBALUNE_APP_ID ?? "com.example.rebalune";
const appName = process.env.REBALUNE_APP_NAME ?? "Rebalune";
const url = process.env.REBALUNE_APP_URL;

if (!url || !url.startsWith("https://")) {
  throw new Error("Set REBALUNE_APP_URL to the https address of your deployed site before running Capacitor.");
}

const config: CapacitorConfig = {
  appId,
  appName,
  // Required by Capacitor even though the app loads the remote site; holds a tiny local fallback.
  webDir: "www",
  server: {
    url,
    // Only the site itself may load in the app. Links to anything else open in the system browser.
    allowNavigation: [new URL(url).host],
    cleartext: false
  },
  // The marker lets the server hide purchase buttons (store rules) and the Google button (Google
  // blocks sign-in inside embedded web views). It must match NATIVE_APP_MARKER in src/domain/native-app.ts.
  appendUserAgent: "RebaluneApp",
  backgroundColor: "#07111f",
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: true, backgroundColor: "#07111f" },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#07111f", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#07111f" }
  }
};

export default config;
