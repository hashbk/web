import { RENDEZVOUS_PORT, DEFAULT_RS_PUB_KEY } from "../constants.js";
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

const DEFAULT_RENDEZVOUS_SERVER = "rs-ny.rustdesk.com";

export function deriveRendezvousServer(): string {
  const custom = getOption("custom-rendezvous-server");
  const host = custom || DEFAULT_RENDEZVOUS_SERVER;
  if (host.includes(":")) return host;
  return `${host}:${RENDEZVOUS_PORT}`;
}

export function deriveLicenceKey(): string {
  const key = getOption("key");
  return key || DEFAULT_RS_PUB_KEY;
}

const PEER_OPTION_PREFIX = "rustdesk:peer:";
const PEER_INDEX_KEY = "rustdesk:peer-index";

function loadPeerIndex(): string[] {
  if (!hasLocalStorage()) return [];
  const raw = localStorage.getItem(PEER_INDEX_KEY);
  if (raw === null) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function savePeerIndex(ids: string[]): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(PEER_INDEX_KEY, JSON.stringify(ids));
}

export function getPeerOption(peerId: string, name: string): string {
  if (!hasLocalStorage()) return "";
  return localStorage.getItem(`${PEER_OPTION_PREFIX}${peerId}:option:${name}`) || "";
}

export function setPeerOption(peerId: string, name: string, value: string): void {
  if (!hasLocalStorage()) return;
  const key = `${PEER_OPTION_PREFIX}${peerId}:option:${name}`;
  if (value === "") {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
    const ids = loadPeerIndex();
    if (!ids.includes(peerId)) {
      ids.push(peerId);
      savePeerIndex(ids);
    }
  }
}

export function getPeerToggleOption(peerId: string, name: string): boolean {
  return getPeerOption(peerId, name) === "Y";
}

export function setPeerToggleOption(peerId: string, name: string, enabled: boolean): void {
  setPeerOption(peerId, name, enabled ? "Y" : "");
}

export interface PeerEntry {
  id: string;
  username: string;
  hostname: string;
  platform: string;
  alias: string;
  tm: number;
}

export function getAllPeers(): PeerEntry[] {
  if (!hasLocalStorage()) return [];
  const peerIds = loadPeerIndex();
  const peers: PeerEntry[] = [];
  for (const id of peerIds) {
    if (!id) continue;
    const infoRaw = getPeerOption(id, "info");
    const tm = parseInt(getPeerOption(id, "tm"), 10) || 0;
    const alias = getPeerOption(id, "alias");
    let username = "";
    let hostname = "";
    let platform = "";
    if (infoRaw) {
      try {
        const info = JSON.parse(infoRaw) as {
          username?: string;
          hostname?: string;
          platform?: string;
        };
        username = info.username || "";
        hostname = info.hostname || "";
        platform = info.platform || "";
      } catch {
        // ignore invalid info json
      }
    }
    peers.push({ id, username, hostname, platform, alias, tm });
  }
  return peers;
}

export function removePeerOptions(peerId: string): void {
  if (!hasLocalStorage()) return;
  const prefix = `${PEER_OPTION_PREFIX}${peerId}:option:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
  const ids = loadPeerIndex();
  const idx = ids.indexOf(peerId);
  if (idx >= 0) {
    ids.splice(idx, 1);
    savePeerIndex(ids);
  }
}