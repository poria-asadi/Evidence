# Evidence Flow

A web app for systematic review workflows, including reference imports, duplicate detection, screening, and full-text PDF review.

## Run locally

Requires Node.js 22.13+ and pnpm.

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm dev
```

Open `http://localhost:3000/`. New accounts require a name, field and level of study, username, email, password, and a six-digit email verification code. Verification starts a one-review demo with no time limit. Returning users can sign in with their username or email and password. Accounts and sessions are stored in D1. Set `OPENROUTER_API_KEY` in `.dev.vars` to use the AI screening features.

To send verification codes, configure `RESEND_API_KEY`, `VERIFICATION_EMAIL_FROM` (an address on a verified sending domain), and a private `AUTH_CODE_SECRET` of at least 32 characters in `.dev.vars` or the deployed environment. The application rejects new signups when these are missing; it does not expose verification codes locally. Codes expire after 10 minutes and allow five attempts. New code requests are limited to one per minute per email. Existing username/password accounts continue to work, including accounts without a verified email.

For an existing local D1 database created before username/password accounts, back it up and apply the new migration once:

```bash
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0012_steady_jocasta.sql
```

For a local D1 database that already has username/password accounts, back it up and apply `drizzle/0013_glorious_sleepwalker.sql` once. For a fresh D1 database, apply all `drizzle/*.sql` migrations in order instead. Do not replay migrations already applied. Existing ChatGPT-identity reviews remain in their original user records and are not assigned to a new account automatically.

Credit purchasing is not connected. Demo accounts can create one review. Import and deduplication are not limited by the demo; AI use is limited to 25 unique title/abstract articles, 5 unique full-text articles, and 1 unique extracted article per account. A repeated attempt on the same article uses the same slot. The server records slots in `demo_ai_uses` so template changes, PDF replacement, and repeated batches do not restore the allowance. AI actions stop when the corresponding allowance is full. A payment provider, an approved rate policy for paid charges, a wallet transaction ledger, and product-wide access rules still need to be designed and connected before paid access can work.

Every OpenRouter HTTP response is recorded in `ai_usage_events` with the account ID, operation, response ID, model, status, and reported `usage.cost` (USD nanodollars). Requests with no reported cost remain unpriced; they must not be treated as free. `/api/account/usage` returns the signed-in researcher's request count, measured OpenRouter cost, and wallet balance in IRT. The wallet starts at 0 IRT. No user can add funds or spend funds yet. The intended charge formula is `ceil(OpenRouter cost USD × 1.20 × recorded USD/IRT rate)` per request, tested with the 10 USD × 270,000 IRT example. An approved rate policy for paid charges, payment gateway, verified top-up webhook, and atomic balance debits are still required before charging users. Do not apply a current exchange rate retroactively to prior requests.

For a local database that already has email verification, back it up and apply `drizzle/0014_cynical_iron_patriot.sql` once. A hosted database needs both `0013` and `0014` after the preceding migrations, in order.

## USD/IRT reference rate

The signed-in-only `GET /api/fx/usd-irt` endpoint fetches the Tehran free-market USD rate from NerkhAra's public HTTPS JSON API. It accepts only an `usd` quote in `IRT` with `stale: false`, a source timestamp no older than 30 minutes, and a valid price. Successful quotes are cached for five minutes and saved in `fx_rate_snapshots` with the source, exact rate to three decimal places, source timestamp, fetch timestamp, and method. The API response links to NerkhAra as required by its free commercial-use terms. An outdated or invalid primary rate returns 503; no fallback rate is silently substituted.

If `NETARZ_FX_API_KEY` is set privately, the same endpoint also fetches NetArz's USD `mid` quote as an optional comparison. NetArz's free rate has a 15-minute delay and is based on Iranian tether-market prices; its key must be authorized for the deployment's server IP or domain. A difference over 5% is flagged. No NetArz account or key is needed for the primary source.

The FX endpoint displays a reference rate and records snapshots. It does not yet debit wallets: payment top-ups, a wallet transaction ledger, rate-source policy for paid charges, and atomic debits are still required. For an existing local D1 database, back it up and apply `drizzle/0015_lazy_miss_america.sql` once; hosted databases need this migration after `0014`.

For an existing database, back it up and apply `drizzle/0016_grey_rachel_grey.sql` after `0015`. This removes the old time-based subscription field, converts existing trial accounts to demo accounts, and records surviving prior AI assessments as used demo slots. Existing reviews remain intact. Older AI work whose assessment rows were previously deleted cannot be reconstructed from the usage ledger because it does not store article IDs.

Password recovery uses the same `RESEND_API_KEY` and `VERIFICATION_EMAIL_FROM` settings as signup email. Set `APP_PUBLIC_URL` to the public site origin so reset links point to the correct deployment. Apply `drizzle/0017_password_reset_tokens.sql` after `0016` before enabling the new recovery pages. Reset links expire after 30 minutes, can be used once, and invalidate existing sessions after a password change.

## Repository contents

The application code, database schema and migrations, configuration, lockfile, and required browser PDF runtime assets are committed. Dependencies, build output, local databases, temporary files, and real environment values are excluded.
