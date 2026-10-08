# Mobile: installable web app and Android / iOS apps

Rebalune is built for phones first, in three layers. Each works without the next.

1. **Responsive web.** Layout, 44 px touch targets, 16 px form text (no iOS zoom), safe-area padding for notches and home bars, and a bottom tab bar on phones.
2. **Installable web app (PWA).** `/manifest.webmanifest`, generated icons (`/pwa-icon/*`), theme colours, an offline screen and a tiny service worker. Users can "Add to Home Screen" today with nothing else to do.
3. **Android and iOS apps.** A [Capacitor](https://capacitorjs.com) shell in `mobile/` that loads the live website. One codebase: every web fix reaches the apps immediately.

## What the service worker will and will not do

It never stores pages, API responses or anything about an account or portfolio. It keeps only the hashed build assets (so the app starts fast) and an offline screen shown when the network is unreachable. Calculations always need a connection so they are never stale.

## Building the apps

You need a Mac with Xcode for iOS and Android Studio for Android; these cannot be generated on a server.

```sh
cd mobile
npm install
export REBALUNE_APP_URL=https://app.yourdomain.com   # the deployed site (https only)
export REBALUNE_APP_ID=com.yourcompany.rebalune       # reverse-domain id, also entered in Admin > Settings > Mobile apps
export REBALUNE_APP_NAME=Rebalune
npm run add:android && npm run add:ios                # once; commit the generated android/ and ios/ folders
npm run assets                                        # icons + splash from mobile/resources/icon.png (1024 px) and splash.png (2732 px)
npm run sync && npm run open:android                  # or open:ios
```

### Make website links open in the app

In **Admin > Settings > Mobile apps** enter:

| Setting | Where to find it |
|---|---|
| Android package name | the `applicationId` (same as `REBALUNE_APP_ID`) |
| Android signing certificate fingerprint(s) | Play Console > App integrity (Play App Signing key; add your upload key while testing) |
| Apple team ID, iOS bundle ID | Apple Developer account membership; the iOS bundle ID (same as `REBALUNE_APP_ID`) |

The site then serves `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` (404 until set). Only `/app/*` opens in the app; marketing pages stay in the browser. In Xcode add the *Associated Domains* capability `applinks:app.yourdomain.com`; Android needs an `autoVerify` intent filter for the same host.

## Behaviour inside the apps (set by the user-agent marker `RebaluneApp`)

- **No purchase buttons and no checkout.** Apple and Google require their own in-app purchase systems for digital subscriptions sold inside an app. The apps show the current plan and say plans are managed on the website; `/api/billing/checkout` answers 403 to the apps. *Decide with your own advice whether to add native in-app purchases or keep website-only billing before submitting.*
- **Google sign-in button hidden.** Google blocks OAuth inside embedded web views. Email/password and Sign in with Apple still work. The proper fix is the native Google Sign-In plugin (a follow-up).
- **Sign in with Apple is mandatory on iOS** if any third-party sign-in (Google) is offered anywhere in the app; keep both configured in Admin > Settings > Sign-in providers.

## Before submitting to the stores (checklist)

- Privacy policy and terms live on the public site (Admin > Launch sign-offs).
- Apple's App Privacy and Google's Data safety forms match what the app collects (email, portfolio entries, notification webhook).
- Financial-services category rules: Apple requires the developer be a legal entity for finance apps in many regions; Google requires a declaration for finance apps. Check the current requirements for where you operate.
- Test on real devices: sign-in (password, two-step, Apple), install, offline screen, deep links, rotate/keyboard behaviour.
- Push notifications are not included yet (alerts go by email and Discord). Native push would add `@capacitor/push-notifications` plus a server-side sender.
