// Generates the medieval-tavern theme art (original, script-free SVG):
//   public/textures/parchment.svg   paper grain tile (body background)
//   public/textures/wood.svg        dark oak grain tile (header, footer, tab bar)
//   public/textures/wood-faint.svg  subtle grain tile (dark-mode body)
//   public/textures/flourish.svg    ornament used as a CSS mask (.ornament)
//   public/images/tavern/hero.svg   candlelit tavern scene (source)
//   public/images/tavern/hero.webp  the same scene pre-rendered: what the home page shows (its SVG blur and
//                                   noise filters are slow to draw on phones; a picture is decoded once)
// Run: npm run tavern-art
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

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
// 2400 px wide: sharp enough for large and high-density screens; Next resizes it per device.
await sharp(readFileSync(join(root, "images/tavern/hero.svg")), { density: 144 }).resize(2400).webp({ quality: 80 }).toFile(join(root, "images/tavern/hero.webp"));

console.log("tavern art written");

// ── Empty states: a tipped-over tankard, a few drops and a d20. Transparent background. ──
write("images/tavern/empty-tankard.svg", `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150" viewBox="0 0 240 150">
  <ellipse cx="120" cy="132" rx="100" ry="10" fill="#000" fill-opacity=".12"/>
  <g transform="translate(70 34) rotate(-16 40 50)">
    <path d="M58 24 q30 0 30 26 q0 26 -30 26" fill="none" stroke="#5a3a1c" stroke-width="9"/>
    <rect x="0" y="10" width="60" height="80" rx="8" fill="#8a5a2c"/>
    <rect x="0" y="22" width="60" height="7" fill="#3d2610"/><rect x="0" y="72" width="60" height="7" fill="#3d2610"/>
    <rect x="8" y="32" width="6" height="36" rx="3" fill="#fff" fill-opacity=".16"/>
    <ellipse cx="30" cy="10" rx="30" ry="7" fill="#2a1a0d"/>
  </g>
  <g fill="#e8a54b" fill-opacity=".85">
    <ellipse cx="44" cy="122" rx="14" ry="4"/><circle cx="26" cy="116" r="3"/><circle cx="62" cy="112" r="2.4"/>
  </g>
  <g transform="translate(160 86)">
    <path d="M24 0 L47 13 L47 39 L24 52 L1 39 L1 13 Z" fill="#8e2b1c"/>
    <path d="M24 0 L37 24 L11 24 Z" fill="#b8402a"/><path d="M11 24 L37 24 L24 52 Z" fill="#6f1f13"/>
    <path d="M1 13 L11 24 L1 39 Z M47 13 L37 24 L47 39 Z" fill="#7a2517"/>
    <text x="24" y="20" font-family="Georgia, serif" font-size="10" font-weight="700" text-anchor="middle" fill="#fbe9c8">20</text>
  </g>
</svg>`);

// ── 404: a natural 1 on a candlelit table. ──
write("images/tavern/natural-one.svg", `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
  <defs>
    <radialGradient id="glow" cx="249" cy="100" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <linearGradient id="flame1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#fff0b0"/></linearGradient>
  </defs>
  <rect width="360" height="220" fill="url(#glow)"/>
  <ellipse cx="180" cy="196" rx="170" ry="16" fill="#000" fill-opacity=".14"/>
  <rect x="238" y="96" width="22" height="94" rx="4" fill="#efe0bf"/>
  <path d="M238 104 q11 8 22 0" fill="none" stroke="#d9c69c" stroke-width="3"/>
  <path d="M249 62 q12 18 0 34 q-12 -16 0 -34 Z" fill="url(#flame1)"/>
  <ellipse cx="249" cy="192" rx="32" ry="7" fill="#6b4a2a"/>
  <g transform="translate(96 88)">
    <path d="M52 0 L102 29 L102 85 L52 114 L2 85 L2 29 Z" fill="#8e2b1c"/>
    <path d="M52 0 L81 52 L23 52 Z" fill="#b8402a"/><path d="M23 52 L81 52 L52 114 Z" fill="#6f1f13"/>
    <path d="M2 29 L23 52 L2 85 Z M102 29 L81 52 L102 85 Z" fill="#7a2517"/>
    <path d="M52 0 L102 29 L81 52 Z M52 0 L2 29 L23 52 Z" fill="#a33522"/>
    <text x="52" y="46" font-family="Georgia, serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fbe9c8">1</text>
  </g>
  <g fill="#d8a53c" stroke="#8a6320" stroke-width="2"><ellipse cx="60" cy="186" rx="16" ry="6"/><ellipse cx="300" cy="190" rx="16" ry="6"/></g>
</svg>`);
console.log("extra art written");

// ── Category medallions (home page "Browse by categories") ──
// Flat ink-and-brass illustrations drawn to sit on a parchment circle, in both themes.
mkdirSync(join(root, "images", "categories"), { recursive: true });
const INK = "#2b1d10", OX = "#8e2b1c", OX2 = "#b4432c", BRASS = "#c8912b", PAPER = "#f6ead0", TEAL = "#2f5d62";
const medallion = (body) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" stroke-linejoin="round" stroke-linecap="round">
${body}
</svg>`;

// Game systems: a shelf of rulebooks.
write("images/categories/systems.svg", medallion(`
  <rect x="16" y="92" width="88" height="7" rx="2" fill="${BRASS}" stroke="${INK}" stroke-width="3"/>
  <rect x="24" y="36" width="15" height="56" rx="1.5" fill="${OX}" stroke="${INK}" stroke-width="3"/>
  <path d="M24 44h15M24 84h15" stroke="${PAPER}" stroke-width="2.5"/>
  <rect x="39" y="26" width="17" height="66" rx="1.5" fill="${TEAL}" stroke="${INK}" stroke-width="3"/>
  <path d="M39 36h17M39 82h17M47.5 50v18" stroke="${PAPER}" stroke-width="2.5"/>
  <rect x="56" y="40" width="13" height="52" rx="1.5" fill="${BRASS}" stroke="${INK}" stroke-width="3"/>
  <path d="M56 48h13M56 84h13" stroke="${INK}" stroke-width="2"/>
  <g transform="rotate(-18 86 92)">
    <rect x="72" y="34" width="15" height="58" rx="1.5" fill="${OX2}" stroke="${INK}" stroke-width="3"/>
    <path d="M72 42h15M72 84h15" stroke="${PAPER}" stroke-width="2.5"/>
  </g>`));

// Genres: a dragon rising from an open storybook.
write("images/categories/genres.svg", medallion(`
  <path d="M18 80 Q38 72 60 80 Q82 72 102 80 V100 Q82 92 60 100 Q38 92 18 100 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
  <path d="M60 80 V100" stroke="${INK}" stroke-width="3"/>
  <path d="M26 86 Q36 82 50 86M26 92 Q36 88 50 92M70 86 Q84 82 94 86M70 92 Q84 88 94 92" fill="none" stroke="${INK}" stroke-width="2" opacity=".55"/>
  <path d="M58 64 L30 34 L40 54 L22 48 L40 66 Z" fill="${TEAL}" stroke="${INK}" stroke-width="3"/>
  <path d="M64 62 L94 30 L84 52 L102 46 L82 66 Z" fill="${TEAL}" stroke="${INK}" stroke-width="3"/>
  <path d="M52 82 C46 70 50 58 58 50 C64 44 64 36 60 30 L68 32 L72 26 L74 36 C76 46 70 54 66 60 C62 68 64 76 72 82 Z" fill="${OX}" stroke="${INK}" stroke-width="3"/>
  <circle cx="67" cy="33" r="1.8" fill="${BRASS}"/>
  <path d="M72 82 Q84 84 88 76" fill="none" stroke="${INK}" stroke-width="3"/>`));

// Play styles: a potion with a tag (every table brews its own mix).
write("images/categories/styles.svg", medallion(`
  <rect x="50" y="14" width="20" height="12" rx="2.5" fill="${BRASS}" stroke="${INK}" stroke-width="3"/>
  <path d="M53 26 h14 v16 C82 46 90 58 90 72 A30 30 0 0 1 30 72 C30 58 38 46 53 42 Z" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
  <path d="M32.5 76 Q45 68 60 75 T87.5 76 A28 28 0 0 1 32.5 76 Z" fill="${OX}" stroke="${INK}" stroke-width="2.5"/>
  <circle cx="48" cy="86" r="3.5" fill="${PAPER}"/><circle cx="57" cy="93" r="2" fill="${PAPER}"/><circle cx="70" cy="84" r="2.6" fill="${PAPER}"/>
  <path d="M40 60 Q42 52 50 48" fill="none" stroke="${INK}" stroke-width="2" opacity=".4"/>
  <path d="M67 32 L84 40" stroke="${INK}" stroke-width="2.5"/>
  <g transform="rotate(24 90 44)"><path d="M82 36 h18 v14 h-18 l-5 -7 Z" fill="${TEAL}" stroke="${INK}" stroke-width="2.5"/><circle cx="84" cy="43" r="1.8" fill="${PAPER}"/></g>`));

// Mechanics: a d20.
write("images/categories/mechanics.svg", medallion(`
  <path d="M60 14 L100 37 V83 L60 106 L20 83 V37 Z" fill="${OX}" stroke="${INK}" stroke-width="3.5"/>
  <path d="M60 32 L86 76 H34 Z" fill="${OX2}" stroke="${INK}" stroke-width="3"/>
  <path d="M60 14 V32 M20 37 L60 32 L100 37 M20 37 L34 76 L20 83 M100 37 L86 76 L100 83 M34 76 L60 106 L86 76" fill="none" stroke="${INK}" stroke-width="3"/>
  <path d="M52 64 h16 l-8 -12 Z" fill="${PAPER}"/>`));
console.log("category medallions written");
