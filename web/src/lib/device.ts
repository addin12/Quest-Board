// A short label for a browser's User-Agent ("Chrome · Android": reads the same in both languages),
// for the list of places you're logged in and the new-device email. Only the label is stored, never
// the full string. "" = not recognised (shown as "Unknown browser").

const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/|Edg\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/OPR\/|Opera/, "Opera"],
  [/FxiOS\/|Firefox\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPad/, "iPad"],
  [/iPhone|iPod/, "iPhone"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? "";
}
