# CONVENTIONS: how code is written here

## Next.js 16 specifics
- This Next.js version has breaking changes. Check `web/node_modules/next/dist/docs/` before using an API from memory.
- `params`, `searchParams` and `cookies()` are **async**. Type pages with the global helpers: `PageProps<"/games/[slug]">`, `LayoutProps<"/">`, `RouteContext<"/api/games/[slug]">`. If those types vanish, run `npx next typegen`.
- Every route is dynamic, because the root layout reads cookies. Don't add `generateStaticParams`.
- Mutations are **server actions** in `web/src/app/actions.ts`. Each action must **re-authenticate and authorize itself**, because actions are reachable by direct POST. Use `requireUser()`, `requireGm()`, `ownedGameOrThrow()` or `isGameMember()`.
- **Form actions** used with `useActionState`:
  - Write the logic as `fooActionImpl`.
  - Export `fooAction = (prev, form) => withEcho(form, () => fooActionImpl(prev, form))`.
  - In the form, read defaults from `state?.values?.field ?? initial`. React 19 **resets forms after every action**, so without this, users lose their input on any error.
- **Abuse-prone actions** call `hit(bucket, identity)` from `lib/rate-limit.ts` and return `err.rateLimited`. Add a new bucket to `LIMITS` rather than inlining numbers.
- Catch **UNIQUE races** with `isUniqueViolation(err)` and return a field error instead of letting a 500 escape.
- Error boundaries in Next 16 receive `{ error, retry }`, not `reset`.

## Module boundaries
- `src/lib/policy.ts`, `src/lib/validation.ts`, `src/lib/i18n/*.ts`, `src/lib/seo.ts`, `src/lib/vitals.ts`, `src/lib/circuit-breaker.ts` and `src/lib/icons.ts` are **pure**: no runtime imports (`import type` is fine). This lets `node --test` run them directly and lets the icon script import `icons.ts`. Business rules go here.
- `src/lib/db.ts`, `auth.ts`, `queries.ts` and `i18n/server.ts` start with `import "server-only"`. Never import them from a `"use client"` file.
- Server components get text via `const { t, lang } = await getI18n()`. Client components use `const { t, lang } = useI18n()`.
- `components/ui.tsx` is presentational and server-safe. Components that need text take a `t: T` prop or an already-translated string.

## Text & i18n
- **Never write user-visible literals in JSX.** Add a key to `src/lib/i18n/en.ts` **and** `id.ts` (`dict.ts` combines them). `id` is typed `Record<MsgKey, string>`, so a missing translation fails typecheck.
- Key names follow `namespace.name` (`game.book`, `v.price`, `err.full`). Placeholders look like `{name}`. Plurals use `"one|other"`, chosen by the `n` variable.
- Validation functions and server actions return **translation keys** (`MsgKey`), never sentences. The client renders them with `t()`.
- Indonesian tone is friendly and informal (*kamu*, *-mu*). Keep community loanwords: one-shot, session zero, X-card, GM.

## Data
- SQL uses **positional `?` parameters only**. Dynamic `ORDER BY` fragments come from a fixed map. Never interpolate user input.
- Money is **whole Rupiah integers** (`price_idr`). Format with `formatIdr()` or `priceLabel(n, t)` (0 → "Free" / "Gratis"). Parse input with `parseIdr()` / `parseGame()`, which accept `75.000`.
- Time is **ISO-8601 UTC in the DB**. Render with `<LocalTime iso mode>`, which renders WIB on the server and the viewer's zone on the client. Session input is `datetime-local` plus the browser `tzOffset`.
- Anything that re-checks capacity (seats) runs inside `tx()`, which uses `BEGIN IMMEDIATE`.
- Schema changes: update `SCHEMA_SQL`, **add a data-preserving migration to `MIGRATIONS`** in `lib/migrations.ts`, bump `SCHEMA_VERSION`, update `seed.ts`, then update `docs/05-data-model.md`. Never rely on reset-and-reseed.
- User input in `LIKE` goes through `escapeLike()` with `ESCAPE '\'`.

## Styling
- Use Tailwind v4. Custom classes are `@utility` blocks in `globals.css` (`btn-primary`, `card`, `chip`, `input`, `eyebrow`…).
- The important modifier is a **suffix**: `py-1!`, not `!py-1`.
- Use colour tokens only (`bg-surface`, `text-muted`, `text-accent`…), never raw hex values. The one exception is hue-based covers and avatars.
- For icons, use `<Icon name="…" />` and `<Icon name="star" solid />`. Details are in DESIGN.md.

## Naming & files
- Routes are kebab-case folders (`become-a-gm`). Components are kebab-case files with PascalCase exports.
- Client form components live in `src/components/*-form.tsx` and use `useActionState<FormState, FormData>`.
- Keep comments short and explain *why*. Match the existing code's style.
