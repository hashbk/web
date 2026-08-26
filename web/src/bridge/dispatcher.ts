import { hbb } from "../proto/index.js";
import { SessionManager } from "../session/session-manager.js";
import type { SessionConfig } from "../session/session-manager.js";
import { ConnType } from "../constants.js";
import { encodeMouseEventFromJson } from "../input/mouse.js";
import {
  encodeInputKeyFromJson,
  encodeInputString,
  encodeFlutterKeyEventFromJson,
  encodeCtrlAltDel,
  encodeLockScreen,
} from "../input/keyboard.js";
import { applyCursor } from "../cursor/cursor.js";

export interface BridgeConfig extends SessionConfig {
  cursorElement?: HTMLElement;
  onGlobalEvent?: (json: string) => void;
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
}

interface SessionEntry {
  manager: SessionManager;
  peerId: string;
  connected: boolean;
}

export class BridgeDispatcher {
  private sessions = new Map<string, SessionEntry>();

  constructor(private config: BridgeConfig) {}

  async setByName(name: string, value: string): Promise<string> {
    switch (name) {
      case "session_add_sync": {
        const args = JSON.parse(value) as { id?: string; peer?: string };
        const id = args.id ?? "";
        const manager = new SessionManager({
          ...this.config,
          onGlobalEvent: this.config.onGlobalEvent,
          onVideoFrame: this.config.onVideoFrame,
          onRgba: this.config.onRgba,
        });
        this.sessions.set(id, {
          manager,
          peerId: args.peer ?? "",
          connected: false,
        });
        return JSON.stringify({ id });
      }
      case "session_start": {
        return "";
      }
      case "session_login": {
        const args = JSON.parse(value) as {
          id?: string;
          peer?: string;
          password?: string;
          my_id?: string;
          my_name?: string;
        };
        const entry = args.id ? this.sessions.get(args.id) : undefined;
        if (!entry) throw new Error(`session not found: ${args.id}`);
        const peerInfo = await entry.manager.connect({
          peerId: args.peer ?? entry.peerId,
          password: args.password ?? "",
          myId: args.my_id ?? "",
          myName: args.my_name ?? "web",
          myPlatform: "Web",
          connType: ConnType.DEFAULT_CONN,
        });
        entry.connected = true;
        return JSON.stringify(peerInfo);
      }
      case "session_close": {
        const args = JSON.parse(value) as { id?: string };
        const entry = args.id ? this.sessions.get(args.id) : undefined;
        entry?.manager.close();
        if (args.id) this.sessions.delete(args.id);
        return "";
      }
      case "send_mouse": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeMouseEventFromJson(value));
        }
        return "";
      }
      case "flutter_key_event": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeFlutterKeyEventFromJson(value));
        }
        return "";
      }
      case "input_key": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeInputKeyFromJson(value));
        }
        return "";
      }
      case "input_string": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeInputString(value));
        }
        return "";
      }
      case "ctrl_alt_del": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeCtrlAltDel());
        }
        return "";
      }
      case "lock_screen": {
        const transport = this.getCurrentTransport();
        if (transport) {
          transport.send(encodeLockScreen());
        }
        return "";
      }
      case "switch_display": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as {
            isDesktop?: boolean;
            sessionId?: string;
            value?: number[];
          };
          const display = args.value?.[0] ?? 0;
          const msg = hbb.Message.create({
            misc: { switchDisplay: { display } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "cursor": {
        if (this.config.cursorElement) {
          applyCursor(this.config.cursorElement, value);
        }
        return "";
      }
      case "enter_or_leave": {
        return "";
      }
      case "send_chat": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const msg = hbb.Message.create({
            misc: { chatMessage: { text: value } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      default:
        return "";
    }
  }

  async getByName(_name: string, _arg: string): Promise<string> {
    return "";
  }

  private currentSessionId: string | null = null;

  setSessionId(id: string): void {
    this.currentSessionId = id;
  }

  private getCurrentTransport() {
    const id = this.currentSessionId;
    if (!id) return null;
    const entry = this.sessions.get(id);
    if (!entry) return null;
    return entry.manager.getRelayTransport();
  }
}
