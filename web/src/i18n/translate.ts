import translationsData from "./translations.json" with { type: "json" };

const LANGS = translationsData.langs as [string, string][];
const TRANSLATIONS: Record<string, Record<string, string>> =
  translationsData.translations;

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

  if (!TRANSLATIONS[lang]) {
    const base = lang.split(/[-_]/)[0];
    if (TRANSLATIONS[base]) {
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

export function translate(locale: string, text: string): string {
  const savedLang =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("lang") || ""
      : "";
  const lang = resolveLang(savedLang, locale);

  const [key, placeholder] = splitPlaceholder(text);

  const dict = TRANSLATIONS[lang] || {};
  const enDict = TRANSLATIONS["en"] || {};

  let result = dict[key];
  if (!result && lang !== "en") {
    result = enDict[key];
  }
  if (!result) {
    result = key;
  }

  if (placeholder !== null) {
    result = result.replace("{}", placeholder);
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