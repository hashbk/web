#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const langDir = resolve(root, "../rustdesk/src/lang");
const langRsPath = resolve(root, "../rustdesk/src/lang.rs");
const outDir = resolve(root, "src/i18n");

if (!existsSync(langDir)) {
  console.error(`error: lang directory not found: ${langDir}`);
  console.error("Ensure the rustdesk git submodule is initialized.");
  process.exit(1);
}

const langRsContent = readFileSync(langRsPath, "utf-8");

const langsMatch = langRsContent.match(/pub const LANGS[^=]*=\s*&\[(.*?)\];/s);
if (!langsMatch) {
  console.error("error: could not parse LANGS array from lang.rs");
  process.exit(1);
}

const LANGS = [];
const langEntryRe = /\("([^"]+)",\s*"([^"]+)"\)/g;
let m;
while ((m = langEntryRe.exec(langsMatch[1])) !== null) {
  LANGS.push([m[1], m[2]]);
}

// Parse the code -> module mapping from the `translate_locale` match block in
// lang.rs so new languages added upstream are picked up automatically instead
// of maintaining a hardcoded table here.
const matchBlockRe = /match\s+lang\.as_str\(\)\s*\{([\s\S]*?)\n\s*\}/;
const matchBlock = langRsContent.match(matchBlockRe);
if (!matchBlock) {
  console.error("error: could not parse translate_locale match block from lang.rs");
  process.exit(1);
}
const codeToModule = {};
let defaultModule = null;
const mappingEntryRe = /"([^"]+)"\s*=>\s*(\w+)::T\.deref\(\)/g;
let mm;
while ((mm = mappingEntryRe.exec(matchBlock[1])) !== null) {
  codeToModule[mm[1]] = mm[2];
}
const defaultMatch = matchBlock[1].match(/_\s*=>\s*(\w+)::T\.deref\(\)/);
if (defaultMatch) {
  defaultModule = defaultMatch[1];
}

function parseLangFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const entries = {};
  const entryRe = /\("([^"]*)",\s*"((?:[^"\\]|\\.)*)"\)/g;
  let m2;
  while ((m2 = entryRe.exec(content)) !== null) {
    let key = m2[1];
    let value = m2[2];
    value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    entries[key] = value;
  }
  return entries;
}

const translations = {};
for (const [code, displayName] of LANGS) {
  const moduleKey = codeToModule[code] ?? defaultModule;
  if (!moduleKey) {
    console.warn(`warning: no module mapping for lang code "${code}", skipping`);
    continue;
  }
  const filePath = resolve(langDir, `${moduleKey}.rs`);
  if (!existsSync(filePath)) {
    console.warn(`warning: lang file not found: ${filePath}, skipping`);
    continue;
  }
  translations[code] = parseLangFile(filePath);
}

mkdirSync(outDir, { recursive: true });
const langFilesDir = resolve(outDir, "lang");
mkdirSync(langFilesDir, { recursive: true });

const langsList = LANGS.map(([code, name]) => [code, `${name} (${code})`]);
writeFileSync(resolve(outDir, "translations-meta.json"), JSON.stringify({ langs: langsList }), "utf-8");

for (const [code, dict] of Object.entries(translations)) {
  writeFileSync(resolve(langFilesDir, `${code}.json`), JSON.stringify(dict), "utf-8");
}

const langCount = Object.keys(translations).length;
const keyCount = Object.keys(translations["en"] || {}).length;
console.log(`Generated translations-meta.json + ${langCount} per-lang JSON files in ${langFilesDir}`);
console.log(`  Languages: ${langCount}`);
console.log(`  Keys (en): ${keyCount}`);
