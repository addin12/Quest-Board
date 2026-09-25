import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { listNotifications, markAllRead } from "@/lib/notifications";
import { describeNotification } from "@/lib/notification-view";
import { countOpenRequestsForGm } from "@/lib/queries";
import { Avatar, EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("notif.title") };
}

/** In-app notifications. Opening this page marks everything as read (the list still shows what was new). */
export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const { t } = await getI18n();
  const items = listNotifications(user.id).map((n) => describeNotification(n, t));
  markAllRead(user.id);
  const isGm = user.role === "gm" || user.role === "admin";
  const openRequests = isGm ? countOpenRequestsForGm(user.id) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="bell" className="text-accent" /> {t("notif.title")}</h1>
      <p className="mt-1 text-muted">{t("notif.lead")}</p>

      {openRequests > 0 && (
        <Link href="/gm/requests" className="card mt-6 flex items-center gap-3 border-accent/40! p-4 hover:border-accent">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name="inbox" /></span>
          <span className="flex-1 text-sm font-semibold">{t("notif.openRequests", { n: openRequests })}</span>
          <Icon name="arrow-right" className="text-accent" />
        </Link>
      )}

      {items.length === 0 ? (
        <div className="mt-6"><EmptyState title={t("notif.emptyTitle")}>{t("notif.emptyBody")}</EmptyState></div>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((n) => {
            const { href, icon, text } = n;
            return (
              <li key={n.id}>
                <Link href={href} className={`card flex items-start gap-3 p-4 hover:border-accent ${n.unread ? "border-accent/40! bg-accent-soft/40" : ""}`}>
                  {n.actor ? (
                    <Avatar name={n.actor.name} hue={n.actor.hue} image={n.actor.image} size={36} />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Icon name={icon} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5 text-sm">
                      <Icon name={icon} className="mt-0.5 shrink-0 text-accent" />
                      <span>{text}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted"><LocalTime iso={n.createdAt} /></span>
                  </span>
                  {n.unread && <span className="chip shrink-0 border-accent/30! bg-accent-soft! text-accent!">{t("notif.new")}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

