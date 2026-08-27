import { BridgeDispatcher } from "./bridge/dispatcher.js";
import type { BridgeConfig } from "./bridge/dispatcher.js";
import { initSodium } from "./crypto/sodium.js";
import { DEFAULT_RS_PUB_KEY, APP_VERSION } from "./constants.js";
import { translate, getLangs, getLocalOption, setLocalOption } from "./i18n/translate.js";
import {
  getOption,
  setOption,
  getAllOptions,
  setAllOptions,
  getUserDefaultOption,
  setUserDefaultOption,
  deriveApiServer,
  getPeerOption,
  setPeerOption,
  getPeerToggleOption,
} from "./config/option-store.js";

declare const __BUILD_DATE__: string | undefined;

const g = globalThis as unknown as Record<string, unknown>;

let dispatcher: BridgeDispatcher | null = null;
let sodiumReady = false;
let globalEventSink: ((json: string) => void) | null = null;

initSodium()
  .then(() => {
    sodiumReady = true;
  })
  .catch((err) => {
    console.error("[rustdesk-web] sodium init failed:", err);
  });

function getDispatcher(): BridgeDispatcher {
  if (!dispatcher) {
    const onGlobalEvent = (json: string) => {
      if (typeof g["onGlobalEvent"] === "function") {
        (g["onGlobalEvent"] as (msg: string) => void)(json);
      }
    };
    globalEventSink = onGlobalEvent;
    const config: BridgeConfig = {
      rendezvousServer: "",
      rsPubKey: DEFAULT_RS_PUB_KEY,
      onGlobalEvent,
      onRegisteredEvent: (json: string) => {
        if (typeof g["onRegisteredEvent"] === "function") {
          (g["onRegisteredEvent"] as (msg: string) => void)(json);
        }
      },
      onRgba: (display: number, rgba: Uint8Array) => {
        if (typeof g["onRgba"] === "function") {
          (g["onRgba"] as (d: number, r: Uint8Array) => void)(display, rgba);
        }
      },
      onVideoFrame: (display: number, frame: unknown) => {
        if (typeof g["onVideoFrame"] === "function") {
          (g["onVideoFrame"] as (d: number, f: unknown) => void)(display, frame);
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
    if (name === "option:local") {
      const opts = JSON.parse(value) as { name?: string; value?: string };
      if (opts.name) {
        setLocalOption(opts.name, opts.value ?? "");
      }
      return "";
    }
    if (name === "option") {
      const opts = JSON.parse(value) as { name?: string; value?: string };
      if (opts.name) {
        setOption(opts.name, opts.value ?? "");
      }
      return "";
    }
    if (name === "option:user:default") {
      const opts = JSON.parse(value) as { name?: string; value?: string };
      if (opts.name) {
        setUserDefaultOption(opts.name, opts.value ?? "");
      }
      return "";
    }
    if (name === "option:peer") {
      const opts = JSON.parse(value) as { id?: string; name?: string; value?: string };
      if (opts.id && opts.name) {
        setPeerOption(opts.id, opts.name, opts.value ?? "");
      }
      return "";
    }
    if (name === "options") {
      setAllOptions(value);
      return "";
    }
    if (name === "save_ab") {
      setOption("ab-cache", value);
      return "";
    }
    if (name === "clear_ab") {
      setOption("ab-cache", "");
      return "";
    }
    if (name === "load_ab") {
      const cache = getOption("ab-cache");
      if (typeof g["onLoadAbFinished"] === "function") {
        (g["onLoadAbFinished"] as (s: string) => void)(cache);
      }
      return "";
    }
    if (name === "save_group") {
      setOption("group-cache", value);
      return "";
    }
    if (name === "clear_group") {
      setOption("group-cache", "");
      return "";
    }
    if (name === "load_group") {
      const cache = getOption("group-cache");
      if (typeof g["onLoadGroupFinished"] === "function") {
        (g["onLoadGroupFinished"] as (s: string) => void)(cache);
      }
      return "";
    }
    const d = getDispatcher();
    void d.setByName(name, value).catch((err) => {
      console.error(`setByName("${name}") failed:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      globalEventSink?.(
        JSON.stringify({
          name: "msgbox",
          type: "error",
          title: "Connection Error",
          text: msg,
        }),
      );
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
        return getAllOptions();
      case "fav":
        return "[]";
      case "my_id":
        return "";
      case "uuid":
        return "";
      case "api_server":
        return deriveApiServer();
      case "image_quality": {
        const d = getDispatcher();
        const peerId = d.getCurrentPeerId();
        if (peerId) {
          return getPeerOption(peerId, "image_quality") || "balanced";
        }
        return "balanced";
      }
      case "langs":
        return getLangs();
      case "translate": {
        const params = JSON.parse(arg) as { locale?: string; text?: string };
        return translate(params.locale ?? "en", params.text ?? "");
      }
      case "option:local":
        return getLocalOption(arg);
      case "option":
        return getOption(arg);
      case "option:user:default":
        return getUserDefaultOption(arg);
      case "option:peer": {
        try {
          const opts = JSON.parse(arg) as { id?: string; name?: string };
          if (opts.id && opts.name) {
            return getPeerOption(opts.id, opts.name);
          }
        } catch {
          return "";
        }
        return "";
      }
      case "option:session": {
        const d = getDispatcher();
        const peerId = d.getCurrentPeerId();
        if (peerId) {
          return getPeerOption(peerId, arg);
        }
        return "";
      }
      case "option:toggle": {
        const d = getDispatcher();
        const peerId = d.getCurrentPeerId();
        if (peerId) {
          return getPeerToggleOption(peerId, arg) ? "true" : "false";
        }
        return "false";
      }
      case "load_recent_peers_sync":
        return "[]";
      case "alternative_codecs":
        return JSON.stringify({ vp8: false, av1: false, h264: false, h265: false });
      case "main_display":
        return "";
      case "build_date":
        return typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";
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
