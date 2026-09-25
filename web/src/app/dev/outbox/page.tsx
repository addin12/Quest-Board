import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devOutboxEnabled, listOutbox } from "@/lib/mailer";

export const metadata: Metadata = { title: "Dev outbox", robots: { index: false } };

/**
 * Development-only view of queued emails (verification and reset links) so flows can be
 * tried without an email provider. 404 in production unless QUESTBOARD_DEV_OUTBOX=true (e2e).
 * Deliberately untranslated: it is a developer tool, not part of the product.
 */
export default function DevOutboxPage() {
  if (!devOutboxEnabled()) notFound();
  const mails = listOutbox();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">Dev outbox</h1>
      <p className="mt-1 text-sm text-muted">Newest first. Emails are delivered for real only when RESEND_API_KEY and QUESTBOARD_MAIL_FROM are set.</p>
      <ul className="mt-6 space-y-4">
        {mails.map((m) => (
          <li key={m.id} className="card p-4" data-testid="outbox-mail">
            <p className="text-sm"><strong>To:</strong> <span data-testid="outbox-to">{m.to_address}</span> · <strong>Subject:</strong> {m.subject}</p>
            <p className="text-xs text-muted">{m.created_at} · {m.sent_at ? `sent ${m.sent_at}` : m.error ? `error: ${m.error}` : "queued (no provider)"}</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm" data-testid="outbox-body">{m.body_text}</pre>
          </li>
        ))}
        {mails.length === 0 && <li className="text-sm text-muted">No emails yet.</li>}
      </ul>
    </div>
  );
}
