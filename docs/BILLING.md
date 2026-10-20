# Billing

How WAFLO collects subscription payments, and how to change who collects them.

## The constraint

**Stripe does not support Jamaica as a merchant country.** As of 2026 a Jamaican
company cannot open a Stripe account, no matter how complete the website is. The
same applies to Square and, in practice, to most card processors that require a
local legal entity.

The important distinction: the restriction is on where **you** are, not where
your **customers** are. A Jamaican customer can pay a Stripe checkout all day.
What you cannot do is *hold* the Stripe account from Jamaica.

That splits the problem in two, and they need different answers:

1. **Who is the merchant of record** — the entity that receives the money.
2. **Who is the processor** — the company that moves the money.

## The architecture

Entitlement is already decoupled from payment collection. The platform decides
what a tenant may do based on its own `subscriptions` row, never on a provider's
state:

```
billing/
  types.ts                        PaymentProvider contract + BillingEvent union
  events.ts                       applyBillingEvent() — the only writer of
                                  subscription status and the payments ledger
  paymentRequests.service.ts      Offline payment requests (bank transfer)
  providers/
    stripe.provider.ts            Card processor adapter
    manual.provider.ts            Offline adapter, confirmed by a platform owner
  index.ts                        Registry: getPaymentProvider()
```

Every provider translates its own webhook payload into the same normalized
`BillingEvent` shapes. `applyBillingEvent()` then does the platform-side work
identically for all of them — activate the subscription, open the grace
period, record the payment.

```
Stripe webhook ─┐
                 ├─► provider adapter ─► BillingEvent ─► applyBillingEvent ─► subscriptions / payments
Manual confirm ─┘
```

Consequences of this shape:

- Swapping a processor does not touch the entitlement, quota, trial, grace
  period or reporting logic — none of it ever knew which processor was in use.
- `payments.provider` already stores which processor took the money, so revenue
  can be reported per processor.
- A provider that fails to deliver a webhook cannot silently grant access:
  entitlements only move on a confirmed event.

`subscription.service.ts` contains no provider references at all. That was
already true before this refactor — the previous work was to stop the routes
and the webhook handler from assuming Stripe.

## Configuration

`BILLING_PROVIDER` selects the provider. Leave it blank and the platform uses
Stripe when `STRIPE_SECRET_KEY` is present and offline billing otherwise, so a
fresh deployment can always take money.

```bash
BILLING_PROVIDER=manual      # offline bank transfer
BILLING_PROVIDER=stripe      # hosted checkout + customer portal
```

Offline billing also needs the account details shown to the customer:

```bash
BILLING_ACCOUNT_NAME=ROLINJ.IO
BILLING_ACCOUNT_NUMBER="50575 010850444"
BILLING_BANK_NAME="Bank of Nova Scotia Jamaica"
BILLING_PAYMENT_EMAIL=premtrade_ja@outlook.com
BILLING_PAYMENT_PHONE=+1-876-799-8637
BILLING_RENEWAL_WINDOW_DAYS=7
```

**Quote any value that contains a space.** Bank details are the obvious case,
and an unquoted value broke the deploy: the migration runner used to source the
env file as shell, so `BILLING_ACCOUNT_NUMBER=50575 010850444` made bash try
to run `010850444` as a command and abort under `set -e`. The runner now reads
the file instead of executing it, and quoting is still the right habit.


Only `BILLING_PAYMENT_EMAIL` is required for the provider to be considered
configured. If the account number is missing, the Billing page tells the
customer that our team will send them the details, and the server logs a
warning at startup.

## The offline flow

1. The customer picks a plan on the Billing page.
2. The platform creates a `payment_requests` row with a reference (`WAF-XXXXXXXX`)
   and returns the Billing page with that reference.
3. The customer sees the bank details and the reference, and pays however they
   like — transfer, PayPal invoice, or cash for a local customer.
4. A platform owner opens **Owner → Subscription Management**, sees the request
   in the "Payment requests awaiting confirmation" table, and confirms it.
5. Confirmation emits `subscription.activated` and `payment.succeeded`, so the
   tenant is activated through exactly the same code path a card payment uses.

The Billing page also shows the customer's own payment history — every request
and every payment received — so they can reconcile without emailing you.

### The renewal lifecycle

A card processor tells us when a subscription renews. Offline billing has to
manage that itself, otherwise a customer pays once and keeps access forever.
The `runOfflineBillingLifecycle()` job runs hourly alongside the trial jobs and
does four things:

| Stage | What it does |
|---|---|
| **Renewal request** | Within `BILLING_RENEWAL_WINDOW_DAYS` (default 7) of the paid period ending, raises a payment request for the next period — unless one is already pending. The customer is emailed if mail delivery is configured. |
| **Scheduled cancellations** | Applies any cancellation the customer requested, once the period they paid for has actually ended. |
| **Past due** | When the paid period ends unpaid, moves the subscription to `past_due` and opens the standard grace period. A bank transfer can legitimately be in flight, so nobody is cut off the moment the period rolls over. |
| **Expired** | When the grace period ends unpaid, expires the subscription. |

Only subscriptions billed offline are touched. Processor subscriptions are
driven by their own webhooks and are excluded by design — they are identified
by `subscriptions.metadata->>'provider' = 'manual'`.

### Self-service cancellation

Customers can cancel from the Billing page without emailing anyone. The
cancellation is scheduled for the end of the period they have already paid for
(`subscriptions.cancel_at_period_end`), and the provider is asked to match where
it supports that. "Keep my subscription" undoes it.

### What you have to do by hand

- **Confirm each payment.** There is no automatic reconciliation — a platform
  owner confirms each transfer once it arrives.
- **Renewals are per customer.** The job raises the request; you still confirm
  it.

Everything else — activation, grace periods, expiry, cancellation, reporting —
runs without a human.

## How customers are told

**WhatsApp first, email second.** WAFLO's customers are WhatsApp businesses and
the platform already holds a WhatsApp connection for every tenant, so a renewal
request goes out over the tenant's own WhatsApp connection to their phone. That
costs a fraction of an email and gets read, because the owner is already
holding the phone.

The recipient is the business's admin or manager (from `staff_users.phone`),
falling back to the business contact. If there is no usable phone, or the
WhatsApp send fails, it falls back to email. If both fail, the request is still
visible on the Billing page — the notification is a convenience, not the
system of record.

This means **email is not on the critical path for collecting money.**

## Email providers

Email is still used for trial reminders, welcome messages and platform
notifications. The provider is a deployment choice, not a code choice:

```bash
EMAIL_PROVIDER=sendgrid   # default, 100/day free
EMAIL_PROVIDER=resend     # 3,000/month free
EMAIL_PROVIDER=smtp2go    # 1,000/month free, 200/day, never expires
EMAIL_PROVIDER=brevo      # 300/day free
EMAIL_PROVIDER=console    # writes to the log, sends nothing
```

Set the key for whichever you pick (`SENDGRID_API_KEY`, `RESEND_API_KEY`,
`SMTP2GO_API_KEY`, `BREVO_API_KEY`) and a verified sender
(`SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`).

**SendGrid is not required.** For a platform this size, any of the free tiers is
more than enough — SMTP2GO's never-expiring 1,000/month plan and Resend's
3,000/month are both comfortably above what trial reminders and renewals will
use for a long time.

One thing that applies to all of them: the sender should be a domain you control
with **SPF and DKIM** set up, or the mail will land in junk.

**If you do not own a domain yet** — WAFLO is served from a `*.vercel.app`
subdomain, and you cannot add SPF or DKIM records for one: `vercel.app` is
Vercel's DNS, not yours. So the domain-based path is closed until you buy a
name. Your options without one:

| Option | Domain needed | Cost | Notes |
|---|---|---|---|
| **SMTP2GO** | No | Free, 1,000/month forever | HTTP API, already implemented — set `EMAIL_PROVIDER=smtp2go` and `SMTP2GO_API_KEY`. You can send as `premtrade_ja@outlook.com` without verifying a domain. |
| **Brevo** | No (verify a mailbox) | Free, 300/day | Adds a "Sent with Brevo" sticker and rate-limits unverified senders hard until you verify. |
| **Your own Outlook mailbox over SMTP** | No | Free | Sends as a real person's address, which is arguably better trust for a solo founder's product. Needs an SMTP client library. |
| **Amazon SES** | No (verify a mailbox) | ~$0.10 per 1,000 | Cheapest at volume, but needs an AWS account and either an SDK or an SMTP client. |
| **Resend, Postmark, SES with a domain** | Yes | Varies | The good path — but needs a name you own. |

**A domain is worth buying.** Around $12 a year for a `.com` (or a `.com.jm` /
`.co.jm`, which suits the market), and it fixes several things at once: SPF
and DKIM for real email, a brand that is not `waflo.vercel.app` on a product
that asks a business to hand over their WhatsApp number, and correct
`FRONTEND_URL` / canonical URLs without depending on a Vercel subdomain. Treat
it as marketing spend, not just mail infrastructure.

## Processor options

### Option A — Merchant of record (recommended)

A MoR is the legal seller of your product. It handles sales tax, fraud, chargebacks
and refunds, and pays you out. You never touch the card networks.

**Polar** (polar.sh) is the strongest fit for a Jamaican business. It runs on
Stripe Connect Express, which supports Jamaica for payouts, and it answers the
exact question this situation raises:

> *Stripe isn't available in my country. Can I still use Polar?* — Yes. As the
> Merchant of Record, Polar takes care of charging customers, so Stripe
> Payments doesn't need to be available in your country.

It covers Jamaica, the Dominican Republic, Guyana, Barbados, The Bahamas,
Trinidad and Tobago and Antigua, supports subscriptions and usage-based
billing, and settles to a Jamaican bank account. Payouts need a Stripe Connect
Express account with a bank account in the same country and currency.

**Paddle** is the other serious MoR and it supports selling into Jamaica
(`JM | Jamaica | USD | Exclusive` tax) and the rest of the Caribbean. Confirm
your own seller-country eligibility before committing.

MoR pricing is typically around 5% + a fixed fee, with a surcharge on
non-domestic cards.

### Option B — Jamaican processor

Processors that onboard Jamaican businesses directly:

| Provider | Notes |
|---|---|
| **HandyPay** | Jamaican platform whose processing is provided by Stripe. Supports subscriptions, payment links and an API, JMD and USD, payout to a Jamaican bank account. ~4.9% + $0.40. |
| **eZeePayments** | Jamaican gateway for local and international cards, JMD and USD, free withdrawal. Confirm recurring-billing support before adopting. |
| **NCB / Scotiabank** (First Atlantic Commerce) | Bank merchant gateways, 2–4 week approval, roughly 2.5–3.5%. Strong local trust, weaker API. |
| **Amber Pay** | Kingston-based payment gateway. |
| **PayPal** | Available in Jamaica, USD only, 4.4% + fixed fee plus FX, and local accounts carry long-standing withdrawal restrictions. |

The selection criterion that matters is not fees — it is **tokenised recurring
charges and webhooks**. Without those there is no subscription: you would have
to collect manually every month, which is not a business.

### Option C — A supported-country entity

Form a US LLC (Delaware) or UK Ltd, open a local bank account, and use Stripe
directly. The existing `stripe.provider.ts` works unchanged.

This is a legal and tax decision, not a technical one. It means annual filings
in two jurisdictions, a second set of books, and usually a registered agent
and US tax filings for a foreign-owned LLC (Form 5472 with pro-forma Form
1120). It is reasonable once revenue justifies it. It is not a week-one step,
and it does not solve the buyer's experience: a Jamaican roofer paying USD to
a US entity still pays foreign-card fees and sees no local trust.

### Option D — Offline (implemented)

Bank transfer confirmed by a platform owner. It works today, needs no
application or relationship, and is the right answer for the first handful of
design partners.

## Pricing implication

Plan prices are currently USD ($79 / $199 / $399). A Jamaican customer paying a
foreign merchant in USD pays a foreign-currency surcharge on top of the
processing fee, which pushes the effective cost above the sticker price and
raises the decline rate on small cards.

For the local market, quoting in JMD is materially easier to accept. When a
Jamaican processor is in place, consider adding JMD-denominated plans and
displaying JMD as the primary price with USD secondary. The `plans` table
already carries a `currency` column per plan, and `plan_changes` records the
transition, so this is a catalogue change rather than a code change.

## Adding another provider

1. Create `backend/src/services/billing/providers/<name>.provider.ts`.
2. Implement `PaymentProvider`: `isConfigured`, `createCheckoutSession`,
   `createCustomerPortalSession`, `cancelSubscription`, `resumeSubscription`,
   and optionally `handleWebhook`.
3. Translate the provider's webhook payloads into `BillingEvent`s and call
   `applyBillingEvent`. Do not write to `subscriptions` or `payments` directly —
   that is what keeps behaviour identical across providers.
4. Register it in `backend/src/services/billing/index.ts`.
5. Set `BILLING_PROVIDER=<name>`.

No change is needed to entitlements, quotas, trials, grace periods, reporting,
the owner dashboard or the customer-facing Billing page.
