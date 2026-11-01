# Worker API

One Cloudflare Worker serves the static site (`dist/`, through the `ASSETS`
binding) and a small JSON API on `/api/*` (Hono). `wrangler.jsonc` runs the
Worker first for `/api/*` only; every other path is a plain asset. The
contract is spec section 6.3.

## Files

| File                  | Role                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `index.ts`            | Entry: `/api/*` to the app, the rest to `ASSETS`; wires the real dependencies         |
| `app.ts`              | `createApp({ stripe, mailer, loadCatalog, env, now, limiters })`, routes, rate limits |
| `checkout.ts`         | Request schema, origin check, catalogue checks, `buildSessionParams` (pure)           |
| `orders.ts`           | Session id check, `withLineItems`, 48 h window, `summariseSession`, public view       |
| `webhook.ts`          | Signature check, paid-order handling, e-mails, `emails_sent` mark, error classes      |
| `catalog.ts`          | zod schema of `catalog.json` (checked against `WorkerCatalog` at compile time), cache |
| `stripe.ts`           | Real Stripe client (fetch HTTP client, SubtleCrypto), pinned API version              |
| `email/resend.ts`     | `ResendMailer` (HTTP API, `Idempotency-Key`, 10 s timeout) and `NullMailer`           |
| `email/templates.ts`  | Owner e-mail (French) and customer e-mail (FR or EN), HTML and plain text             |
| `errors.ts`, `log.ts` | `ApiError` and the uniform error body; JSON log lines, e-mail masking, redaction      |
| `shop.ts`             | Shop address, e-mail, phone (mirrors `brand` in `shop.yml`, a test checks)            |

## Endpoints

| Method and path              | Success                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `POST /api/checkout`         | `200 { url }`: redirect the browser to Stripe Checkout    |
| `GET /api/orders/:sessionId` | `200 { status, number, lines, amounts, delivery, email }` |
| `POST /api/webhooks/stripe`  | `200 { received: true }`                                  |
| `GET /api/health`            | `200 { ok: true, version, catalogGeneratedAt }`           |

`POST /api/checkout` takes
`{ locale: 'fr' | 'en', items: [{ sku, quantity }], delivery, acceptedTerms: true }`
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
shipping come from `/catalog.json`, never from the browser.

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
`Idempotency-Key: <event id>:<recipient>`, then sets
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
still answers 200: the e-mails are out. Other event types get 200 without work.

## Rate limiting

Two [Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
bindings in `wrangler.jsonc`, keyed on `CF-Connecting-IP` (a constant key
without it): `CHECKOUT_LIMITER` (10 requests per 60 s on `POST /api/checkout`)
and `ORDERS_LIMITER` (30 per 60 s on `GET /api/orders/:id`). Over the limit
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
localises by `code`; `message` is for developers.

| Status | Code                     | When                                                                   |
| ------ | ------------------------ | ---------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | Bad JSON or schema; `details.issues: [{ path, code, message }]`        |
| 400    | `INVALID_SIGNATURE`      | Webhook signature missing, wrong or older than 300 s                   |
| 403    | `FORBIDDEN_ORIGIN`       | Checkout from another origin                                           |
| 404    | `NOT_FOUND`              | Unknown `/api` path, no such order, or an order older than 48 h        |
| 405    | `METHOD_NOT_ALLOWED`     | Wrong method (`Allow` header set)                                      |
| 409    | `UNKNOWN_SKU`            | `details.skus`                                                         |
| 409    | `OUT_OF_STOCK`           | `details.skus` (stock `out`; `low` passes)                             |
| 409    | `SHIPPING_UNAVAILABLE`   | `details: { method, reason: 'disabled' \| 'no_country' \| 'country' }` |
| 413    | `PAYLOAD_TOO_LARGE`      | Checkout body over 32 KB (webhook: 512 KB)                             |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | Checkout body not `application/json`                                   |
| 429    | `RATE_LIMITED`           | Checkout or orders over the per-IP limit (`Retry-After: 60`)           |
| 500    | `EMAIL_FAILED`           | Webhook: an order e-mail failed (Stripe retries)                       |
| 500    | `INTERNAL_ERROR`         | Unexpected error (logged, never detailed in the response)              |
| 502    | `PAYMENT_PROVIDER_ERROR` | Stripe call failed (message never forwarded)                           |
| 503    | `SHOP_CLOSED`            | `shop.open` is false                                                   |
| 503    | `CATALOG_UNAVAILABLE`    | `/catalog.json` missing or invalid                                     |

## Environment

| Name                    | Kind             | Notes                                                 |
| ----------------------- | ---------------- | ----------------------------------------------------- |
| `ASSETS`                | binding          | `dist/`                                               |
| `CHECKOUT_LIMITER`      | binding          | Rate limit of `POST /api/checkout`, optional          |
| `ORDERS_LIMITER`        | binding          | Rate limit of `GET /api/orders/:id`, optional         |
| `SITE_URL`              | var              | Success and cancel URLs, allowed origin               |
| `ORDER_EMAIL_FROM`      | var              | `Racines en Partage <commandes@racinesenpartage.fr>`  |
| `STRIPE_SECRET_KEY`     | secret           | Without it, Stripe calls fail as 502                  |
| `STRIPE_WEBHOOK_SECRET` | secret           | Without it, every webhook is 400                      |
| `RESEND_API_KEY`        | secret, optional | Without it, `NullMailer` logs a redacted line instead |
| `ORDER_EMAIL_TO`        | secret           | Owner inbox                                           |

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

## Tests

`pnpm test:worker` (vitest, Node, `vitest.worker.config.ts`) runs the real
handlers with a fake Stripe, a fake mailer and the fixture catalogue in
`tests/worker/fixtures.ts`. Webhook tests sign payloads with the real Stripe
SDK and verify them through `stripe.ts`. E-mail snapshots live in
`tests/worker/__snapshots__/`; review the diff, then `pnpm test:worker -u`
when a template change is intended. Type check: `pnpm exec tsc -p worker`.
