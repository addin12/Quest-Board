"use client";

import { useState } from "react";
import { useI18n } from "./i18n-provider";

/**
 * Live threads update on their own (AutoRefresh), which a screen-reader user can't see: when a newer
 * message from someone else arrives, say so politely ("New message from Dewi"). Nothing is announced
 * on first load or for your own messages.
 */
export function NewMessageAnnouncer({ lastId, author, fromMe }: { lastId: number; author: string; fromMe: boolean }) {
  const { t } = useI18n();
  const [seen, setSeen] = useState(lastId);
  const [text, setText] = useState("");
  // Derived from props during render (React's pattern for "state that follows a prop").
  if (lastId !== seen) {
    setSeen(lastId);
    if (lastId > seen && !fromMe) setText(t("chat.newMessage", { name: author }));
  }
  return <p className="sr-only" role="status" aria-live="polite">{text}</p>;
}
