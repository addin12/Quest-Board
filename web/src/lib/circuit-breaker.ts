// A circuit breaker for outside services (CLAUDE.md, "Timeouts on every external call"). After `failures`
// failures in a row a service is skipped for `coolMs`; then one try is let through, and one more failure
// opens it again at once. Pure, with the clock passed in, so tests don't wait.

export type Breaker = {
  /** May we call it now? */
  allows(key: string): boolean;
  success(key: string): void;
  failure(key: string): void;
  reset(): void;
};

/**
 * @example
 * const breaker = makeBreaker({ failures: 3, coolMs: 300_000 });
 * if (breaker.allows("resend")) { try { await send(); breaker.success("resend"); } catch { breaker.failure("resend"); } }
 */
export function makeBreaker({ failures = 3, coolMs = 5 * 60_000, now = Date.now }: { failures?: number; coolMs?: number; now?: () => number } = {}): Breaker {
  const state = new Map<string, { fails: number; openUntil: number; tripped: boolean }>();
  return {
    allows: (key) => (state.get(key)?.openUntil ?? 0) <= now(),
    success: (key) => void state.delete(key),
    failure(key) {
      const s = state.get(key) ?? { fails: 0, openUntil: 0, tripped: false };
      s.fails++;
      if (s.tripped || s.fails >= failures) {
        s.openUntil = now() + coolMs;
        s.tripped = true;
        s.fails = 0;
      }
      state.set(key, s);
    },
    reset: () => state.clear(),
  };
}
