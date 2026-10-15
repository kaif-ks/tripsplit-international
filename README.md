# TripSplit International

Production-ready app for splitting travel expenses across multiple currencies without FX conversion. Each expense uses one currency, while each trip can contain many currencies.

## What Is Implemented

- Email/password authentication
- Multiple trips and groups
- Roles: owner, admin, member
- Shareable trip code and manual join link
- Expenses with:
	- one currency per expense
	- multiple payers
	- split modes: equal, percentage, exact, shares
	- negative expense support for refunds
- Per-currency balance computation
- Settlement transfer suggestions with simplify toggle
- Partial settlement recording
- Trip setting: lock new expenses after settlement starts
- Receipt upload flow for image/PDF (no OCR)
- CSV export for trip expenses
- Responsive web UI

## Stack

- Next.js 16 (App Router)
- TypeScript + Tailwind CSS
- PostgreSQL (Neon recommended)
- Drizzle ORM + drizzle-kit
- S3-compatible receipt storage (Cloudflare R2 recommended free option)

## Why Cloudflare R2 For Free Storage

For this product, Cloudflare R2 is usually the best free/low-cost starting option:

- S3-compatible API (works with standard SDKs)
- No egress charges to the public internet in common scenarios
- Simple bucket + key model for receipts
- Good fit for image/PDF uploads

## Environment Variables

Copy [.env.example](.env.example) to `.env` and fill values:

- `DATABASE_URL` Neon Postgres connection string
- `JWT_SECRET` long random secret
- `APP_URL` app base URL, for join links
- `S3_ENDPOINT` R2/S3 endpoint URL
- `S3_REGION` usually `auto` for R2
- `S3_BUCKET` bucket name
- `S3_ACCESS_KEY_ID` storage access key
- `S3_SECRET_ACCESS_KEY` storage secret key
- `S3_PUBLIC_BASE_URL` optional public base URL for files

## Setup

1. Install dependencies

```bash
npm install
```

2. Generate and apply migrations

```bash
npm run db:generate
npm run db:migrate
```

3. Run dev server

```bash
npm run dev
```

4. Open http://localhost:3000

## Build Validation

```bash
npm run lint
npm run build
```

## Data Model Highlights

Core tables:

- `users`
- `trips`
- `trip_members`
- `expenses`
- `expense_payers`
- `expense_splits`
- `settlements`
- `receipts`

Migrations are generated in [drizzle](drizzle).

## Notes

- Owners/admins share the trip code or join link manually. No email invite system is required.
- Receipt uploads are presigned URL uploads, then persisted by metadata confirmation API.
- No FX conversion is performed; balances and transfers are always computed per original currency.
