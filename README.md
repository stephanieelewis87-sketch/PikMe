# PikMe

Swipe right to help pay someone's bill.

People upload bills they need help with. Other people swipe through them and
either pass (swipe left) or pay all or part of what's left (swipe right).

The swipe portal is deliberately bias-free: a card shows only the bill's
category, amount, what's left, the due date, and how many people have chipped
in. There are no names, photos, videos, stories, or locations, and the feed is
ordered by due date only. The optional bill document an uploader attaches is
stored privately for verification and is never shown to swipers.

Once a bill is fully paid, the people involved will be able to share their
experience and connect. That social layer is not built yet; paid bills show
where it will live.

## Running it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000 and create an account. Open a second browser
(or a private window) and create another account to act as a different user.

### The database

PikMe stores everything in Postgres.

- **Locally, with no setup:** leave `DATABASE_URL` unset and the app uses
  PGlite, a Postgres that runs inside the app and saves to `data/pglite/`.
- **Hosted:** set `DATABASE_URL` to any Postgres connection string (Neon,
  Supabase, Railway, or your own server). Copy `.env.example` to `.env.local`
  for local use, or add the variable in your hosting provider's settings.

Tables are created automatically on first start (`lib/schema.ts`).

## What's real and what's a placeholder

| Piece | Status in this version |
| --- | --- |
| Bill upload, swipe feed, partial and full payments | Working |
| Payments | Simulated in `lib/payments.ts`; no money moves |
| Accounts | Email and password. Passwords hashed with scrypt (`lib/password.ts`); sign-in sessions in the database (`lib/session.ts`). No password reset or email verification yet |
| Storage | Postgres via `lib/db.ts`; bill documents stored privately in the database |
| Bill verification | Document is stored; nobody reviews it yet |
| Social layer after payment | Placeholder text only |

## Layout

- `app/` pages, server actions (`actions.ts`), and API routes (`api/feed`, `api/swipe`)
- `app/swipe/Deck.tsx` the swipe deck (drag, buttons, or arrow keys)
- `lib/db.ts` all reads and writes; `lib/sql.ts` picks Postgres or PGlite; `lib/schema.ts` the tables
- `lib/types.ts` data model, including `BillCard`, the only bill shape swipers see
