# Quest Board: web app

The MVP application. See the [project README](../README.md) for an overview and [`../docs`](../docs) for the specs.

```bash
npm install
npm run dev        # http://localhost:3000 (DB auto-seeded at data/questboard.db)
npm test           # unit tests
npm run test:e2e   # build + Playwright end-to-end tests
```

Demo login: `player@questboard.test` / `gm@questboard.test`, password `password123`.

Key files:
- `src/lib/policy.ts`: business rules (bookability, cancellation, IDR formatting). No payments: players pay GMs directly
- `src/lib/i18n/dict.ts`: every UI string in Bahasa Indonesia and English
- `src/lib/validation.ts`: form validation
- `src/lib/schema.ts`: database schema
- `src/lib/queries.ts`: read queries
- `src/app/actions.ts`: all mutations (server actions)
