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

const moduleToCode = {
  ar: "ar", be: "be", bg: "bg", ca: "ca", cn: "zh-cn", cs: "cs",
  da: "da", de: "de", el: "el", en: "en", eo: "eo", es: "es",
  et: "et", eu: "eu", fa: "fa", fr: "fr", ge: "ge", gu: "gu",
  he: "he", hi: "hi", hr: "hr", hu: "hu", id: "id", it: "it",
  ja: "ja", ko: "ko", kz: "kz", lt: "lt", lv: "lv", ml: "ml",
  nb: "nb", nl: "nl", pl: "pl", ptbr: "pt", ro: "ro", ru: "ru",
  sc: "sc", sk: "sk", sl: "sl", sq: "sq", sr: "sr", sv: "sv",
  ta: "ta", th: "th", tr: "tr", tw: "zh-tw", uk: "uk", ur: "ur",
  vi: "vi", fi: "fi",
};

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
  const moduleKey = Object.keys(moduleToCode).find((k) => moduleToCode[k] === code);
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
