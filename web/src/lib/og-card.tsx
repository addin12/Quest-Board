import "server-only";
import { ImageResponse } from "next/og";

// Shared 1200×630 link-preview card in the tavern style (dark oak, brass trim, parchment text).
// Uses next/og's bundled font; no network access at render time.

export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard(opts: { eyebrow: string; title: string; lines: string[]; hue?: number; badge?: string }) {
  const hue = opts.hue ?? 30;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: 64, color: "#f3e6c8",
          background: `radial-gradient(circle at 85% 20%, hsl(${hue} 70% 45% / 0.55), transparent 55%), linear-gradient(135deg, #2a1b10, #140b05)`,
          border: "14px solid #8a6a3a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#eab35a", letterSpacing: 4, textTransform: "uppercase" }}>
          <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, background: "#8e2b1c", alignItems: "center", justifyContent: "center", color: "#fbe9c8", fontSize: 22, fontWeight: 700 }}>20</div>
          {opts.eyebrow}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: opts.title.length > 40 ? 64 : 78, fontWeight: 700, lineHeight: 1.08 }}>{opts.title}</div>
          {opts.lines.map((l) => (
            <div key={l} style={{ fontSize: 32, color: "#d6c09b" }}>{l}</div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
          <div style={{ display: "flex", color: "#eab35a", fontWeight: 700 }}>Quest Board</div>
          {opts.badge ? (
            <div style={{ display: "flex", padding: "10px 22px", borderRadius: 10, background: "#eab35a", color: "#1c1208", fontWeight: 700 }}>{opts.badge}</div>
          ) : null}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
