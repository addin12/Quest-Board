// Lets `node --test` load server modules written for Next's bundler: "@/…" paths and
// extensionless relative imports resolve to the .ts/.tsx files. Registered by tests/loader.mjs.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = pathToFileURL(path.join(SRC, spec.slice(2))).href;
  const relative = spec.startsWith("./") || spec.startsWith("../");
  if ((relative || spec.startsWith("file:")) && !/\.[cm]?[jt]sx?$/.test(spec) && context.parentURL) {
    const base = spec.startsWith("file:") ? fileURLToPath(spec) : path.resolve(path.dirname(fileURLToPath(context.parentURL)), spec);
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, context);
    }
  }
  return next(spec, context);
}
