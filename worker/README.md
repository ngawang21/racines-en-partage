# Worker API

One Cloudflare Worker serves the static site (`dist/`, through the `ASSETS`
binding) and a small JSON API on `/api/*` (Hono). `wrangler.jsonc` runs the
Worker first for `/api/*` only; every other path is a plain asset. The
contract is spec section 6.3, extended by the iteration 3 spec
(`docs/superpowers/specs/2026-11-08-iteration-3-features-design.md`,
sections 2.1 to 2.3, 2.6 and 5). A daily Cron Trigger sends the review
invitations (`scheduled` in `index.ts`).

## Files

| File                  | Role                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `index.ts`            | Entry: `/api/*` to the app, the rest to `ASSETS`; wires the real dependencies; cron                        |
| `app.ts`              | `createApp({ stripe, mailer, loadCatalog, env, now, limiters, captcha?, audience?, reviewRepo? })`, routes |
| `checkout.ts`         | Request schema, origin check, catalogue checks, `buildSessionParams` (pure)                                |
| `orders.ts`           | Session id check, `withLineItems`, 48 h window, `summariseSession`, public view, lookup                    |
| `forms.ts`            | Contact, stock alert and newsletter handlers, `cleanText`, honeypot, request schemas                       |
| `reviews.ts`          | `POST /api/reviews` (token, session, GitHub commit) and `inviteReviews` (cron)                             |
| `tokens.ts`           | `signToken`, `verifyToken`, `peekToken`: base64url JSON plus HMAC-SHA256 (WebCrypto)                       |
| `yaml.ts`             | `toYaml`: flat mapping, every string quoted in the style Prettier keeps                                    |
| `github.ts`           | GitHub Contents API client (`PUT`, 422 means the file exists)                                              |
| `turnstile.ts`        | Turnstile `siteverify` client, skipped without a secret                                                    |
| `webhook.ts`          | Signature check, paid-order handling, e-mails, `emails_sent` mark, error classes                           |
| `catalog.ts`          | zod schema of `catalog.json` (checked against `WorkerCatalog` at compile time), cache                      |
| `stripe.ts`           | Real Stripe client (fetch HTTP client, SubtleCrypto), pinned API version                                   |
| `email/resend.ts`     | `ResendMailer` (HTTP API, `Idempotency-Key`, 10 s timeout), `NullMailer`, `ResendAudience`                 |
| `email/templates.ts`  | Order e-mails, review invitation, newsletter confirmation, contact and stock alert                         |
| `errors.ts`, `log.ts` | `ApiError` and the uniform error body; JSON log lines, e-mail masking, redaction                           |
| `shop.ts`             | Shop address, e-mail, phone (mirrors `brand` in `shop.yml`, a test checks)                                 |

## Endpoints

| Method and path               | Success                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `POST /api/checkout`          | `200 { url }`: redirect the browser to Stripe Checkout    |
| `GET /api/orders/:sessionId`  | `200 { status, number, lines, amounts, delivery, email }` |
| `POST /api/webhooks/stripe`   | `200 { received: true }`                                  |
| `GET /api/health`             | `200 { ok: true, version, catalogGeneratedAt }`           |
| `POST /api/orders/lookup`     | `200` the same body as `GET /api/orders/:sessionId`       |
| `POST /api/contact`           | `202 { ok: true }`                                        |
| `POST /api/newsletter`        | `202 { ok: true }`                                        |
| `GET /api/newsletter/confirm` | `303` to `/newsletter/?status=ok` (EN `/en/newsletter/`)  |
| `POST /api/reviews`           | `201 { ok: true }`                                        |

`POST /api/checkout` takes
`{ locale: 'fr' | 'en', items: [{ sku, quantity, unitAmount? }], delivery, acceptedTerms: true }`
with `delivery` one of `{ method: 'relay', relay: { id, name, address1, address2?, postcode, city, country, hoursHtml? } }`,
`{ method: 'home' }` or `{ method: 'pickup' }`. The relay `id` is `<CC>-<6 digits>`
and its prefix must equal `relay.country`. `name`, `address1`, `address2` and
`city` accept letters (accents included), digits, spaces and `' - . , / & ( )`
only (typographic apostrophes are folded to `'`), at most 80, 120, 120 and 60
characters; `postcode` is 3 to 10 letters or digits. Anything else is
`400 VALIDATION_ERROR`. Stripe's page shows only the method, the point's name
and city (`custom_text.submit.message`); the full address stays in the
session metadata, and the owner e-mail asks her to confirm the point by its ID
in her Mondial Relay space before printing the label.
The request must come from the same origin (Origin, else Referer: the
`SITE_URL` host or the host serving the request; any localhost origin only
when `SITE_URL` is itself a localhost URL, as in `.dev.vars`), with
`Content-Type: application/json` and at most 32 KB. Prices, stock and
shipping come from `/catalog.json`, never from the browser. `unitAmount` is
the price in cents the page showed; when it differs from the catalogue (a
stale tab, a deploy window, the 60 s catalogue cache) the answer is
`409 PRICE_CHANGED` with the SKUs, never a session at another price.
Stripe returns the customer to `SITE_URL`, or to the `*.workers.dev` host
when the checkout started there (a preview test stays on the preview).
Free shipping is decided on the subtotal before a promotion code: Stripe
applies the code after the shipping option is fixed. Each line item carries
`metadata.sku`, read back by the webhook and the orders endpoint.

`GET /api/orders/:sessionId`: `status` is `paid` (also for a 100 % promotion
code), `pending` (completed, asynchronous payment still processing) or
`unpaid`. `number` is the last 8 characters of the session id, upper-cased.
`amounts` carries `subtotal`, `shipping`, `discount`, `total` (cents) and
`currency`; `email` is masked down to its first character and top-level
domain (`m***@***.com`). A session without this shop's delivery metadata, or
created more than 48 hours ago, is `404 NOT_FOUND`. Lines come from
`listLineItems` (up to 100), not from the 10-line `expand`.

The webhook handles `checkout.session.completed` and
`checkout.session.async_payment_succeeded` once the session is paid. It
retrieves the session and skips it with 200 when `metadata.delivery_method`
is missing (a session of the same Stripe account not created by this shop) or
when `metadata.emails_sent` is `'true'` (already notified). Otherwise it lists
the lines (`listLineItems`, limit 100), sends the owner e-mail (French, to
`ORDER_EMAIL_TO`, reply-to the customer) and the customer e-mail (checkout
language, reply-to `ORDER_EMAIL_TO`), each with
`Idempotency-Key: <event id>:owner` or `<event id>:customer` (by role, so the
owner ordering with her own address still gets two keys), then sets
`metadata.emails_sent = 'true'` on the session (Stripe merges metadata, the
other keys stay). Mailer errors:

- Resend 4xx other than 409 and 429 (a refused address, an unverified
  domain): permanent. Logged with the status as `order.email_refused`,
  counted as done for that recipient; the event still answers 200.
- 409, 429, 5xx, network errors and timeouts: transient. Logged as
  `order.email_failed`, the event answers `500 EMAIL_FAILED` so Stripe
  retries, and the session is not marked; Resend drops the e-mail already
  sent under the same key.

A failure to mark the session is logged (`order.mark_failed`) and the event
still answers 200: the e-mails are out.
`checkout.session.async_payment_failed` (a bank debit that bounced) is logged
as `order.payment_failed` for this shop's sessions and answered 200: nothing
was sent while it was pending. Other event types get 200 without work.

### Forms, reviews and order lookup

Every POST below checks the origin like checkout (403 `FORBIDDEN_ORIGIN`),
takes `application/json` only (415) and at most 16 KB (413). Text a customer
types goes through `cleanText`: HTML tags stripped, control and bidi
characters removed, tabs as spaces, line breaks kept only in messages and
review texts (at most one blank line). E-mail addresses are at most 254
characters.

`POST /api/contact` (`FORMS_LIMITER`):
`{ kind: 'contact' | 'stock_alert', locale, name?, email, message?, sku?, turnstile?, website? }`.
`contact` needs `name` (1 to 80) and `message` (1 to 3000); `stock_alert`
needs `sku` (a catalogue SKU, else 409 `UNKNOWN_SKU`). `website` is the
honeypot: filled, the answer is 202 and nothing is sent. One e-mail to
`ORDER_EMAIL_TO` with reply-to the customer, subject "Message du site de
<name>" or "Alerte de stock : <product> pour <email>", key
`<kind>:<uuid>`. Mail failure: 502 `MAIL_FAILED`. Without `ORDER_EMAIL_TO`:
404 `FEATURE_DISABLED`.

`POST /api/newsletter` (`FORMS_LIMITER`): `{ email, locale, turnstile?, website? }`.
Always 202 once valid (a refused address answers like a sent one; a
transient Resend failure is 502 `MAIL_FAILED`). The confirmation e-mail
links to `<SITE_URL>/api/newsletter/confirm?t=<token>`, token payload
`{ m: email, l: locale, e }`, valid 48 h, and prints
`features.newsletterWelcomeCode` of `catalog.json` when set. Disabled (404
`FEATURE_DISABLED`) without `FORMS_SECRET`, `RESEND_API_KEY` or
`RESEND_AUDIENCE_ID` (logged as `config.missing`), or when
`features.newsletter` is false (the owner's choice, not logged).

`GET /api/newsletter/confirm?t=` (`FORMS_LIMITER`, no origin check): verifies
the token, adds `{ email, unsubscribed: false }` to the audience (Resend's
"already exists" counts as done), then 303 to
`<SITE_URL>/newsletter/?status=ok` (EN `/en/newsletter/`). A bad or expired
token gives `status=invalid` (language read from the unverified payload,
French otherwise); a Resend failure gives `status=error`.

Turnstile (contact and newsletter): `turnstile` is checked with
`siteverify` (`secret`, `response`, `remoteip` from `CF-Connecting-IP`);
failure or outage is 400 `CAPTCHA_FAILED`. Without `TURNSTILE_SECRET_KEY`
the check is skipped.

`POST /api/reviews` (`FORMS_LIMITER`):
`{ token, sku, rating, author, title?, text, locale }`. `rating` is an
integer 1 to 5, `author` 2 to 40 characters, `title` up to 80, `text` 20
to 1200 (`REVIEW_LIMITS` of `src/content/schemas.ts`, measured after
cleaning). The token payload is `{ s: sessionId, k: [sku...], l: locale, e }`
(60 days); a bad signature, an expired token, a SKU outside `k`, or a
session that is gone or not this shop's is 400 `INVALID_TOKEN`. A SKU no
longer in the catalogue is 409 `UNKNOWN_SKU`. `metadata['reviewed_' + sku]`
set, or GitHub answering 422 (the file exists), is 409 `ALREADY_REVIEWED`.
Otherwise the Worker writes
`src/content/reviews/<product slug>--<order number>.yml` on `main` (commit
message `content: avis client sur <slug>`) with `product`, `rating`,
`author`, `locale` (from the token), `date` (the day in Paris), `order`,
`verified: true`, `published: false`, `title`, `text`, `reply: ''`, then
sets the session metadata. A GitHub failure (expired token) is 502
`INTERNAL_ERROR`, logged as `review.github_failed`. Disabled without
`FORMS_SECRET` or `GITHUB_TOKEN`, or when `features.reviews` is false.

`POST /api/orders/lookup` (`ORDERS_LIMITER`): `{ number, email }`. Lists the
100 most recent sessions of that address
(`customer_details.email`; retried once in lower case), keeps the completed
session of this shop whose `orderNumber` equals the number with spaces
removed and upper-cased, and answers the public order, without the 48 h
limit. No match: 404 `ORDER_NOT_FOUND`.

### Review invitations (cron)

`scheduled` runs `inviteReviews` at `0 9 * * *` (UTC). It lists completed
sessions created between 8 and 7 days before the run (100 per page, at most
10 pages), skips those already invited (`metadata.review_invited`), unpaid,
not this shop's or without an e-mail, lists their lines, and sends the
invitation (FR or EN per `metadata.locale`, link `/avis/?t=` or
`/en/review/?t=`, key `<session id>:review`) before setting
`metadata.review_invited = 'true'`. A failed e-mail leaves the session
unmarked and the run goes on. Without `RESEND_API_KEY` or `FORMS_SECRET`
nothing is sent. When `features.reviews` is false (or `catalog.json` cannot
be read) the run logs one line and sends nothing. Remove the `triggers`
block of `wrangler.jsonc` to stop the run itself.

### Owner switches (`features` in `catalog.json`)

`buildCatalog` copies three CMS settings into `catalog.json`:
`features.newsletter` (`newsletter.enabled`), `features.reviews`
(`reviews.enabled`) and `features.newsletterWelcomeCode`
(`newsletter.welcomeCode`, trimmed). The Worker reads them through the same
60 s catalogue cache as prices. A `catalog.json` built before the field
existed parses with everything on and no code.

## Rate limiting

Three [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
bindings in `wrangler.jsonc`, keyed on `CF-Connecting-IP` (a constant key
without it): `CHECKOUT_LIMITER` (10 requests per 60 s on `POST /api/checkout`),
`ORDERS_LIMITER` (30 per 60 s on `GET /api/orders/:id` and
`POST /api/orders/lookup`) and `FORMS_LIMITER` (10 per 60 s on the contact,
newsletter, confirmation and review endpoints). Over the limit
the API answers `429 RATE_LIMITED` with `Retry-After: 60`. The webhook and
`/api/health` are not limited. When a binding is absent (tests, an older
wrangler) the check is skipped; when the limiter itself throws, the request
goes through and `ratelimit.failed` is logged. The binding is free; the
alternative is a Cloudflare WAF rate limiting rule on the same paths. Limits
are per Cloudflare location and approximate, which is enough against a
script hammering Stripe session creation.

Every API response carries `Cache-Control: no-store`,
`Content-Type: application/json; charset=utf-8` and
`X-Content-Type-Options: nosniff`. No CORS headers.

## Errors

Body: `{ "error": { "code", "message", "details?" } }`. The storefront
localises by `code` (`ERROR_KEY` in `src/cart/api.ts`, every code of
`ERROR_CODES` in `errors.ts` mapped, `tests/worker/error-contract.test.ts`);
`message` is for developers.

| Status | Code                     | When                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | Bad JSON or schema; `details.issues: [{ path, code, message }]`        |
| 400    | `INVALID_SIGNATURE`      | Webhook signature missing, wrong or older than 300 s                   |
| 400    | `CAPTCHA_FAILED`         | Turnstile token missing or refused (contact, newsletter)               |
| 400    | `INVALID_TOKEN`          | Review token bad, expired, without that SKU, or its session is gone    |
| 403    | `FORBIDDEN_ORIGIN`       | Checkout from another origin                                           |
| 404    | `NOT_FOUND`              | Unknown `/api` path, no such order, or an order older than 48 h        |
| 404    | `ORDER_NOT_FOUND`        | Lookup: no order of that number for that e-mail                        |
| 404    | `FEATURE_DISABLED`       | Newsletter, reviews or contact without their secrets (logged)          |
| 405    | `METHOD_NOT_ALLOWED`     | Wrong method (`Allow` header set)                                      |
| 409    | `UNKNOWN_SKU`            | `details.skus` (checkout, stock alert, review)                         |
| 409    | `OUT_OF_STOCK`           | `details.skus` (stock `out`; `low` passes)                             |
| 409    | `PRICE_CHANGED`          | `details.skus` (the page showed another `unitAmount`)                  |
| 409    | `ALREADY_REVIEWED`       | That product of that order already has a review                        |
| 409    | `SHIPPING_UNAVAILABLE`   | `details: { method, reason: 'disabled' \| 'no_country' \| 'country' }` |
| 413    | `PAYLOAD_TOO_LARGE`      | Checkout body over 32 KB (forms: 16 KB, webhook: 512 KB)               |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | POST body not `application/json`                                       |
| 429    | `RATE_LIMITED`           | Over a per-IP limit (`Retry-After: 60`)                                |
| 500    | `EMAIL_FAILED`           | Webhook: an order e-mail failed (Stripe retries)                       |
| 500    | `INTERNAL_ERROR`         | Unexpected error (logged, never detailed in the response)              |
| 502    | `INTERNAL_ERROR`         | Reviews: GitHub refused the file (expired token, outage)               |
| 502    | `MAIL_FAILED`            | Contact or newsletter e-mail could not be sent                         |
| 502    | `PAYMENT_PROVIDER_ERROR` | Stripe call failed (message never forwarded)                           |
| 503    | `SHOP_CLOSED`            | `shop.open` is false                                                   |
| 503    | `CATALOG_UNAVAILABLE`    | `/catalog.json` missing or invalid                                     |

## Environment

| Name                    | Kind             | Notes                                                            |
| ----------------------- | ---------------- | ---------------------------------------------------------------- |
| `ASSETS`                | binding          | `dist/`                                                          |
| `CHECKOUT_LIMITER`      | binding          | Rate limit of `POST /api/checkout`, optional                     |
| `ORDERS_LIMITER`        | binding          | Rate limit of the order page and the lookup, optional            |
| `FORMS_LIMITER`         | binding          | Rate limit of the forms and reviews, optional                    |
| `SITE_URL`              | var              | Success and cancel URLs (not on `*.workers.dev`), allowed origin |
| `ORDER_EMAIL_FROM`      | var              | `Racines en Partage <commandes@racinesenpartage.fr>`             |
| `STRIPE_SECRET_KEY`     | secret           | Without it, Stripe calls fail as 502                             |
| `STRIPE_WEBHOOK_SECRET` | secret           | Without it, every webhook is 400                                 |
| `RESEND_API_KEY`        | secret, optional | Without it, `NullMailer` logs a redacted line instead            |
| `ORDER_EMAIL_TO`        | secret           | Owner inbox                                                      |
| `FORMS_SECRET`          | secret           | HMAC key of the review and newsletter tokens                     |
| `GITHUB_TOKEN`          | secret           | Fine-grained, contents read and write on `GITHUB_REPO` only      |
| `GITHUB_REPO`           | var              | `ngawang21/racines-en-partage`                                   |
| `TURNSTILE_SECRET_KEY`  | secret, optional | Without it the captcha check is skipped                          |
| `RESEND_AUDIENCE_ID`    | secret, optional | Newsletter audience; without it the newsletter is disabled       |

Stripe API version: `2026-10-28.endive` (the version stripe 23.1.0 is
generated for; see `stripe.ts`). Update it together with the SDK.

Logs are one JSON object per line (Workers Logs). They carry session ids,
event ids and totals only; keys and e-mail addresses are redacted.

## Local run

```sh
cp .dev.vars.example .dev.vars   # fill test values
pnpm dev:worker                  # astro build && wrangler dev, http://localhost:8787
stripe listen --forward-to localhost:8787/api/webhooks/stripe   # optional, prints whsec_
```

`wrangler deploy --dry-run --outdir out/wrangler` bundles without deploying.
`wrangler dev --test-scheduled` exposes `/__scheduled?cron=0+9+*+*+*` to run
the review invitations by hand.

## Tests

`pnpm test:worker` (vitest, Node, `vitest.worker.config.ts`) runs the real
handlers with a fake Stripe, a fake mailer and the fixture catalogue in
`tests/worker/fixtures.ts` (also a fake Turnstile, audience and repository;
the HTTP clients are tested against a fake `fetch`). Webhook tests sign payloads with the real Stripe
SDK and verify them through `stripe.ts`. E-mail snapshots live in
`tests/worker/__snapshots__/`; review the diff, then `pnpm test:worker -u`
when a template change is intended. Type check: `pnpm exec tsc -p worker`.
