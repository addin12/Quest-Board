// Pure (no server imports), so unit tests can check the numbers themselves.

// Fixed-window limits per action. Identity is the client IP (for anonymous
// actions) or the user id. Kept generous so real people never notice them.
// Buckets keyed by IP ALONE are generous on purpose: Indonesian mobile networks (Telkomsel, XL,
// Indosat…) put many phones behind one carrier-grade NAT address, so a busy evening could otherwise
// lock out real people. Guessing is stopped by the per-account buckets (IP + email, per user, per
// login step), which stay strict. No per-email-only bucket: anyone could then lock a person out.
// unit:rate-limits keeps IP-only buckets at ≥ 100 an hour.
export const LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 },   // per IP + email
  loginIp: { limit: 600, windowMs: 10 * 60_000 }, // per IP, any email (credential stuffing; shared carrier IPs)
  signup: { limit: 100, windowMs: 60 * 60_000 }, // per IP (shared carrier IPs: a launch evening)
  signupNotice: { limit: 2, windowMs: 60 * 60_000 }, // "someone tried to sign up with your email", per address
  chat: { limit: 30, windowMs: 10 * 60_000 },    // per user
  reserve: { limit: 30, windowMs: 10 * 60_000 }, // per user
  review: { limit: 10, windowMs: 60 * 60_000 },  // per user
  request: { limit: 5, windowMs: 60 * 60_000 },  // GM requests per user
  offer: { limit: 30, windowMs: 60 * 60_000 },   // offers per GM
  password: { limit: 5, windowMs: 15 * 60_000 }, // password changes per user
  reset: { limit: 5, windowMs: 60 * 60_000 },    // "forgot password" emails per IP + email
  resetIp: { limit: 100, windowMs: 60 * 60_000 }, // per IP, any email (no mass reset emails)
  verify: { limit: 5, windowMs: 60 * 60_000 },   // verification emails per user
  emailChange: { limit: 5, windowMs: 60 * 60_000 }, // login-email change requests per user
  deleteAccount: { limit: 5, windowMs: 60 * 60_000 }, // deletion attempts per user
  report: { limit: 10, windowMs: 60 * 60_000 },  // reports per user
  notice: { limit: 5, windowMs: 24 * 60 * 60_000 }, // notice-board posts per user per day
  noticeReply: { limit: 30, windowMs: 60 * 60_000 }, // notice-board replies per user
  question: { limit: 20, windowMs: 60 * 60_000 }, // new questions to GMs per user
  feedback: { limit: 5, windowMs: 60 * 60_000 }, // feedback messages per signed-in user
  feedbackIp: { limit: 100, windowMs: 60 * 60_000 }, // …and from signed-out visitors, per IP
  api: { limit: 300, windowMs: 60_000 },         // public JSON API requests per IP per minute
  upload: { limit: 30, windowMs: 60 * 60_000 },  // pictures per user (each one is decoded and re-encoded: CPU)
  twoStep: { limit: 200, windowMs: 10 * 60_000 }, // two-step codes per IP (each login step allows only 5; a password comes first)
  newDevice: { limit: 10, windowMs: 60 * 60_000 }, // "new device logged in" emails per user
  launchNotify: { limit: 100, windowMs: 60 * 60_000 }, // "tell me when it opens" per IP (pre-launch)
  cspReport: { limit: 100, windowMs: 60 * 60_000 },
  webhookAuth: { limit: 100, windowMs: 60 * 60_000 }, // failed email-webhook authentications per IP // script-policy reports per IP (a broken page sends one per view)
  changes: { limit: 2000, windowMs: 60_000 }, // /api/changes polls per IP (one per open page every 15 s; stops hammering only)
} as const;

export type Bucket = keyof typeof LIMITS;
