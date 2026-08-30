import translationsMeta from "./translations-meta.json" with { type: "json" };
import enDict from "./lang/en.json" with { type: "json" };

const LANGS = translationsMeta.langs as [string, string][];

const loadedDicts: Record<string, Record<string, string>> = { en: enDict };
const loadingPromises: Record<string, Promise<void>> = {};

function resolveLang(savedLang: string, locale: string): string {
  const localeLower = locale.toLowerCase();
  let lang = savedLang.toLowerCase();

  if (!lang) {
    if (localeLower.startsWith("zh-cn") || localeLower.startsWith("zh-hans")) {
      lang = "zh-cn";
    } else if (
      localeLower.startsWith("zh-tw") ||
      localeLower.startsWith("zh-hant") ||
      localeLower.startsWith("zh-hk")
    ) {
      lang = "zh-tw";
    } else if (localeLower.startsWith("pt-br")) {
      lang = "pt";
    } else {
      const parts = localeLower.split(/[-_]/);
      lang = parts[0] || "en";
    }
  }

  const known = (code: string): boolean =>
    loadedDicts[code] != null || LANGS.some(([c]) => c === code);

  if (!known(lang)) {
    const base = lang.split(/[-_]/)[0];
    if (known(base)) {
      lang = base;
    } else {
      lang = "en";
    }
  }

  return lang;
}

function splitPlaceholder(text: string): [string, string | null] {
  const match = text.match(/\{(.*?)\}/);
  if (match && match[1] !== undefined) {
    return [text.replace(/\{(.*?)\}/, "{}"), match[1]];
  }
  return [text, null];
}

function triggerLoad(lang: string): void {
  if (loadedDicts[lang] || loadingPromises[lang] != null) return;
  if (!LANGS.some(([code]) => code === lang)) return;
  loadingPromises[lang] = import(`./lang/${lang}.json`)
    .then((mod) => {
      loadedDicts[lang] = mod.default as Record<string, string>;
    })
    .catch((err) => {
      console.warn(`[i18n] failed to load lang "${lang}":`, err);
    })
    .finally(() => {
      delete loadingPromises[lang];
    });
}

export async function loadLang(lang: string): Promise<void> {
  const savedLang =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("lang") || ""
      : "";
  const resolved = resolveLang(savedLang, lang);
  if (loadedDicts[resolved]) return;
  triggerLoad(resolved);
  await loadingPromises[resolved];
}

export function preloadAllLangs(): void {
  for (const [code] of LANGS) {
    triggerLoad(code);
  }
}

export function translate(locale: string, text: string): string {
  const savedLang =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("lang") || ""
      : "";
  const lang = resolveLang(savedLang, locale);

  const [key, placeholder] = splitPlaceholder(text);

  const dict = loadedDicts[lang] || {};
  const enDictLocal = loadedDicts["en"] || {};

  let result = dict[key];
  if (!result && lang !== "en") {
    result = enDictLocal[key];
  }
  if (!result) {
    result = key;
  }

  if (placeholder !== null) {
    result = result.replace("{}", placeholder);
  }

  if (lang !== "en" && !loadedDicts[lang]) {
    triggerLoad(lang);
  }

  return result;
}

export function getLangs(): string {
  return JSON.stringify(LANGS);
}

export function getLocalOption(key: string): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(key) || "";
}

export function setLocalOption(key: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value);
}
