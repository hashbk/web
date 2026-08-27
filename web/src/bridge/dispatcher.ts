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
import { LocalFileSystem } from "../file/local-fs.js";
import { FileTransferManager } from "../file/file-transfer.js";
import type { JobProgress } from "../file/file-transfer.js";
import { RendezvousClient } from "../rendezvous/rendezvous-client.js";
import { deriveRendezvousServer } from "../config/option-store.js";
import { buildPeerInfoEventJson } from "../session/message-dispatcher.js";

export interface BridgeConfig extends SessionConfig {
  cursorElement?: HTMLElement;
  cursorElements?: HTMLElement;
  onGlobalEvent?: (json: string) => void;
  onRegisteredEvent?: (json: string) => void;
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
}

interface SessionEntry {
  manager: SessionManager;
  peerId: string;
  password: string;
  connected: boolean;
  connecting: boolean;
  fileTransfer: FileTransferManager;
  localFs: LocalFileSystem;
}

export class BridgeDispatcher {
  private sessions = new Map<string, SessionEntry>();
  private currentSessionId: string | null = null;

  constructor(private config: BridgeConfig) {}

  async setByName(name: string, value: string): Promise<string> {
    switch (name) {
      case "session_add_sync": {
        const args = JSON.parse(value) as {
          id?: string;
          peer?: string;
          password?: string;
          is_shared_password?: boolean;
          isFileTransfer?: boolean;
          isViewCamera?: boolean;
          isPortForward?: boolean;
          isRdp?: boolean;
          isTerminal?: boolean;
          switchUuid?: string;
          forceRelay?: boolean;
          connToken?: string;
        };
        const id = args.id ?? "";
        const rendezvousServer = deriveRendezvousServer();
        const manager = new SessionManager({
          ...this.config,
          rendezvousServer,
          onGlobalEvent: this.config.onGlobalEvent,
          onVideoFrame: this.config.onVideoFrame,
          onRgba: this.config.onRgba,
        });
        const localFs = new LocalFileSystem();
        const transport = manager.getRelayTransport();
        const fileTransfer = new FileTransferManager({
          transport: transport ?? { send: () => {} },
          localFs,
          onGlobalEvent: this.config.onGlobalEvent,
        });
        this.sessions.set(id, {
          manager,
          peerId: id,
          password: args.password ?? "",
          connected: false,
          connecting: false,
          fileTransfer,
          localFs,
        });
        this.currentSessionId = id;
        return JSON.stringify({ id });
      }
      case "session_start": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        if (entry.connecting || entry.connected) return "";
        entry.connecting = true;
        void this.startSessionConnection(entry).catch((err) => {
          console.error("session_start failed:", err);
          entry.connecting = false;
          const msg = err instanceof Error ? err.message : String(err);
          this.config.onGlobalEvent?.(
            JSON.stringify({
              name: "msgbox",
              type: "error",
              title: "Connection Error",
              text: msg,
              link: "",
            }),
          );
        });
        return "";
      }
      case "login": {
        const args = JSON.parse(value) as {
          os_username?: string;
          os_password?: string;
          password?: string;
          remember?: boolean;
        };
        const entry = this.getCurrentSessionEntry();
        if (!entry) throw new Error("login: no active session");
        const peerInfo = await entry.manager.login(args.password ?? "");
        entry.connected = true;
        entry.connecting = false;
        this.config.onGlobalEvent?.(buildPeerInfoEventJson(peerInfo));
        this.setupFileTransfer(entry);
        return JSON.stringify(peerInfo);
      }
      case "session_close": {
        const args = value ? (JSON.parse(value) as { id?: string }) : {};
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
      case "read_remote_dir": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            path: string;
            include_hidden: boolean;
          };
          ft.readRemoteDir(args.path, args.include_hidden);
        }
        return "";
      }
      case "send_files": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            to: string;
            file_num: number;
            include_hidden: boolean;
            is_remote: boolean;
            is_dir: boolean;
          };
          await ft.sendFiles({
            id: args.id,
            path: args.path,
            to: args.to,
            fileNum: args.file_num,
            includeHidden: args.include_hidden,
            isRemote: args.is_remote,
            isDir: args.is_dir,
          });
        }
        return "";
      }
      case "confirm_override_file": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            file_num: number;
            need_override: boolean;
            remember: boolean;
            is_upload: boolean;
          };
          ft.confirmOverrideFile(
            args.id,
            args.file_num,
            args.need_override,
            args.remember,
            args.is_upload,
          );
        }
        return "";
      }
      case "remove_file": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            file_num: number;
            is_remote: boolean;
          };
          ft.removeFile(args.id, args.path, args.file_num, args.is_remote);
        }
        return "";
      }
      case "read_dir_to_remove_recursive": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            is_remote: boolean;
            show_hidden: boolean;
          };
          ft.removeDirAll(
            args.id,
            args.path,
            args.is_remote,
            args.show_hidden,
          );
        }
        return "";
      }
      case "remove_all_empty_dirs": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            is_remote: boolean;
          };
          ft.removeAllEmptyDirs(args.id, args.path, args.is_remote);
        }
        return "";
      }
      case "cancel_job": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          ft.cancelJob(parseInt(value, 10));
        }
        return "";
      }
      case "create_dir": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            is_remote: boolean;
          };
          ft.createDir(args.id, args.path, args.is_remote);
        }
        return "";
      }
      case "query_onlines": {
        const ids = JSON.parse(value) as string[];
        const rendezvousServer = deriveRendezvousServer();
        if (Array.isArray(ids) && ids.length > 0 && rendezvousServer) {
          try {
            const client = new RendezvousClient({
              rendezvousServer,
              apiServer: this.config.apiServer,
            });
            const { onlines, offlines } = await client.queryOnlines("", ids);
            this.config.onRegisteredEvent?.(
              JSON.stringify({
                name: "callback_query_onlines",
                onlines: onlines.join(","),
                offlines: offlines.join(","),
              }),
            );
          } catch (e) {
            console.error("query_onlines failed:", e);
          }
        }
        return "";
      }
      default:
        return "";
    }
  }

  async getByName(name: string, arg: string): Promise<string> {
    switch (name) {
      case "read_local_dir": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        try {
          const args = JSON.parse(arg) as {
            path: string;
            include_hidden: boolean;
          };
          return await entry.localFs.readDirToJson(
            args.path,
            args.include_hidden,
          );
        } catch {
          return "";
        }
      }
      case "platform": {
        return "Web";
      }
      default:
        return "";
    }
  }

  setSessionId(id: string): void {
    this.currentSessionId = id;
  }

  getJobs(): JobProgress[] {
    const entry = this.getCurrentSessionEntry();
    return entry ? entry.fileTransfer.getAllJobs() : [];
  }

  getLocalFileSystem(): LocalFileSystem | null {
    const entry = this.getCurrentSessionEntry();
    return entry ? entry.localFs : null;
  }

  private getCurrentSessionEntry(): SessionEntry | null {
    const id = this.currentSessionId;
    if (!id) return null;
    return this.sessions.get(id) ?? null;
  }

  private async startSessionConnection(entry: SessionEntry): Promise<void> {
    await entry.manager.startConnection({
      peerId: entry.peerId,
      password: entry.password,
      myId: "",
      myName: "web",
      myPlatform: "Web",
      connType: ConnType.DEFAULT_CONN,
    });

    if (entry.password) {
      const peerInfo = await entry.manager.login(entry.password);
      entry.connected = true;
      entry.connecting = false;
      this.config.onGlobalEvent?.(buildPeerInfoEventJson(peerInfo));
      this.setupFileTransfer(entry);
    } else {
      this.config.onGlobalEvent?.(
        JSON.stringify({
          name: "msgbox",
          type: "input-password",
          title: "Password Required",
          text: "",
          link: "",
        }),
      );
    }
  }

  private setupFileTransfer(entry: SessionEntry): void {
    const transport = entry.manager.getRelayTransport();
    if (transport) {
      entry.fileTransfer = new FileTransferManager({
        transport,
        localFs: entry.localFs,
        onGlobalEvent: this.config.onGlobalEvent,
      });
    }
    entry.manager.setFileResponseHandler((fr) => {
      entry.fileTransfer.handleFileResponse(fr);
    });
  }

  private getCurrentTransport() {
    const entry = this.getCurrentSessionEntry();
    if (!entry) return null;
    return entry.manager.getRelayTransport();
  }

  private getCurrentFileTransfer(): FileTransferManager | null {
    const entry = this.getCurrentSessionEntry();
    return entry ? entry.fileTransfer : null;
  }
}
