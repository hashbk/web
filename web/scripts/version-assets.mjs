import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(join(scriptDir, "..", "dist"));
const indexHtmlPath = process.argv[2] ?? process.env.INDEX_HTML;

const targets = [
  "rustdesk-web.js",
  "ffmpeg.js",
  "ffmpeg-core.js",
  "ffmpeg-core.wasm",
];

const versions = {};
for (const name of targets) {
  const filePath = join(distDir, name);
  if (!existsSync(filePath)) {
    throw new Error(`Missing build artifact: ${filePath}`);
  }
  versions[name] = createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex")
    .slice(0, 12);
}

writeFileSync(join(distDir, "version.json"), JSON.stringify(versions, null, 2) + "\n");

if (indexHtmlPath) {
  const resolvedIndex = resolve(indexHtmlPath);
  if (!existsSync(resolvedIndex)) {
    throw new Error(`index.html not found: ${resolvedIndex}`);
  }
  let html = readFileSync(resolvedIndex, "utf8");
  const marker = "js/rustdesk-web.js";
  if (!html.includes(marker)) {
    throw new Error(`index.html does not reference ${marker}`);
  }
  const hash = versions["rustdesk-web.js"];
  html = html.replace(
    /js\/rustdesk-web\.js(\?v=[a-f0-9]+)?/g,
    `js/rustdesk-web.js?v=${hash}`,
  );
  writeFileSync(resolvedIndex, html);
  writeFileSync(
    join(dirname(resolvedIndex), "version.json"),
    JSON.stringify(versions, null, 2) + "\n",
  );
}

console.log("[version-assets] asset versions:", versions);
if (indexHtmlPath) {
  console.log(`[version-assets] injected cache-bust into ${resolve(indexHtmlPath)}`);
}