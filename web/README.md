# Quest Board: web app

The Next.js app. The [project README](../README.md) has the overview, and [`../docs`](../docs) has the specs.

```bash
npm install
npm run dev        # http://localhost:3000 (the database is created with demo data at data/questboard.db)
npm test           # unit tests
npm run test:e2e   # production build + Playwright end-to-end tests
```

Demo logins: `player@questboard.test`, `gm@questboard.test` and `admin@questboard.test`, all with the password `password123`.

## Where things live

| Path | What |
|---|---|
| `src/app/actions.ts` | Every change a user can make (server actions): auth, games, bookings, chat, questions, moderation… |
| `src/app/**/page.tsx` | Pages; route handlers are in `src/app/api/` (games API, `.ics` files, calendar feed, reminders cron, earnings CSV) |
| `src/lib/policy.ts` | Business rules: who can book or cancel, IDR formatting, rate-limit IP and redirect safety helpers |
| `src/lib/validation.ts` | Form parsing and validation, and the list of game systems |
| `src/lib/categories.ts` | Genres, play styles and mechanics |
| `src/lib/queries.ts` | Read queries |
| `src/lib/schema.ts` · `src/lib/migrations.ts` | Database schema and the versioned migrations that upgrade it |
| `src/lib/i18n/dict.ts` | Every piece of interface text in English and Bahasa Indonesia |
| `src/lib/reminders.ts` · `waitlist.ts` · `questions.ts` · `earnings.ts` · `calendar.ts` | Feature logic |
| `src/proxy.ts` | `/en` and `/id` language addresses |
| `scripts/` | `admin.mjs`, `db-backup.mjs`, and the icon and art generators |
| `tests/unit/` · `tests/e2e/` | `node:test` unit tests and Playwright tests (the `seeded` and `empty` projects) |

There are no payments in the app: players pay GMs directly.
