import type { T } from "./i18n/dict";
import type { RegularIcon } from "./icons";
import type { NotificationKind } from "./notifications";

// Pure: turns a notification row into what the UI shows (link, icon, sentence).
// Shared by the header popover and the /notifications page.

export type NotificationSource = {
  id: number;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_name: string | null;
  actor_hue: number | null;
  actor_image: string | null;
  request_id: number | null;
  request_title: string | null;
  game_title: string | null;
  game_slug: string | null;
  post_id?: number | null;
  post_title?: string | null;
};

export type NotificationView = {
  id: number;
  href: string;
  icon: RegularIcon;
  text: string;
  createdAt: string;
  unread: boolean;
  actor: { name: string; hue: number; image: string | null } | null;
};

export function describeNotification(n: NotificationSource, t: T): NotificationView {
  const who = n.actor_name ?? "—";
  const request = n.request_title ?? "";
  const game = n.game_title ?? "";
  const requestHref = n.request_id ? `/hire-a-gm/requests/${n.request_id}` : "/dashboard";
  const gameHref = n.game_slug ? `/games/${n.game_slug}` : "/dashboard";
  const base = {
    id: n.id,
    createdAt: n.created_at,
    unread: !n.read_at,
    actor: n.actor_name ? { name: n.actor_name, hue: n.actor_hue ?? 200, image: n.actor_image } : null,
  };
  switch (n.kind) {
    case "request_direct": return { ...base, href: requestHref, icon: "briefcase", text: t("notif.requestDirect", { name: who, title: request }) };
    case "offer_received": return { ...base, href: requestHref, icon: "hand-wave", text: t("notif.offerReceived", { name: who, title: request }) };
    case "offer_chosen": return { ...base, href: requestHref, icon: "handshake", text: t("notif.offerChosen", { name: who, title: request }) };
    case "request_message": return { ...base, href: requestHref, icon: "comment-dots", text: t("notif.requestMessage", { name: who, title: request }) };
    case "booking_new": return { ...base, href: "/gm", icon: "user-add", text: t("notif.bookingNew", { name: who, title: game }) };
    case "booking_cancelled": return { ...base, href: "/gm", icon: "user", text: t("notif.bookingCancelled", { name: who, title: game }) };
    case "session_cancelled": return { ...base, href: gameHref, icon: "calendar", text: t("notif.sessionCancelled", { title: game }) };
    case "report_new": return { ...base, href: "/admin/reports", icon: "flag", text: t("notif.reportNew", { name: who }) };
    case "waitlist_offer": return { ...base, href: gameHref, icon: "ticket", text: t("notif.waitlistOffer", { title: game }) };
    case "payment_confirmed": return { ...base, href: "/dashboard", icon: "wallet", text: t("notif.paymentConfirmed", { name: who, title: game }) };
    case "lfg_reply": return { ...base, href: n.post_id ? `/board/${n.post_id}` : "/board", icon: "thumbtack", text: t("notif.lfgReply", { name: who, title: n.post_title ?? "" }) };
    case "followed_gm_game": return { ...base, href: gameHref, icon: "dice-d20", text: t("notif.followedGame", { name: who, title: game }) };
    case "report_resolved": return { ...base, actor: null, href: "/notifications", icon: "shield-check", text: t("notif.reportResolved") };
  }
}
