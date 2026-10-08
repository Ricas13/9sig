# Mobile: installable web app and Android / iOS apps

Wealtharr is built for phones first, in three layers. Each works without the next.

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
export WEALTHARR_APP_URL=https://app.yourdomain.com   # the deployed site (https only)
export WEALTHARR_APP_ID=com.yourcompany.wealtharr       # reverse-domain id, also entered in Admin > Settings > Mobile apps
export WEALTHARR_APP_NAME=Wealtharr
npm run add:android && npm run add:ios                # once; commit the generated android/ and ios/ folders
npm run assets                                        # icons + splash from mobile/resources/icon.png (1024 px) and splash.png (2732 px)
npm run sync && npm run open:android                  # or open:ios
```

### Make website links open in the app

In **Admin > Settings > Mobile apps** enter:

| Setting | Where to find it |
|---|---|
| Android package name | the `applicationId` (same as `WEALTHARR_APP_ID`) |
| Android signing certificate fingerprint(s) | Play Console > App integrity (Play App Signing key; add your upload key while testing) |
| Apple team ID, iOS bundle ID | Apple Developer account membership; the iOS bundle ID (same as `WEALTHARR_APP_ID`) |

The site then serves `/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` (404 until set). Only `/app/*` opens in the app; marketing pages stay in the browser. In Xcode add the *Associated Domains* capability `applinks:app.yourdomain.com`; Android needs an `autoVerify` intent filter for the same host.

## Behaviour inside the apps (set by the user-agent marker `WealtharrApp`)

- **Subscriptions: both ways.** Inside the apps, plans are bought with the App Store / Google Play (see *In-app purchases* below); the website checkout is never offered there and `/api/billing/checkout` answers 403 to the apps. On the website, plans are bought with Stripe. A person is billed by exactly one of them at a time, and either one works in the app and on the web.
- **Google sign-in button hidden.** Google blocks OAuth inside embedded web views. Email/password and Sign in with Apple still work. The proper fix is the native Google Sign-In plugin (a follow-up).
- **Sign in with Apple is mandatory on iOS** if any third-party sign-in (Google) is offered anywhere in the app; keep both configured in Admin > Settings > Sign-in providers.

## In-app purchases (App Store and Google Play) alongside website billing

How it works: the app shows the store's own purchase sheet (through [RevenueCat](https://www.revenuecat.com)'s Capacitor plugin). RevenueCat checks the receipt with Apple/Google and notifies the server at `/api/billing/store/webhook`; only that notification changes a plan. Nothing the phone sends can grant access, so a modified app gains nothing.

Rules enforced on the server (tested in `tests/db/store-webhook.test.ts`):

- One biller at a time. A store purchase **never replaces a live website subscription**, and a new website subscription never replaces a live store one (it is cancelled as a duplicate and flagged for refund review). A conflicting purchase is recorded in the audit log as `billing.store-needs-review` for a person to resolve (refund one of them).
- The plan comes only from your product mapping (**Admin > Plans > Plan price by currency**: App Store / Google Play product ID). Unknown products are refused.
- Replayed and out-of-order notifications are ignored; an expiry only ends the subscription it belongs to; a refund ends access immediately.
- Sandbox (test) purchases are free to make, so they are refused unless **Accept test purchases** is on. Keep it off on the live site.
- Cancellation keeps access to the end of the paid period; a billing problem keeps access (past due) like the website does; expiry returns the account to the free plan and pauses strategies over its limit.
- On the website, someone billed by a store sees where to manage it; the billing portal and checkout refuse them.

Setup (a person must do this; it cannot be tested without store accounts):

1. In App Store Connect and Play Console create the subscription products (one per plan and cadence) and subscription groups.
2. In RevenueCat create a project, add the iOS and Android apps, import the products, add them to a *current* offering, and copy the public SDK keys (`appl_...`, `goog_...`).
3. In RevenueCat > Integrations > Webhooks add `https://<your domain>/api/billing/store/webhook` with an Authorization header value of your choice.
4. In **Admin > Settings > Mobile app purchases** enter the same authorization value and the two public SDK keys. In **Admin > Plans** enter each price's store product IDs.
5. Build the apps (`cd mobile && npm install && npm run sync`; the RevenueCat plugin is already listed) and test with TestFlight / Play internal testing after turning **Accept test purchases** on temporarily.
6. Check: buy, renew, cancel, expire, restore purchases, and a user who already subscribed on the website (the app should only offer to manage it there).

What is not covered: the purchase sheet itself runs only on a device and has not been exercised here; RevenueCat's fee and the stores' commission apply; Apple's rules on mentioning cheaper web prices inside an app vary by region, so the app deliberately does not link to or advertise the website checkout.

## Before submitting to the stores (checklist)

- Privacy policy and terms live on the public site (Admin > Launch sign-offs).
- Apple's App Privacy and Google's Data safety forms match what the app collects (email, portfolio entries, notification webhook).
- Financial-services category rules: Apple requires the developer be a legal entity for finance apps in many regions; Google requires a declaration for finance apps. Check the current requirements for where you operate.
- Test on real devices: sign-in (password, two-step, Apple), install, offline screen, deep links, rotate/keyboard behaviour.
- Push notifications are not included yet (alerts go by email and Discord). Native push would add `@capacitor/push-notifications` plus a server-side sender.

Existing native shells using the `RebaluneApp` marker remain recognised for checkout protection. If an app version is already published, do not change its signed package/bundle ID during a cosmetic rebrand. The new `WEALTHARR_APP_*` build variables take precedence; the previous `REBALUNE_APP_*` values remain accepted for existing build environments.
