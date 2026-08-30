import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(join(scriptDir, "..", "dist"));
const indexHtmlPath = process.argv[2] ?? process.env.INDEX_HTML;

function hashFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing build artifact: ${filePath}`);
  }
  return createHash("sha256")
    .update(readFileSync(filePath))
    .digest("hex")
    .slice(0, 12);
}

const manifestPath = join(distDir, ".vite", "manifest.json");
if (!existsSync(manifestPath)) {
  throw new Error(`Vite manifest not found: ${manifestPath}`);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const entryKey = Object.keys(manifest).find(
  (k) => manifest[k].isEntry,
);
if (!entryKey) {
  throw new Error("manifest has no entry chunk (isEntry)");
}
const entry = manifest[entryKey];
const entryFile = entry.file;

const importChunks = (entry.imports ?? [])
  .map((k) => manifest[k])
  .filter((c) => c && c.file);
const vendorChunk = importChunks.find((c) => c.name === "vendor");
if (!vendorChunk) {
  throw new Error("manifest entry has no vendor import chunk");
}
const vendorFile = vendorChunk.file;

const allChunkFiles = [entryFile, ...importChunks.map((c) => c.file)];
const observabilityTargets = ["ffmpeg.js", "ffmpeg-core.js", "ffmpeg-core.wasm"];

const versions = {};
for (const name of allChunkFiles) {
  versions[name] = hashFile(join(distDir, name));
}
for (const name of observabilityTargets) {
  if (existsSync(join(distDir, name))) {
    versions[name] = hashFile(join(distDir, name));
  }
}

const versionJson = JSON.stringify(versions, null, 2) + "\n";
writeFileSync(join(distDir, "version.json"), versionJson);

if (indexHtmlPath) {
  const resolvedIndex = resolve(indexHtmlPath);
  if (!existsSync(resolvedIndex)) {
    throw new Error(`index.html not found: ${resolvedIndex}`);
  }
  let html = readFileSync(resolvedIndex, "utf8");

  const replacements = [
    { placeholder: "index", file: entryFile },
    { placeholder: "vendor", file: vendorFile },
  ];
  for (const { placeholder, file } of replacements) {
    const pattern = new RegExp(
      `js/${placeholder}(?:-[A-Za-z0-9]+)?\\.js`,
      "g",
    );
    if (!pattern.test(html)) {
      throw new Error(`index.html does not reference js/${placeholder}*.js`);
    }
    html = html.replace(pattern, `js/${file}`);
  }
  writeFileSync(resolvedIndex, html);
  writeFileSync(join(dirname(resolvedIndex), "version.json"), versionJson);
}

console.log("[version-assets] entry:", entryFile, "vendor:", vendorFile);
console.log("[version-assets] asset versions:", versions);
if (indexHtmlPath) {
  console.log(`[version-assets] injected cache-bust into ${resolve(indexHtmlPath)}`);
}
