import { BridgeDispatcher } from "./bridge/dispatcher.js";
import type { BridgeConfig } from "./bridge/dispatcher.js";
import { initSodium } from "./crypto/sodium.js";
import { DEFAULT_RS_PUB_KEY } from "./constants.js";

const g = globalThis as unknown as Record<string, unknown>;

let dispatcher: BridgeDispatcher | null = null;

async function ensureDispatcher(): Promise<BridgeDispatcher> {
  if (dispatcher) return dispatcher;
  await initSodium();
  const config: BridgeConfig = {
    rendezvousServer: "",
    rsPubKey: DEFAULT_RS_PUB_KEY,
    onGlobalEvent: (json: string) => {
      if (typeof g["onGlobalEvent"] === "function") {
        (g["onGlobalEvent"] as (msg: string) => void)(json);
      }
    },
    onRgba: (display: number, rgba: Uint8Array) => {
      if (typeof g["onRgba"] === "function") {
        (g["onRgba"] as (d: number, r: Uint8Array) => void)(display, rgba);
      }
    },
  };
  dispatcher = new BridgeDispatcher(config);
  return dispatcher;
}

g["setByName"] = async (name: string, ...args: unknown[]): Promise<string> => {
  const d = await ensureDispatcher();
  const value = typeof args[0] === "string" ? args[0] : "";
  try {
    return await d.setByName(name, value);
  } catch (err) {
    console.error(`setByName("${name}") failed:`, err);
    return "";
  }
};

g["getByName"] = async (name: string, ...args: unknown[]): Promise<string> => {
  const d = await ensureDispatcher();
  const arg = typeof args[0] === "string" ? args[0] : "";
  try {
    return await d.getByName(name, arg);
  } catch (err) {
    console.error(`getByName("${name}") failed:`, err);
    return "";
  }
};

g["isMobile"] = (): boolean => {
  return typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
};

g["rustdeskLocalFonts"] = false;

console.log("[rustdesk-web] bridge ready");