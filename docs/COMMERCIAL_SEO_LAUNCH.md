# Commercial SEO and brand launch checklist

## Public discoverability and crawl safety

1. The chosen working brand is **Wealtharr**. Check UK and international trademarks, similar marks, UK company names, domains, and social handles before any paid brand campaign. An empty exact-name search does not establish exclusive rights.
2. Deploy the canonical HTTPS origin in `NEXT_PUBLIC_APP_URL`. Configure `NEXT_PUBLIC_BRAND_NAME` consistently across public pages; the GitHub repository may remain `9sig`.
3. Keep `PUBLIC_INDEXING_ENABLED=false` until the customer purchase flow, support/legal pages, public claims and HTTPS deployment are reviewed. This makes robots disallow crawling and the pages emit noindex.
4. Only after launch approval set `PUBLIC_INDEXING_ENABLED=true` on the production host; staging remains blocked.
5. Register the public property in Google Search Console and set `GOOGLE_SITE_VERIFICATION` before deploying; submit `/sitemap.xml`. Inspect `/robots.txt` and one public URL with URL Inspection.
6. Confirm that `/admin`, `/app`, `/api` and sign-in/payment/user routes remain non-indexable via X-Robots-Tag and robots exclusions. Avoid exposing users' financial data through public pages or schema.
7. Validate SoftwareApplication structured data with Google's Rich Results Test. Only real price data from published plans may appear as Offer metadata. Never fabricate ratings, testimonials, returns, guarantee claims or product availability.
8. Check Lighthouse/Core Web Vitals on mobile and desktop (LCP, INP, CLS), font handling, alt text where real imagery is used, page interactivity and accessibility. Re-run after introducing a social image.
9. Add GDPR/privacy notice, service contact and tested billing/subscription terms **approved for your actual handling of user data**; these cannot be substituted by generic marketing text.
10. Write a small number of substantive guides tied to the product's audience: examples include "how to keep a rebalance calendar", "how to reconcile execution prices", "rules-based portfolio tracking" and "3x leveraged ETP path dependency". Clearly distinguish methodology explanation from recommending a product or strategy. Do not mass-generate keyword-stuffed finance pages.
11. Audit search analytics and customer onboarding conversion before adding more content. Google does not guarantee rankings or rich results.

## Implemented technical baseline

- Public SEO pages: `/`, `/features`, `/strategies`, `/pricing`, `/faq`.
- App-wide metadata, canonical URLs, descriptive titles, Open Graph/Twitter tags and optional Search Console verification.
- JSON-LD WebSite and SoftwareApplication. The optional Offer is sourced from live configured plan price fields.
- Staging-friendly robots and sitemap; private routes receive X-Robots-Tag: noindex.
- Unit and Playwright tests for core SEO contracts.

## Outstanding verification

- Real production domain and final brand clearance.
- Real public privacy/service terms and appropriate UK product/financial-promotion review.
- Live user journey, broker-fill attribution, reliable price provider, reminders, billings and recovery checks.
- Production Google Search Console domain ownership, sitemap indexing and Core Web Vitals.
