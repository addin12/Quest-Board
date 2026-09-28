// Pure: the HTML version of a plain-text email (both are sent; the text part stays the source of truth).
// Paragraphs are separated by blank lines; a link alone on its own line is the email's main action and
// becomes a button. Everything is escaped, and styles are inline because many mail apps drop <style>.

const COLORS = { page: "#f3ead8", card: "#fffaf0", wood: "#3b2717", gold: "#e9b35a", ink: "#2b2118", muted: "#6b5a48", accent: "#9b2d20", rule: "#e3d5bb" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Escape a line, turning any URLs in it into links. */
function inline(line: string): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)]+$/, ""); // trailing punctuation isn't part of the link
    out += esc(line.slice(last, m.index)) + `<a href="${esc(url)}" style="color:${COLORS.accent};word-break:break-all">${esc(url)}</a>`;
    last = (m.index ?? 0) + url.length;
  }
  return out + esc(line.slice(last));
}

function button(url: string): string {
  return `<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:${COLORS.accent};color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(label(url))}</a></p>`
    + `<p style="margin:-8px 0 16px;font-size:12px;color:${COLORS.muted};word-break:break-all">${esc(url)}</p>`;
}

/** A short, language-neutral button label: the page the link opens. */
function label(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + (u.pathname === "/" ? "" : u.pathname)).replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function emailHtml(subject: string, text: string): string {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const body = blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.length === 1 && /^https?:\/\/\S+$/.test(lines[0].trim())) return button(lines[0].trim());
      // A paragraph that ends with a link on its own line: the text, then the link as a button.
      const tail = lines[lines.length - 1].trim();
      if (lines.length > 1 && /^https?:\/\/\S+$/.test(tail)) {
        return `<p style="margin:0 0 8px">${lines.slice(0, -1).map(inline).join("<br>")}</p>${button(tail)}`;
      }
      return `<p style="margin:0 0 16px">${lines.map(inline).join("<br>")}</p>`;
    })
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.rule};border-radius:12px;overflow:hidden">
<tr><td style="background:${COLORS.wood};padding:16px 24px;color:${COLORS.gold};font:bold 20px Georgia,'Times New Roman',serif;letter-spacing:1px">&#9670; Quest Board</td></tr>
<tr><td style="padding:24px;color:${COLORS.ink};font:15px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${body}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
