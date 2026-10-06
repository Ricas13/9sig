# Billing and entitlements

Stripe handles payment collection; Plan and Subscription records control application access.

The canonical entitlement service loads the current plan and enforces limits server-side. Free, Investor and Pro are seed data rather than conditional branches scattered through the application.

Initial seed:
- Free: 1 active strategy, in-app actions, history, reconciliation, resume, community
- Investor: 3 active strategies plus Email / Discord and analytics entitlements
- Pro: unlimited active strategies plus advanced feature flags

Stripe Price IDs are fields on plans and are configured administratively.
