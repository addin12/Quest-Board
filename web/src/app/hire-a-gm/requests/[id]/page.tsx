import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { markRequestRead } from "@/lib/notifications";
import { getGmRequest, getGmSettings, getOffer, getPaymentInfo, isSuspended, listOffers, listRequestMessages } from "@/lib/queries";
import { Avatar, Notice, Stars, NewGmBadge, VerifiedBadge, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { ConfirmButton, SubmitButton } from "@/components/submit-button";
import { OfferForm, RequestMessageForm } from "@/components/hire-forms";
import { RequestFacts, RequestStatus } from "@/components/request-bits";
import { Icon } from "@/components/icon";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportButton } from "@/components/report-button";
import { chooseOfferAction, closeRequestAction } from "@/app/actions";
import { PaymentChangedNote } from "@/components/payment-changed-note";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("hire.requestTitleShort") };
}

/**
 * One GM request. Who sees what:
 * - requester: everything, all offers, can choose an offer / close; thread after match
 * - GM eligible to answer (open, public or addressed to them): details + offer form / their offer
 * - matched GM: details, their offer, requester's thread
 * Everyone else: 404.
 */
export default async function RequestPage(props: PageProps<"/hire-a-gm/requests/[id]">) {
  const { id } = await props.params;
  const { created } = await props.searchParams;
  const user = await requireUser(`/hire-a-gm/requests/${id}`);
  const { t } = await getI18n();
  const r = getGmRequest(Number(id));
  if (!r) notFound();

  const isRequester = r.requester_id === user.id;
  const isGm = user.role === "gm" || user.role === "admin";
  const isMatchedGm = r.matched_gm_id === user.id;
  const canOffer = isGm && !isRequester && r.status === "open" && (r.gm_id == null || r.gm_id === user.id);
  const myOffer = isGm ? getOffer(r.id, user.id) : undefined;
  if (!isRequester && !isMatchedGm && !canOffer && !myOffer) notFound();
  markRequestRead(user.id, r.id);

  const offers = isRequester ? listOffers(r.id) : [];
  const inThread = r.status === "matched" && (isRequester || isMatchedGm);
  const messages = inThread ? listRequestMessages(r.id) : [];
  const matchedOffer = r.matched_gm_id ? (isRequester ? offers.find((o) => o.gm_id === r.matched_gm_id) : myOffer) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href={isRequester ? "/dashboard" : "/gm/requests"} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <Icon name="arrow-left" /> {isRequester ? t("nav.myGames") : t("gmRequests.title")}
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold">{r.title}</h1>
        <RequestStatus status={r.status} t={t} />
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Avatar name={r.requester_name} hue={r.requester_hue} image={r.requester_image} size={22} /> {r.requester_name} · <LocalTime iso={r.created_at} />
        {r.target_gm_name && <span className="chip gap-1"><Icon name="hat-wizard" /> {t("hire.directChip", { name: r.target_gm_name })}</span>}
      </p>
      {created && isRequester && <div className="mt-5"><Notice tone="success">{t("hire.createdBanner")}</Notice></div>}

      <section className="card mt-6 p-6">
        <RequestFacts r={r} t={t} />
        <p className="mt-5 whitespace-pre-line border-t border-border pt-4 text-sm leading-relaxed">{r.details}</p>
      </section>

      {/* Matched: private thread + payment details for the requester */}
      {inThread && (
        <section className="mt-8" aria-labelledby="thread-h">
          <AutoRefresh />
          <h2 id="thread-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="comment-dots" className="text-accent" /> {t("hire.threadTitle")}</h2>
          <p className="text-sm text-muted">{t("hire.threadLead")}</p>
          {isRequester && matchedOffer && isSuspended(matchedOffer.gm_id) && (
            <div className="mt-4"><Notice tone="danger">{t("hire.gmSuspended")}</Notice></div>
          )}
          {isRequester && matchedOffer && !isSuspended(matchedOffer.gm_id) && (
            <div className="card mt-4 border-accent/40! p-4">
              <p className="eyebrow flex items-center gap-1.5 text-accent!"><Icon name="wallet" /> {t("game.howToPay")}</p>
              <p className="mt-2 whitespace-pre-line text-sm">{getPaymentInfo(matchedOffer.gm_id) || t("game.howToPayEmpty")}</p>
              {getPaymentInfo(matchedOffer.gm_id) && <PaymentChangedNote gmId={matchedOffer.gm_id} />}
              {getPaymentInfo(matchedOffer.gm_id) && <ReportButton targetType="user" targetId={matchedOffer.gm_id} label={t("report.paymentDetails")} defaultReason="scam" className="mt-2" />}
              <p className="mt-2 text-xs text-muted">{t("game.scamWarning")}</p>
            </div>
          )}
          <ul className="mt-4 space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="flex gap-3">
                <Avatar name={m.name} hue={m.avatar_hue} image={m.avatar_image} size={32} />
                <div className="min-w-0">
                  <p className="text-sm"><span className="font-semibold">{shownName(m.name, t)}</span><span className="ml-2 text-xs text-muted"><LocalTime iso={m.created_at} /></span></p>
                  <p className="whitespace-pre-line text-sm">{m.body}</p>
                  {m.user_id !== user.id && <ReportButton targetType="request_message" targetId={m.id} className="mt-1" />}
                </div>
              </li>
            ))}
            {messages.length === 0 && <li className="text-sm text-muted">{t("hire.threadEmpty")}</li>}
          </ul>
          <div className="mt-4"><RequestMessageForm requestId={r.id} /></div>
        </section>
      )}

      {/* Requester: offers */}
      {isRequester && (
        <section className="mt-8" aria-labelledby="offers-h">
          <h2 id="offers-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="hand-wave" className="text-accent" /> {t("hire.offersTitle", { n: offers.length })}</h2>
          {offers.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("hire.noOffers")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {offers.map((o) => (
                <li key={o.id} className={`card p-5 ${r.matched_gm_id === o.gm_id ? "border-success/50! ring-2 ring-success/20" : ""}`}>
                  <div className="flex flex-wrap items-start gap-4">
                    <Avatar name={o.gm_name} hue={o.gm_hue} image={o.gm_image} size={52} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Link href={`/gms/${o.gm_id}`} className="hover:text-accent">{o.gm_name}</Link>
                        {o.gm_verified ? <VerifiedBadge label={t("common.verifiedGm")} /> : null}
                        {o.gm_new ? <NewGmBadge t={t} /> : null}
                      </p>
                      <p className="text-sm text-muted">{o.gm_headline}</p>
                      <div className="mt-1"><Stars rating={o.avg_rating} count={o.review_count} t={t} /></div>
                    </div>
                    <p className="text-right">
                      <span className="block text-lg font-bold">{priceLabel(o.price_idr, t)}</span>
                      <span className="block text-xs text-muted">{t("hire.perPlayerSession")}</span>
                    </p>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm">{o.message}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {r.status === "open" && (
                      <form action={chooseOfferAction}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="gmId" value={o.gm_id} />
                        <SubmitButton><Icon name="handshake" /> {t("hire.chooseGm")}</SubmitButton>
                      </form>
                    )}
                    {r.matched_gm_id === o.gm_id && <span className="chip gap-1 border-success/30! bg-success-soft! text-success!"><Icon name="check-circle" solid /> {t("hire.chosen")}</span>}
                    <Link href={`/gms/${o.gm_id}`} className="btn-ghost"><Icon name="eye" /> {t("hire.viewProfile")}</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {r.status === "open" && (
            <form action={closeRequestAction} className="mt-6">
              <input type="hidden" name="requestId" value={r.id} />
              <ConfirmButton className="btn-ghost text-xs" message={t("hire.closeConfirm")}><Icon name="archive" /> {t("hire.closeRequest")}</ConfirmButton>
            </form>
          )}
        </section>
      )}

      {/* GM: offer form or their offer */}
      {!isRequester && (
        <section className="mt-8" aria-labelledby="my-offer-h">
          <h2 id="my-offer-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="hand-wave" className="text-accent" /> {t("hire.yourOffer")}</h2>
          {myOffer ? (
            <div className="card mt-4 p-5">
              <p className="text-lg font-bold">{priceLabel(myOffer.price_idr, t)} <span className="text-xs font-normal text-muted">{t("hire.perPlayerSession")}</span></p>
              <p className="mt-2 whitespace-pre-line text-sm">{myOffer.message}</p>
              <p className="mt-3 text-xs text-muted">{isMatchedGm ? t("hire.youWereChosen") : r.status === "open" ? t("hire.waitingForChoice") : t("hire.notChosen")}</p>
            </div>
          ) : getGmSettings(user.id)?.headline ? (
            <div className="card mt-4 p-5"><OfferForm requestId={r.id} /></div>
          ) : (
            <div className="mt-4">
              <Notice>
                {t("err.gmProfileIncomplete")}{" "}
                <Link href="/become-a-gm" className="font-semibold underline">{t("hire.completeProfile")}</Link>
              </Notice>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
