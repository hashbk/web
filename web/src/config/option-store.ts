import { RENDEZVOUS_PORT } from "../constants.js";
import { getLocalOption } from "../i18n/translate.js";

const OPTION_PREFIX = "rustdesk:option:";
const USER_DEFAULT_PREFIX = "rustdesk:ud:";
const DEFAULT_API_SERVER = "https://admin.rustdesk.com";

const USER_DEFAULT_DEFAULTS: Record<string, string> = {
  "view_style": "original",
  "scroll_style": "scrollauto",
  "image_quality": "balanced",
  "codec-preference": "auto",
  "trackpad-speed": "100",
  "custom-fps": "30",
  "custom-image-quality": "50",
  "enable-file-copy-paste": "Y",
  "edge-scroll-edge-thickness": "100",
};

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

export function getOption(key: string): string {
  if (!hasLocalStorage()) return "";
  return localStorage.getItem(OPTION_PREFIX + key) || "";
}

export function setOption(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  if (value === "") {
    localStorage.removeItem(OPTION_PREFIX + key);
  } else {
    localStorage.setItem(OPTION_PREFIX + key, value);
  }
}

export function getAllOptions(): string {
  if (!hasLocalStorage()) return "{}";
  const result: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OPTION_PREFIX)) {
      result[key.slice(OPTION_PREFIX.length)] = localStorage.getItem(key) || "";
    }
  }
  return JSON.stringify(result);
}

export function setAllOptions(json: string): void {
  if (!hasLocalStorage()) return;
  let map: Record<string, string>;
  try {
    map = JSON.parse(json) as Record<string, string>;
  } catch {
    return;
  }
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(OPTION_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  for (const [k, v] of Object.entries(map)) {
    if (v !== "") {
      localStorage.setItem(OPTION_PREFIX + k, v);
    }
  }
}

export function getUserDefaultOption(key: string): string {
  if (hasLocalStorage()) {
    const stored = localStorage.getItem(USER_DEFAULT_PREFIX + key);
    if (stored !== null) return stored;
  }
  return USER_DEFAULT_DEFAULTS[key] ?? "";
}

export function setUserDefaultOption(key: string, value: string): void {
  if (!hasLocalStorage()) return;
  if (value === "") {
    localStorage.removeItem(USER_DEFAULT_PREFIX + key);
  } else {
    localStorage.setItem(USER_DEFAULT_PREFIX + key, value);
  }
}

function increasePort(endpoint: string, delta: number): string {
  const s = endpoint.replace(/^[a-z]+:\/\//i, "");
  if (s.startsWith("[")) {
    const idx = s.indexOf("]");
    const host = s.slice(0, idx + 1);
    const port = parseInt(s.slice(idx + 2), 10);
    if (Number.isNaN(port)) return endpoint;
    return `${host}:${port + delta}`;
  }
  const i = s.lastIndexOf(":");
  if (i < 0) return endpoint;
  const host = s.slice(0, i);
  const port = parseInt(s.slice(i + 1), 10);
  if (Number.isNaN(port)) return endpoint;
  return `${host}:${port + delta}`;
}

export function deriveApiServer(): string {
  const api = getOption("api-server");
  let res: string;
  if (api) {
    res = api;
  } else {
    const custom = getOption("custom-rendezvous-server");
    if (custom) {
      const increased = increasePort(custom, -2);
      res = increased === custom
        ? `http://${custom}:${RENDEZVOUS_PORT - 2}`
        : `http://${increased}`;
    } else {
      res = DEFAULT_API_SERVER;
    }
  }
  while (res.endsWith("/")) {
    res = res.slice(0, -1);
  }
  if (
    res.startsWith("https") &&
    res.endsWith(":21114") &&
    getLocalOption("allow-https-21114") !== "Y"
  ) {
    res = res.replace(":21114", "");
  }
  return res;
}