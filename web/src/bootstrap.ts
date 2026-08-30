import { BridgeDispatcher } from "./bridge/dispatcher.js";
import type { BridgeConfig } from "./bridge/dispatcher.js";
import { initSodium } from "./crypto/sodium.js";
import { initZstd } from "./file/zstd.js";
import { loadLang, preloadAllLangs } from "./i18n/translate.js";
import { DEFAULT_RS_PUB_KEY } from "./constants.js";

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

initZstd().catch((err) => {
  console.error("[rustdesk-web] zstd init failed:", err);
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
        } else {
          (frame as { close?: () => void }).close?.();
        }
      },
      onLoadAbFinished: (json: string) => {
        if (typeof g["onLoadAbFinished"] === "function") {
          (g["onLoadAbFinished"] as (s: string) => void)(json);
        }
      },
      onLoadGroupFinished: (json: string) => {
        if (typeof g["onLoadGroupFinished"] === "function") {
          (g["onLoadGroupFinished"] as (s: string) => void)(json);
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
      const msg = err instanceof Error ? err.message : String(err);
      globalEventSink?.(
        JSON.stringify({
          name: "msgbox",
          type: "error",
          title: "Connection Error",
          text: msg,
          link: "",
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
    return getDispatcher().getByName(name, arg);
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
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  Promise.all([initSodium(), loadLang(locale)])
    .then(() => {
      sodiumReady = true;
      if (typeof g["onInitFinished"] === "function") {
        (g["onInitFinished"] as () => void)();
      }
      preloadAllLangs();
    })
    .catch((err) => {
      console.error("[rustdesk-web] init failed:", err);
      if (typeof g["onInitFinished"] === "function") {
        (g["onInitFinished"] as () => void)();
      }
      preloadAllLangs();
    });
};

console.log("[rustdesk-web] bridge ready (sodium:", sodiumReady ? "ready" : "loading", ")");
