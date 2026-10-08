import crypto from "node:crypto";
import {isNativeApp} from "@/domain/native-app";

// A coarse description of where a sign-in came from: browser and operating system only. Coarse on
// purpose: a browser update must not look like a new device, and nothing identifying is kept.
export type DeviceSummary = { browser: string; os: string; label: string; key: string };

export function summarizeUserAgent(userAgent: string | null | undefined): DeviceSummary {
  const ua = userAgent ?? "";
  const native = isNativeApp(ua);
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  const browser = native ? "the app"
    : /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "an unknown browser";
  const label = browser === "the app" ? `the Wealtharr app on ${os}` : `${browser} on ${os}`;
  const key = crypto.createHash("sha256").update(`${browser}|${os}`).digest("hex").slice(0, 32);
  return { browser, os, label, key };
}
