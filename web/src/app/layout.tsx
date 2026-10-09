import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Alegreya, Alegreya_Sans, Cinzel } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { countUnread, listNotifications } from "@/lib/notifications";
import { describeNotification } from "@/lib/notification-view";
import { countOpenRequestsForGm } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/site";
import { maybeProcessReminders } from "@/lib/reminders";
import { maybeDeliverNotificationEmails } from "@/lib/notification-mail";
import { setLanguageAction, setThemeAction } from "./actions";
import { cookies, headers } from "next/headers";
import { languageAlternates } from "@/lib/seo";
import { readToast } from "@/lib/toast";
import { LegalUpdateBanner } from "@/components/legal-update-banner";
import { PrelaunchBanner } from "@/components/prelaunch-banner";
import { isPrelaunch } from "@/lib/prelaunch";
import { DICTIONARIES, isMsgKey, type T } from "@/lib/i18n/dict";
import { Toaster } from "@/components/toaster";
import { I18nProvider } from "@/components/i18n-provider";
import { AccountMenu } from "@/components/account-menu";
import type { RegularIcon } from "@/lib/icons";
import { Icon } from "@/components/icon";
import { NotificationBell } from "@/components/notification-bell";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import "./globals.css";
import "./icons/icons.css";

// Tavern typography: Cinzel (inscriptions & signboards) for headings, Alegreya for
// book-like titles, Alegreya Sans for UI text. Self-hosted by next/font at build time.
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"] });
// Alegreya is only the h3 headings (all semibold or bold): one bold file instead of the whole 400–900
// range (round 32: 43 KB → about half on every first visit). Semibold shows in that bold.
const alegreya = Alegreya({ variable: "--font-alegreya", subsets: ["latin"], weight: ["700"] });
// Only the weights the UI uses (every font-extrabold is on Cinzel headings; font-medium falls back to 400):
// each extra weight is another font file on every page, which matters on slow mobile connections.
const alegreyaSans = Alegreya_Sans({ variable: "--font-alegreya-sans", subsets: ["latin"], weight: ["400", "700"] });

/** Browser UI colour (address bar on phones): the dark-wood header. */
export const viewport: Viewport = { themeColor: "#2a1a0e" };

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getI18n();
  return {
    metadataBase: new URL(await siteOrigin()),
    // One canonical per language URL + hreflang for every public page (P3-3; path from src/proxy.ts).
    alternates: languageAlternates((await headers()).get("x-qb-path") ?? "/", lang),
    title: { default: t("meta.title"), template: "%s · Quest Board" },
    description: t("meta.description"),
    openGraph: { siteName: "Quest Board", type: "website", title: t("meta.title"), description: t("meta.description") },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [user, { lang, t }] = await Promise.all([getCurrentUser(), getI18n()]);
  const isGm = user?.role === "gm" || user?.role === "admin";
  maybeProcessReminders(await siteOrigin()); // fallback when no scheduler calls /api/cron/reminders
  maybeDeliverNotificationEmails(await siteOrigin());
  const unread = user ? countUnread(user.id) : 0;
  const recent = user ? listNotifications(user.id, 8).map((n) => describeNotification(n, t)) : [];
  const openRequests = isGm && user ? countOpenRequestsForGm(user.id) : 0;
  const themeCookie = (await cookies()).get("qb_theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  const pending = await readToast(isMsgKey);
  // The page's own path, without a language prefix: which header link is the current page.
  const path = ((await headers()).get("x-qb-path") ?? "/").replace(/^\/(en|id)(?=\/|$)/, "") || "/";
  return (
    <html lang={lang} data-theme={theme === "system" ? undefined : theme} className={`${cinzel.variable} ${alegreya.variable} ${alegreyaSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans max-xl:pb-16">
        <I18nProvider lang={lang} messages={DICTIONARIES[lang]}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn-primary">
            {t("nav.skip")}
          </a>
          <header className="on-wood wood-plank sticky top-0 z-40 border-b border-[#8a6a3a]">
            <nav className="mx-auto flex h-16 max-w-6xl items-center gap-1 whitespace-nowrap px-4 2xl:max-w-7xl" aria-label={t("nav.main")}>
              <Link href="/" className="mr-2 flex min-h-11 items-center gap-2 text-lg font-extrabold tracking-wide lg:mr-3" style={{ fontFamily: "var(--font-heading)" }}>
                <Icon name="dice-d20" solid className="text-xl text-accent" /> <span className="max-[419px]:sr-only">Quest Board</span>
              </Link>
              {/* From 1280px: every page link with its full name, the current one marked. Narrower screens use the tab bar. */}
              <div className="hidden items-center gap-0.5 xl:flex">
                <NavLink href="/games" icon="search" label={t("nav.findGame")} path={path} />
                <NavLink href="/browse" icon="map" label={t("nav.browse")} path={path} />
                <NavLink href="/hire-a-gm" icon="briefcase" label={t("nav.hireGm")} path={path} />
                <NavLink href="/board" icon="thumbtack" label={t("nav.board")} path={path} />
                {!isGm && <NavLink href="/become-a-gm" icon="hat-wizard" label={t("nav.becomeGm")} path={path} />}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <LanguageSwitcher lang={lang} label={t("lang.switch")} />
                {user ? (
                  <>
                    {isGm && <NavLink href="/gm" icon="hat-wizard" label={t("nav.gmDashboard")} path={path} exact className="max-xl:hidden" />}
                    <NavLink href="/dashboard" icon="calendar-clock" label={t("nav.myGames")} path={path} className="max-xl:hidden" />
                    <NotificationBell unread={unread} items={recent} openRequests={openRequests} />
                    <AccountMenu name={user.name} hue={user.avatar_hue} image={user.avatar_image ?? null} admin={user.role === "admin"} />
                  </>
                ) : (
                  <>
                    <Link href="/login" className="btn-ghost max-sm:px-2.5!">{t("nav.login")}</Link>
                    <Link href="/signup" className="btn-primary max-sm:px-3!">{t("nav.signup")}</Link>
                  </>
                )}
              </div>
            </nav>
          </header>
          {isPrelaunch() && <PrelaunchBanner t={t} />}
          {user && <LegalUpdateBanner user={user} t={t} />}
          <main id="main" className="flex-1">{children}</main>
          <footer className="on-wood wood-plank mt-16 border-t-2 border-[#8a6a3a]">
            <span aria-hidden className="ornament mx-auto -mb-2 pt-6" />
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-muted sm:grid-cols-3">
              <div>
                <p className="flex items-center gap-2 text-base font-extrabold tracking-wide text-text" style={{ fontFamily: "var(--font-heading)" }}><Icon name="dice-d20" solid className="text-accent" /> Quest Board</p>
                <p className="mt-2">{t("footer.tagline")}</p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text">{t("footer.players")}</p>
                <Link href="/games" className="hover:text-text">{t("footer.browse")}</Link>
                <Link href="/games?level=beginner" className="hover:text-text">{t("footer.newToTtrpg")}</Link>
                <Link href="/browse" className="hover:text-text">{t("nav.browse")}</Link>
                <Link href="/hire-a-gm" className="hover:text-text">{t("nav.hireGm")}</Link>
                <Link href="/board" className="hover:text-text">{t("nav.board")}</Link>
                <Link href="/how-it-works" className="hover:text-text">{t("footer.howItWorks")}</Link>
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text">{t("footer.gms")}</p>
                <Link href="/become-a-gm" className="hover:text-text">{t("footer.runGames")}</Link>
                <Link href="/how-it-works#gms" className="hover:text-text">{t("footer.gmGuide")}</Link>
                <Link href="/terms" className="hover:text-text">{t("legal.terms.title")}</Link>
                <Link href="/privacy" className="hover:text-text">{t("legal.privacy.title")}</Link>
                <Link href="/feedback" className="hover:text-text">{t("feedback.title")}</Link>
              </div>
            </div>
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-4 text-xs text-muted">
              <ThemeSwitcher theme={theme} t={t} />
              <span>
              {/* Required attribution for free use of Flaticon UIcons. */}
              {t("footer.iconsBy")}{" "}
              <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
                Uicons by Flaticon
              </a>
              </span>
            </div>
          </footer>
          <MobileTabBar signedIn={!!user} isGm={isGm} />
          <Toaster toast={pending ? { text: t(pending.key), id: pending.id } : null} closeLabel={t("toast.close")} />
        </I18nProvider>
      </body>
    </html>
  );
}

/** Candlelight toggle: Automatic (follows the device) → Parchment (light) → Candlelight (dark). */
function ThemeSwitcher({ theme, t }: { theme: "system" | "light" | "dark"; t: T }) {
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const name = (m: typeof theme) => t(m === "system" ? "theme.system" : m === "light" ? "theme.light" : "theme.dark");
  return (
    <form action={setThemeAction}>
      <input type="hidden" name="theme" value={next} />
      <button
        type="submit"
        className="btn-secondary"
        aria-label={t("theme.switch", { current: name(theme), next: name(next) })}
      >
        <Icon name={theme === "system" ? "circle-half-stroke" : theme === "light" ? "sun" : "candle-holder"} />
        {t("theme.current", { current: name(theme) })}
      </button>
    </form>
  );
}

function LanguageSwitcher({ lang, label }: { lang: "id" | "en"; label: string }) {
  return (
    <form action={setLanguageAction} className="flex items-center rounded-lg border border-border bg-black/20 p-0.5 text-sm font-bold" aria-label={label}>
      <Icon name="globe" className="hidden px-1.5 text-muted sm:inline-flex" />
      {(["en", "id"] as const).map((l) => (
        <button
          key={l}
          type="submit"
          name="lang"
          value={l}
          aria-pressed={lang === l}
          className={`min-h-10 min-w-10 rounded-md px-2 uppercase ${lang === l ? "bg-accent text-accent-ink" : "text-muted hover:text-text"}`}
        >
          {l}
        </button>
      ))}
    </form>
  );
}

/** A header link: icon and full label; the current page gets aria-current and an amber underline. */
function NavLink({ href, icon, label, path, exact = false, className = "" }: { href: string; icon: RegularIcon; label: string; path: string; exact?: boolean; className?: string }) {
  const current = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`btn-ghost relative px-2.5 2xl:px-3 ${current ? "bg-white/10 text-text! after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent" : ""} ${className}`}
    >
      <Icon name={icon} className="hidden 2xl:inline-flex" /> {label}
    </Link>
  );
}
