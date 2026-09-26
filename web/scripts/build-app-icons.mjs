// Generates the Quest Board app icon (a d20 on a dark-wood tile) in every format browsers
// and phones ask for. Outputs are committed; re-run after changing the artwork:
//   npm run app-icons
//
//   src/app/icon.svg          modern browsers (tab icon, scales to any size)
//   src/app/favicon.ico       legacy browsers (16/32/48 px PNGs inside one .ico)
//   src/app/apple-icon.png    iOS home screen (180 px)
//   public/icons/icon-192.png, icon-512.png, maskable-512.png   web app manifest
//
// PNGs are rendered with the Playwright browser used by the e2e tests (Microsoft Edge).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const WOOD = "#2a1a0e", AMBER = "#e8a54b", OX = "#8e2b1c", OX2 = "#b4432c", PAPER = "#f6ead0";

// The die, drawn in a 64×64 box. `scale` shrinks it about the centre (maskable icons keep
// everything inside the central 80% "safe zone").
const die = (scale = 1) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)" stroke="${AMBER}" stroke-linejoin="round" stroke-linecap="round">
    <path d="M32 7 L54 19.5 V44.5 L32 57 L10 44.5 V19.5 Z" fill="${OX}" stroke-width="3.2"/>
    <path d="M32 18 L46.5 42 H17.5 Z" fill="${OX2}" stroke-width="2.6"/>
    <path d="M32 7 V18 M10 19.5 L32 18 L54 19.5 M10 19.5 L17.5 42 L10 44.5 M54 19.5 L46.5 42 L54 44.5 M17.5 42 L32 57 L46.5 42" fill="none" stroke-width="2.6"/>
    <path d="M27.5 36 h9 l-4.5 -7 Z" fill="${PAPER}" stroke="none"/>
  </g>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${WOOD}"/>
  <rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="${AMBER}" stroke-opacity=".35" stroke-width="1.5"/>
  ${die(0.92)}
</svg>
`;
// Full-bleed square (the OS applies its own mask) with the die inside the safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${WOOD}"/>
  ${die(0.62)}
</svg>
`;

writeFileSync(join(root, "src/app/icon.svg"), icon);
mkdirSync(join(root, "public/icons"), { recursive: true });

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage();
async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

writeFileSync(join(root, "src/app/apple-icon.png"), await png(icon, 180));
writeFileSync(join(root, "public/icons/icon-192.png"), await png(icon, 192));
writeFileSync(join(root, "public/icons/icon-512.png"), await png(icon, 512));
writeFileSync(join(root, "public/icons/maskable-512.png"), await png(maskable, 512));

// .ico with PNG payloads (supported by every browser since IE Vista-era).
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(icon, s));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync(join(root, "src/app/favicon.ico"), Buffer.concat([header, ...images]));

await browser.close();
console.log("app icons written: icon.svg, favicon.ico (16/32/48), apple-icon.png, icons/{192,512,maskable-512}.png");
