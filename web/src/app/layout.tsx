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
import { logoutAction, setLanguageAction, setThemeAction } from "./actions";
import { cookies, headers } from "next/headers";
import { languageAlternates } from "@/lib/seo";
import { readToast } from "@/lib/toast";
import { LegalUpdateBanner } from "@/components/legal-update-banner";
import { PrelaunchBanner } from "@/components/prelaunch-banner";
import { isPrelaunch } from "@/lib/prelaunch";
import { isMsgKey, type T } from "@/lib/i18n/dict";
import { Toaster } from "@/components/toaster";
import { Avatar } from "@/components/ui";
import { I18nProvider } from "@/components/i18n-provider";
import { Icon } from "@/components/icon";
import { NotificationBell } from "@/components/notification-bell";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import "./globals.css";
import "./icons/icons.css";

// Tavern typography: Cinzel (inscriptions & signboards) for headings, Alegreya for
// book-like titles, Alegreya Sans for UI text. Self-hosted by next/font at build time.
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"] });
const alegreya = Alegreya({ variable: "--font-alegreya", subsets: ["latin"] });
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
  return (
    <html lang={lang} data-theme={theme === "system" ? undefined : theme} className={`${cinzel.variable} ${alegreya.variable} ${alegreyaSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans max-md:pb-16">
        <I18nProvider lang={lang}>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn-primary">
            {t("nav.skip")}
          </a>
          <header className="on-wood wood-plank sticky top-0 z-40 border-b-2 border-[#8a6a3a] shadow-[0_2px_10px_rgb(0_0_0/0.35)]">
            <nav className="mx-auto flex h-16 max-w-6xl items-center gap-1 whitespace-nowrap px-4 2xl:max-w-7xl" aria-label={t("nav.main")}>
              <Link href="/" className="mr-1 flex items-center gap-2 text-lg font-extrabold tracking-wide sm:mr-3" style={{ fontFamily: "var(--font-heading)" }}>
                <Icon name="dice-d20" solid className="text-xl text-accent drop-shadow-[0_0_6px_rgb(234_179_90/0.55)]" /> <span className="max-[399px]:sr-only">Quest Board</span>
              </Link>
              <Link href="/games" className="btn-ghost px-2.5 max-md:hidden xl:px-3" aria-label={t("nav.findGame")}>
                <Icon name="search" /> <span className="hidden lg:inline">{t("nav.findGame")}</span>
              </Link>
              <Link href="/browse" className="btn-ghost px-2.5 max-md:hidden xl:px-3" aria-label={t("nav.browse")}>
                <Icon name="map" /> <span className="hidden lg:inline">{t("nav.browse")}</span>
              </Link>
              <Link href="/hire-a-gm" className="btn-ghost px-2.5 max-md:hidden xl:px-3" aria-label={t("nav.hireGm")}>
                <Icon name="briefcase" /> <span className="hidden lg:inline">{t("nav.hireGm")}</span>
              </Link>
              <Link href="/board" className="btn-ghost hidden px-2.5 lg:inline-flex xl:px-3" aria-label={t("nav.board")} title={t("nav.board")}>
                <Icon name="thumbtack" /> <span className="hidden 2xl:inline">{t("nav.board")}</span>
              </Link>
              {!isGm && (
                <Link href="/become-a-gm" className="btn-ghost hidden xl:inline-flex">
                  <Icon name="hat-wizard" /> {t("nav.becomeGm")}
                </Link>
              )}
              <div className="ml-auto flex items-center gap-1">
                <ThemeSwitcher theme={theme} t={t} />
                <LanguageSwitcher lang={lang} label={t("lang.switch")} />
                {user ? (
                  <>
                    {isGm && (
                      <Link href="/gm" className="btn-ghost px-2.5 max-md:hidden xl:px-3" aria-label={t("nav.gmDashboard")}>
                        <Icon name="hat-wizard" /> <span className="hidden xl:inline">{t("nav.gmDashboard")}</span>
                      </Link>
                    )}
                    <Link href="/dashboard" className="btn-ghost px-2.5 max-md:hidden xl:px-3" aria-label={t("nav.myGames")}>
                      <Icon name="calendar-clock" /> <span className="hidden xl:inline">{t("nav.myGames")}</span>
                    </Link>
                    {user.role === "admin" && (
                      <Link href="/admin" className="btn-ghost px-2.5" aria-label={t("admin.title")} title={t("admin.title")}>
                        <Icon name="shield" />
                      </Link>
                    )}
                    <NotificationBell unread={unread} items={recent} openRequests={openRequests} />
                    <Link href="/settings" className="flex items-center rounded-full pl-1 hover:opacity-90" aria-label={t("settings.title")} title={t("settings.title")}>
                      <Avatar name={user.name} hue={user.avatar_hue} image={user.avatar_image} size={30} />
                    </Link>
                    <form action={logoutAction}>
                      <button className="btn-ghost px-2.5 xl:px-3" type="submit" aria-label={t("nav.logout")} title={t("nav.logout")}>
                        <Icon name="sign-out-alt" /> <span className="hidden 2xl:inline">{t("nav.logout")}</span>
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="btn-ghost max-sm:px-2!"><Icon name="sign-in-alt" className="hidden sm:inline-flex" /> {t("nav.login")}</Link>
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
                <Link href="/how-it-works#gms" className="hover:text-text">{t("footer.noCommission")}</Link>
                <Link href="/terms" className="hover:text-text">{t("legal.terms.title")}</Link>
                <Link href="/privacy" className="hover:text-text">{t("legal.privacy.title")}</Link>
                <Link href="/feedback" className="hover:text-text">{t("feedback.title")}</Link>
              </div>
            </div>
            <div className="mx-auto max-w-6xl border-t border-border px-4 py-4 text-xs text-muted">
              {/* Required attribution for free use of Flaticon UIcons. */}
              {t("footer.iconsBy")}{" "}
              <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
                Uicons by Flaticon
              </a>
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
        className="btn-ghost px-2.5"
        aria-label={t("theme.switch", { current: name(theme), next: name(next) })}
        title={t("theme.switch", { current: name(theme), next: name(next) })}
      >
        <Icon name={theme === "system" ? "circle-half-stroke" : theme === "light" ? "sun" : "candle-holder"} />
      </button>
    </form>
  );
}

function LanguageSwitcher({ lang, label }: { lang: "id" | "en"; label: string }) {
  return (
    <form action={setLanguageAction} className="flex items-center rounded-md border border-border bg-black/20 p-0.5 text-xs font-bold" aria-label={label}>
      <Icon name="globe" className="hidden px-1.5 text-muted sm:inline-flex" />
      {(["en", "id"] as const).map((l) => (
        <button
          key={l}
          type="submit"
          name="lang"
          value={l}
          aria-pressed={lang === l}
          className={`rounded px-2 py-1 uppercase ${lang === l ? "bg-accent text-accent-ink" : "text-muted hover:text-text"}`}
        >
          {l}
        </button>
      ))}
    </form>
  );
}
