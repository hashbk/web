import { BridgeDispatcher } from "./bridge/dispatcher.js";
import type { BridgeConfig } from "./bridge/dispatcher.js";
import { initSodium } from "./crypto/sodium.js";
import { DEFAULT_RS_PUB_KEY, APP_VERSION } from "./constants.js";

const g = globalThis as unknown as Record<string, unknown>;

let dispatcher: BridgeDispatcher | null = null;
let sodiumReady = false;

initSodium()
  .then(() => {
    sodiumReady = true;
  })
  .catch((err) => {
    console.error("[rustdesk-web] sodium init failed:", err);
  });

function getDispatcher(): BridgeDispatcher {
  if (!dispatcher) {
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
  }
  return dispatcher;
}

g["setByName"] = (name: string, ...args: unknown[]): string => {
  const value = typeof args[0] === "string" ? args[0] : "";
  try {
    const d = getDispatcher();
    void d.setByName(name, value).catch((err) => {
      console.error(`setByName("${name}") failed:`, err);
    });
  } catch (err) {
    console.error(`setByName("${name}") failed:`, err);
  }
  return "";
};

g["getByName"] = (name: string, ...args: unknown[]): string => {
  const arg = typeof args[0] === "string" ? args[0] : "";
  try {
    switch (name) {
      case "platform":
        return "Web";
      case "app-name":
        return "RustDesk";
      case "version":
        return APP_VERSION;
      case "my_name":
        return "Web";
      case "local_os":
        return "Web";
      case "is_using_public_server":
        return "true";
      case "remember":
        return "false";
      case "get_conn_status":
        return JSON.stringify({ status_num: 0 });
      case "options":
        return "{}";
      case "fav":
        return "[]";
      case "my_id":
        return "";
      case "uuid":
        return "";
      case "api_server":
        return "";
      case "image_quality":
        return "balanced";
      case "langs":
        return JSON.stringify([
          { code: "en", name: "English" },
        ]);
      case "load_recent_peers_sync":
        return "[]";
      case "main_display":
        return "";
      case "resolve_avatar_url":
        return arg;
      default:
        if (name.startsWith("option:")) {
          return "";
        }
        if (name.startsWith("envvar:")) {
          return "";
        }
        return "";
    }
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

g["init"] = (): void => {
  initSodium()
    .then(() => {
      sodiumReady = true;
      if (typeof g["onInitFinished"] === "function") {
        (g["onInitFinished"] as () => void)();
      }
    })
    .catch((err) => {
      console.error("[rustdesk-web] init failed:", err);
      if (typeof g["onInitFinished"] === "function") {
        (g["onInitFinished"] as () => void)();
      }
    });
};

console.log("[rustdesk-web] bridge ready (sodium:", sodiumReady ? "ready" : "loading", ")");
