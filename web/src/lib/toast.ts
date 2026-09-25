import "server-only";
import { cookies } from "next/headers";
import type { MsgKey } from "./i18n/dict";

// One-shot confirmation toasts ("Seat released", "Saved"…). A server action calls
// toast("toast.x"); the layout reads the cookie on its next render and <Toaster> shows
// it once, then clears it. Only dictionary keys are accepted when reading it back.

export const TOAST_COOKIE = "qb_toast";

export async function toast(key: MsgKey): Promise<void> {
  (await cookies()).set(TOAST_COOKIE, `${key}|${Date.now()}`, { path: "/", sameSite: "lax", maxAge: 20 });
}

/** The pending toast, if its key is a real translation key (never render arbitrary cookie text). */
export async function readToast(isKey: (k: string) => k is MsgKey): Promise<{ key: MsgKey; id: string } | null> {
  const raw = (await cookies()).get(TOAST_COOKIE)?.value;
  if (!raw) return null;
  const [key, id] = raw.split("|");
  return key && key.startsWith("toast.") && isKey(key) ? { key, id: id ?? "0" } : null;
}
