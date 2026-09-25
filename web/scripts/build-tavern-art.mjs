// Generates the medieval-tavern theme art (original, script-free SVG):
//   public/textures/parchment.svg   paper grain tile (body background)
//   public/textures/wood.svg        dark oak grain tile (header, footer, tab bar)
//   public/textures/wood-faint.svg  subtle grain tile (dark-mode body)
//   public/textures/flourish.svg    ornament used as a CSS mask (.ornament)
//   public/images/tavern/hero.svg   candlelit tavern scene (home hero)
// Run: npm run tavern-art
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "public");
mkdirSync(join(root, "textures"), { recursive: true });
mkdirSync(join(root, "images", "tavern"), { recursive: true });
const write = (rel, svg) => writeFileSync(join(root, rel), svg.replace(/\n\s*/g, "\n").trim() + "\n");

// Deterministic PRNG so the art is stable between runs.
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

write("textures/parchment.svg", `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <filter id="fine" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.42  0 0 0 0 0.28  0 0 0 0 0.12  0 0 0 0.10 0"/>
  </filter>
  <filter id="blotch" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="3" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.16  0 0 0 0.16 -0.04"/>
  </filter>
  <rect width="360" height="360" filter="url(#blotch)"/>
  <rect width="360" height="360" filter="url(#fine)"/>
</svg>`);

const woodTile = (alpha) => `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="180" viewBox="0 0 900 180">
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.09" numOctaves="4" seed="11" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.10  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 ${alpha} ${-alpha * 0.35}"/>
  </filter>
  <filter id="shine" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.004 0.05" numOctaves="2" seed="5" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.75  0 0 0 0 0.45  0 0 0 ${alpha * 0.35} ${-alpha * 0.12}"/>
  </filter>
  <rect width="900" height="180" filter="url(#grain)"/>
  <rect width="900" height="180" filter="url(#shine)"/>
  <!-- no plank seams: they would cut through header text -->
</svg>`;
write("textures/wood.svg", woodTile(0.55));
write("textures/wood-faint.svg", woodTile(0.22));

write("textures/flourish.svg", `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="24" viewBox="0 0 240 24">
  <path d="M8 12 H92 M148 12 H232" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M92 12 q8 -9 16 0 q-8 9 -16 0 Z M132 12 q8 -9 16 0 q-8 9 -16 0 Z" fill="#000"/>
  <path d="M120 3 L128 12 L120 21 L112 12 Z" fill="#000"/>
  <circle cx="4" cy="12" r="2.2" fill="#000"/><circle cx="236" cy="12" r="2.2" fill="#000"/>
</svg>`);

// ── Hero: a candlelit tavern at night. Busy detail stays on the right; the left third is calm for text.
const W = 1600, H = 720;
const planks = Array.from({ length: 16 }, (_, i) => {
  const x = i * 104 + (rnd() * 10 - 5);
  return `<line x1="${x.toFixed(1)}" y1="70" x2="${x.toFixed(1)}" y2="560" stroke="#0c0703" stroke-opacity=".55" stroke-width="3"/>`;
}).join("");
const stones = [];
for (let row = 0; row < 9; row++) {
  for (let col = 0; col < 8; col++) {
    const x = 1036 + col * 56 + (row % 2 ? 28 : 0), y = 176 + row * 48;
    
    const shade = pick(["#4b3b2f", "#554436", "#403228", "#5c4a3b"]);
    stones.push(`<rect x="${x}" y="${y}" width="52" height="44" rx="9" fill="${shade}"/>`);
  }
}
const bottles = Array.from({ length: 9 }, (_, i) => {
  const x = 610 + i * 34, h = 46 + Math.floor(rnd() * 30), c = pick(["#2f5a3a", "#6b2a1e", "#3d3a6b", "#7a5a1e", "#2a4a5a"]);
  return `<g><rect x="${x}" y="${238 - h}" width="22" height="${h}" rx="7" fill="${c}"/><rect x="${x + 7}" y="${226 - h}" width="8" height="16" rx="2" fill="${c}"/><rect x="${x + 4}" y="${246 - h}" width="4" height="${h - 20}" rx="2" fill="#fff" fill-opacity=".12"/></g>`;
}).join("");
const lantern = (x, len) => `
  <line x1="${x}" y1="60" x2="${x}" y2="${60 + len}" stroke="#1a0f07" stroke-width="3"/>
  <circle cx="${x}" cy="${60 + len + 46}" r="150" fill="url(#lamp)"/>
  <path d="M${x - 22} ${60 + len + 14} h44 l-6 -12 h-32 Z" fill="#2a1a0d"/>
  <rect x="${x - 20}" y="${60 + len + 14}" width="40" height="58" rx="6" fill="#ffcf73" fill-opacity=".85"/>
  <path d="M${x} ${60 + len + 28} q8 12 0 26 q-8 -14 0 -26 Z" fill="#fff4cf"/>
  <g stroke="#2a1a0d" stroke-width="4"><line x1="${x - 20}" y1="${60 + len + 14}" x2="${x - 20}" y2="${60 + len + 72}"/><line x1="${x + 20}" y1="${60 + len + 14}" x2="${x + 20}" y2="${60 + len + 72}"/><line x1="${x}" y1="${60 + len + 14}" x2="${x}" y2="${60 + len + 72}" stroke-width="2"/></g>
  <path d="M${x - 24} ${60 + len + 72} h48 l-8 10 h-32 Z" fill="#2a1a0d"/>`;
const tankard = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M52 22 q34 0 34 30 q0 30 -34 30" fill="none" stroke="#5a3a1c" stroke-width="10"/>
    <rect x="0" y="10" width="60" height="86" rx="8" fill="#7a4e26"/>
    <rect x="0" y="22" width="60" height="8" fill="#3d2610"/><rect x="0" y="76" width="60" height="8" fill="#3d2610"/>
    <path d="M-4 14 q10 -18 22 -8 q10 -14 24 -2 q12 -10 20 6 q4 8 -4 10 H-2 q-8 -2 -2 -6 Z" fill="#fff3d6"/>
    <rect x="8" y="34" width="6" height="40" rx="3" fill="#fff" fill-opacity=".14"/>
  </g>`;

write("images/tavern/hero.svg", `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1a0d"/><stop offset="1" stop-color="#1b1008"/></linearGradient>
    <radialGradient id="fire" cx="1270" cy="540" r="720" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb04a" stop-opacity=".55"/><stop offset=".45" stop-color="#d9651e" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="#ffd27a" stop-opacity=".45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <radialGradient id="candle"><stop offset="0" stop-color="#ffe3a0" stop-opacity=".7"/><stop offset="1" stop-color="#ffe3a0" stop-opacity="0"/></radialGradient>
    <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a1a"/><stop offset=".6" stop-color="#ffb23a"/><stop offset="1" stop-color="#fff0b0"/></linearGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3719"/><stop offset=".12" stop-color="#3e2510"/><stop offset="1" stop-color="#1c1007"/></linearGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.06" numOctaves="4" seed="9"/><feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0 0  0 0 0 .5 -.18"/></filter>
    <filter id="blur"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
  ${planks}

  <!-- ceiling beam and braces -->
  <rect x="0" y="0" width="${W}" height="70" fill="#140b05"/>
  <rect x="0" y="62" width="${W}" height="10" fill="#3a2410"/>
  <path d="M180 70 L260 170 L276 160 L204 70 Z M1000 70 L940 160 L956 170 L1024 70 Z" fill="#140b05"/>

  <!-- shelf with bottles -->
  <rect x="590" y="238" width="330" height="14" rx="3" fill="#4a2d14"/>
  <rect x="600" y="252" width="10" height="26" fill="#2a1a0d"/><rect x="900" y="252" width="10" height="26" fill="#2a1a0d"/>
  ${bottles}

  <!-- hearth -->
  <clipPath id="hearth"><path d="M1040 610 V300 q0 -90 110 -120 h210 q110 30 110 120 V610 Z"/></clipPath>
  <path d="M1040 610 V300 q0 -90 110 -120 h210 q110 30 110 120 V610 Z" fill="#3a2d23"/>
  <g clip-path="url(#hearth)">${stones.join("")}</g>
  <path d="M1130 610 V380 q0 -70 110 -80 q110 10 110 80 V610 Z" fill="#0b0603"/>
  <rect x="1020" y="172" width="480" height="24" rx="4" fill="#4a2d14"/>
  <g filter="url(#blur)" opacity=".9"><ellipse cx="1240" cy="560" rx="120" ry="60" fill="#ff8a2a"/></g>
  <path d="M1170 600 q20 -90 55 -120 q-8 55 22 70 q4 -60 40 -95 q-6 70 30 90 q16 -30 12 -60 q40 50 20 115 Z" fill="url(#flame)"/>
  <path d="M1200 600 q14 -50 38 -70 q-2 34 18 44 q10 -30 28 -44 q0 40 14 70 Z" fill="#fff0b0" fill-opacity=".9"/>
  <g fill="#2a160a"><rect x="1150" y="594" width="190" height="20" rx="10"/><rect x="1180" y="584" width="140" height="16" rx="8" transform="rotate(-6 1250 592)"/></g>
  <rect width="${W}" height="${H}" fill="url(#fire)"/>

  <!-- lanterns -->
  ${lantern(330, 60)}
  ${lantern(820, 30)}

  <!-- table and props (right side) -->
  <rect x="0" y="600" width="${W}" height="${H - 600}" fill="url(#table)"/>
  <rect x="0" y="598" width="${W}" height="6" fill="#7a5130" fill-opacity=".6"/>
  <!-- scroll map -->
  <g transform="translate(640 612) rotate(-4)">
    <rect x="0" y="0" width="230" height="70" rx="6" fill="#e9d6a8"/>
    <rect x="-10" y="-4" width="22" height="78" rx="11" fill="#c9ae78"/><rect x="218" y="-4" width="22" height="78" rx="11" fill="#c9ae78"/>
    <path d="M30 40 q30 -26 60 -6 t70 -8 t50 10" fill="none" stroke="#8e2b1c" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M186 22 l8 8 m0 -8 l-8 8" stroke="#8e2b1c" stroke-width="3"/>
  </g>
  <!-- candle -->
  <circle cx="930" cy="560" r="120" fill="url(#candle)"/>
  <rect x="918" y="560" width="24" height="56" rx="4" fill="#efe0bf"/>
  <path d="M918 566 q12 8 24 0" fill="none" stroke="#d9c69c" stroke-width="3"/>
  <path d="M930 526 q10 16 0 32 q-10 -16 0 -32 Z" fill="url(#flame)"/>
  <ellipse cx="930" cy="618" rx="34" ry="8" fill="#6b4a2a"/>
  ${tankard(990, 520)}
  ${tankard(1110, 540, 0.85)}
  <!-- d20 -->
  <g transform="translate(1290 560)">
    <path d="M40 0 L78 22 L78 64 L40 86 L2 64 L2 22 Z" fill="#8e2b1c"/>
    <path d="M40 0 L62 40 L18 40 Z" fill="#b8402a"/>
    <path d="M18 40 L62 40 L40 86 Z" fill="#6f1f13"/>
    <path d="M2 22 L18 40 L2 64 Z M78 22 L62 40 L78 64 Z" fill="#7a2517"/>
    <path d="M40 0 L78 22 L62 40 Z M40 0 L2 22 L18 40 Z" fill="#a33522"/>
    <text x="40" y="34" font-family="Georgia, serif" font-size="16" font-weight="700" text-anchor="middle" fill="#fbe9c8">20</text>
  </g>
  <!-- coins -->
  <g fill="#d8a53c" stroke="#8a6320" stroke-width="2"><ellipse cx="1420" cy="640" rx="20" ry="7"/><ellipse cx="1426" cy="632" rx="20" ry="7"/><ellipse cx="1462" cy="646" rx="20" ry="7"/></g>

  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
</svg>`);

console.log("tavern art written");
