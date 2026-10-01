# Quest Board: agent guide

Quest Board is a bilingual (English default / Bahasa Indonesia) board where players in **Indonesia** find tabletop RPG games and reserve seats with Game Masters.

- **No payments and 0% commission.** Players pay GMs directly.
- Prices are in whole Rupiah.
- The app is a Next.js 16 + SQLite MVP in `web/`. Product and engineering specs for humans are in `docs/`.

## Always-loaded context
@MEMORY.md
@CONVENTIONS.md

## Read before you work on…
| Task | Read |
|---|---|
| Anything structural: new route, table, action, data flow | [ARCHITECTURE.md](ARCHITECTURE.md) |
| UI, copy, icons, colours, layout, accessibility | [DESIGN.md](DESIGN.md) |
| Writing or running tests, verifying a change, screenshots | [TESTING.md](TESTING.md) |
| "What should we improve next?" / picking up backlog work | [IMPROVEMENTS.md](IMPROVEMENTS.md) |
| Next.js APIs of any kind | `web/AGENTS.md`, which points at the version-matched docs in `web/node_modules/next/dist/docs/` |
| Product rules in depth (roles, reservations, visibility) | `docs/03-functional-spec.md` |

## Commands (run in `web/`)
```bash
npm run dev          # http://localhost:3000 — DB auto-created + seeded at web/data/questboard.db
npm run typecheck    # tsc; also fails on missing/unknown translation keys and icon names
npm run lint
npm test             # node:test unit suite (tests/unit)
npm run test:e2e     # next build + Playwright (tests/e2e) on :3100 with a fresh data/e2e.db
npm run icons        # regenerate the Flaticon icon subset after editing src/lib/icons.ts
npm run placeholders # regenerate demo cover art + GM portraits (public/images) from src/lib/placeholders.ts
npm run db:reset     # delete local DB; re-seeded on next request
```
Demo logins all use `tavern-demo-42`: `player@questboard.test`, `gm@questboard.test`, `admin@questboard.test`.

## Definition of done
Before saying a change is finished, all of these must be green:
1. `npm run typecheck && npm run lint && npm test`
2. `npm run test:e2e` for anything user-facing.
3. UI changes look right in **both languages** and **both themes**: take a screenshot (see TESTING.md).
4. New UI strings are added to **both** `en` and `id` in `src/lib/i18n/dict.ts`.
5. `docs/` and `MEMORY.md` are updated if behaviour or a product decision changed.

## Hard rules
- **Never add payments, checkout, fees or commission** unless the user explicitly asks. See MEMORY.md.
- **Never expose `gm_profiles.payment_info`** outside the members-only card on the game page. It must never appear in the API, search results or public profiles.
- **Never hard-code UI text.** Use `t("key")`.
- **Keep the footer credit "Uicons by Flaticon".** The icon license requires it.
- **Schema changes ship as migrations** (`web/src/lib/migrations.ts`). Never add a change that needs a reset; production refuses to reset.
- Form actions go through `withEcho()`, and abuse-prone ones through `hit()`. See CONVENTIONS.md.
