import { hbb } from "../proto/index.js";
import { SessionManager } from "../session/session-manager.js";
import type { SessionConfig } from "../session/session-manager.js";
import { ConnType, APP_VERSION } from "../constants.js";
import { encodeMouseEventFromJson } from "../input/mouse.js";
import {
  encodeInputKeyFromJson,
  encodeInputString,
  encodeFlutterKeyEventFromJson,
  encodeCtrlAltDel,
  encodeLockScreen,
} from "../input/keyboard.js";
import { LocalFileSystem } from "../file/local-fs.js";
import { FileTransferManager } from "../file/file-transfer.js";
import type { JobProgress } from "../file/file-transfer.js";
import { RendezvousClient } from "../rendezvous/rendezvous-client.js";
import {
  deriveRendezvousServer,
  deriveLicenceKey,
  deriveApiServer,
  getOption,
  setOption,
  getAllOptions,
  setAllOptions,
  getUserDefaultOption,
  setUserDefaultOption,
  getPeerOption,
  setPeerOption,
  getPeerToggleOption,
  setPeerToggleOption,
  getAllPeers,
} from "../config/option-store.js";
import { translate, getLangs, getLocalOption, setLocalOption } from "../i18n/translate.js";
import { buildPeerInfoEventJson } from "../session/message-dispatcher.js";
import { cryptoBoxKeypair, base64Encode } from "../crypto/sodium.js";

declare const __BUILD_DATE__: string | undefined;

export interface BridgeConfig extends SessionConfig {
  cursorElement?: HTMLElement;
  cursorElements?: HTMLElement;
  onGlobalEvent?: (json: string) => void;
  onRegisteredEvent?: (json: string) => void;
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
  onLoadAbFinished?: (json: string) => void;
  onLoadGroupFinished?: (json: string) => void;
}

interface SessionEntry {
  manager: SessionManager;
  peerId: string;
  password: string;
  connected: boolean;
  connecting: boolean;
  fileTransfer: FileTransferManager;
  localFs: LocalFileSystem;
  isFileTransfer: boolean;
  isViewCamera: boolean;
  isTerminal: boolean;
  remember: boolean;
}

export class BridgeDispatcher {
  private sessions = new Map<string, SessionEntry>();
  private currentSessionId: string | null = null;
  private envVars: Record<string, string> = {};
  private favPeers: string[] = [];
  private auditGuid = "";
  private lastAuditNote = "";
  private uuid = "";
  private accountAuthState = "Requesting account auth";
  private accountAuthFailedMsg = "";
  private accountAuthUrl: string | null = null;
  private accountAuthUrlLaunched = false;
  private accountAuthBody: unknown = null;
  private accountAuthKeepQuerying = false;
  private accountAuthPopup: Window | null = null;

  constructor(private config: BridgeConfig) {
    try {
      const stored = getOption("fav");
      if (stored) this.favPeers = JSON.parse(stored) as string[];
    } catch {
      // ignore invalid stored fav list
    }
  }

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

          isTerminal?: boolean;
          switchUuid?: string;
          forceRelay?: boolean;
          connToken?: string;
        };
        const id = args.id ?? "";
        const rendezvousServer = deriveRendezvousServer();
        const licenceKey = deriveLicenceKey();
        const manager = new SessionManager({
          ...this.config,
          rendezvousServer,
          licenceKey,
          rsPubKey: licenceKey,
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
          isFileTransfer: args.isFileTransfer ?? false,
          isViewCamera: args.isViewCamera ?? false,
          isTerminal: args.isTerminal ?? false,
          remember: false,
        });
        this.currentSessionId = id;
        void manager.loadFFmpeg().catch((e) => {
          console.error("FFmpeg preload failed:", e);
        });
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
        entry.remember = args.remember ?? false;
        try {
          const result = await entry.manager.login(args.password ?? "", {
            isFileTransfer: entry.isFileTransfer,
            isViewCamera: entry.isViewCamera,
            isTerminal: entry.isTerminal,
          });
          if (result.error) {
            this.handleLoginError(new Error(`login failed: ${result.error}`));
            return "";
          }
          const peerInfo = result.peerInfo!;
          entry.connected = true;
          entry.connecting = false;
          if (entry.remember && args.password) {
            setPeerOption(entry.peerId, "password", args.password);
          }
          this.persistPeerInfo(entry.peerId, peerInfo);
          this.config.onGlobalEvent?.(buildPeerInfoEventJson(peerInfo));
          this.notifyWaitingForImage(entry);
          this.setupFileTransfer(entry);
          return JSON.stringify(peerInfo);
        } catch (err) {
          this.handleLoginError(err);
          return "";
        }
      }
      case "session_close": {
        const args = value ? (JSON.parse(value) as { id?: string }) : {};
        const entry = args.id
          ? this.sessions.get(args.id)
          : this.getCurrentSessionEntry();
        entry?.manager.close();
        if (args.id) {
          this.sessions.delete(args.id);
        } else if (entry && this.currentSessionId) {
          this.sessions.delete(this.currentSessionId);
          this.currentSessionId = null;
        }
        return "";
      }
      case "reconnect": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        if (entry.connecting) return "";
        entry.manager.close();
        entry.connected = false;
        entry.connecting = true;
        void this.startSessionConnection(entry).catch((err) => {
          console.error("reconnect failed:", err);
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
      case "refresh": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const msg = hbb.Message.create({ misc: { refreshVideo: true } });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "option:session": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        const args = JSON.parse(value) as { name?: string; value?: string };
        if (args.name) {
          setPeerOption(entry.peerId, args.name, args.value ?? "");
        }
        return "";
      }
      case "option:toggle": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        this.handleToggleOption(entry, value);
        return "";
      }
      case "image_quality": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        setPeerOption(entry.peerId, "image_quality", value);
        const transport = this.getCurrentTransport();
        if (transport) {
          const opt = this.buildImageQualityOption(value);
          if (opt) {
            const msg = hbb.Message.create({ misc: { option: opt } });
            transport.send(hbb.Message.encode(msg).finish());
          }
        }
        return "";
      }
      case "input_os_password": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const keyMsg = hbb.Message.create({
            keyEvent: { mode: 0, press: true, seq: value },
          });
          transport.send(hbb.Message.encode(keyMsg).finish());
          const enterMsg = hbb.Message.create({
            keyEvent: { mode: 0, press: true, controlKey: 4 },
          });
          transport.send(hbb.Message.encode(enterMsg).finish());
        }
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
      case "read_local_dir": {
        const entry = this.getCurrentSessionEntry();
        if (entry) {
          const args = JSON.parse(value) as {
            path: string;
            show_hidden: boolean;
          };
          if (!entry.localFs.hasRoot()) {
            const ok = await entry.localFs.pickRoot();
            if (!ok) return "";
          }
          try {
            const fd = await entry.localFs.readDir(args.path, args.show_hidden);
            this.config.onGlobalEvent?.(
              JSON.stringify({
                name: "file_dir",
                is_local: "true",
                value: JSON.stringify(fd),
              }),
            );
          } catch (e) {
            console.error("read_local_dir failed:", e);
          }
        }
        return "";
      }
      case "send_files": {
        const ft = this.getCurrentFileTransfer();
        const entry = this.getCurrentSessionEntry();
        if (ft && entry) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            to: string;
            file_num: number;
            include_hidden: boolean;
            is_remote: boolean;
            is_dir: boolean;
          };
          let fileHandle: FileSystemFileHandle | undefined;
          if (args.is_remote) {
            if (!args.is_dir && (globalThis as any).showSaveFilePicker) {
              const name = args.path.split("/").pop() || "download";
              try {
                fileHandle = await (globalThis as any).showSaveFilePicker({
                  suggestedName: name,
                });
              } catch {
                return "";
              }
            } else if (!entry.localFs.hasRoot()) {
              const ok = await entry.localFs.pickRoot();
              if (!ok) return "";
            }
          }
          await ft.sendFiles({
            id: args.id,
            path: args.path,
            to: args.to,
            fileNum: args.file_num,
            includeHidden: args.include_hidden,
            isRemote: args.is_remote,
            isDir: args.is_dir,
            fileHandle,
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
      case "send_2fa": {
        const transport = this.getCurrentTransport();
        const entry = this.getCurrentSessionEntry();
        if (transport) {
          const args = JSON.parse(value) as { code?: string; trust_this_device?: boolean };
          const hwid = args.trust_this_device && entry ? entry.manager.getHwid() : new Uint8Array(0);
          const msg = hbb.Message.create({
            auth_2fa: { code: args.code ?? "", hwid },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "toggle_privacy_mode": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { impl_key?: string; on?: boolean };
          const msg = hbb.Message.create({
            misc: {
              togglePrivacyMode: {
                implKey: args.impl_key ?? "",
                on: args.on ?? false,
              },
            },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "toggle_virtual_display": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { index?: number; on?: boolean };
          const msg = hbb.Message.create({
            misc: {
              toggleVirtualDisplay: {
                display: args.index ?? 0,
                on: args.on ?? false,
              },
            },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "custom_image_quality": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const quality = parseInt(value, 10);
          const msg = hbb.Message.create({
            misc: { option: { customImageQuality: quality << 8 } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "custom-fps": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const fps = parseInt(value, 10);
          const msg = hbb.Message.create({
            misc: { option: { customFps: fps } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "elevate_direct": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const msg = hbb.Message.create({
            misc: { elevationRequest: { direct: true } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "elevate_with_logon": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { username?: string; password?: string };
          const msg = hbb.Message.create({
            misc: {
              elevationRequest: {
                logon: { username: args.username ?? "", password: args.password ?? "" },
              },
            },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "change_resolution": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { display?: number; width?: number; height?: number };
          const resolution = { width: args.width ?? 0, height: args.height ?? 0 };
          const msg = args.display !== undefined
            ? hbb.Message.create({
                misc: {
                  changeDisplayResolution: { display: args.display, resolution },
                },
              })
            : hbb.Message.create({
                misc: { changeResolution: resolution },
              });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "selected_sid": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const sid = parseInt(value, 10);
          if (!isNaN(sid)) {
            const msg = hbb.Message.create({ misc: { selectedSid: sid } });
            transport.send(hbb.Message.encode(msg).finish());
          }
        }
        return "";
      }
      case "restart": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const msg = hbb.Message.create({ misc: { restartRemoteDevice: true } });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "send_note": {
        const entry = this.getCurrentSessionEntry();
        if (entry) {
          this.lastAuditNote = value;
        }
        return "";
      }
      case "change_prefer_codec": {
        const transport = this.getCurrentTransport();
        const entry = this.getCurrentSessionEntry();
        if (transport && entry) {
          const pref = getPeerOption(entry.peerId, "codec-preference");
          const preferMap: Record<string, hbb.SupportedDecoding.PreferCodec> = {
            "vp8": hbb.SupportedDecoding.PreferCodec.VP8,
            "vp9": hbb.SupportedDecoding.PreferCodec.VP9,
            "av1": hbb.SupportedDecoding.PreferCodec.AV1,
            "h264": hbb.SupportedDecoding.PreferCodec.H264,
            "h265": hbb.SupportedDecoding.PreferCodec.H265,
          };
          const prefer = preferMap[pref] ?? hbb.SupportedDecoding.PreferCodec.Auto;
          const preferChroma = getPeerToggleOption(entry.peerId, "i444")
            ? hbb.Chroma.I444
            : hbb.Chroma.I420;
          const msg = hbb.Message.create({
            misc: {
              option: {
                supportedDecoding: {
                  abilityVp8: 1,
                  abilityVp9: 1,
                  abilityAv1: 1,
                  abilityH264: 1,
                  abilityH265: 1,
                  prefer,
                  preferChroma,
                  i444: { vp9: true, av1: true },
                },
              },
            },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "audit_guid": {
        this.auditGuid = value;
        return "";
      }
      case "rename_file": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            path: string;
            new_name: string;
            is_remote: boolean;
          };
          ft.renameFile(args.id, args.path, args.new_name, args.is_remote);
        }
        return "";
      }
      case "select_files": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          void ft.selectFiles(
            (value as unknown) === true || value === "true",
          );
        }
        return "";
      }
      case "send_local_files": {
        const ft = this.getCurrentFileTransfer();
        if (ft) {
          const args = JSON.parse(value) as {
            id: number;
            handle_index: number;
            path: string;
            to: string;
            file_num: number;
            include_hidden: boolean;
            is_remote: boolean;
          };
          void ft.sendLocalFiles({
            id: args.id,
            handleIndex: args.handle_index,
            path: args.path,
            to: args.to,
            fileNum: args.file_num,
            includeHidden: args.include_hidden,
            isRemote: args.is_remote,
          });
        }
        return "";
      }
      case "open_terminal": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { terminal_id: number; rows: number; cols: number };
          const msg = hbb.Message.create({
            terminalAction: { open: { terminalId: args.terminal_id, rows: args.rows, cols: args.cols } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "send_terminal_input": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { terminal_id: number; data: string };
          const encoded = new TextEncoder().encode(args.data);
          const msg = hbb.Message.create({
            terminalAction: { data: { terminalId: args.terminal_id, data: encoded, compressed: false } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "resize_terminal": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { terminal_id: number; rows: number; cols: number };
          const msg = hbb.Message.create({
            terminalAction: { resize: { terminalId: args.terminal_id, rows: args.rows, cols: args.cols } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "close_terminal": {
        const transport = this.getCurrentTransport();
        if (transport) {
          const args = JSON.parse(value) as { terminal_id: number };
          const msg = hbb.Message.create({
            terminalAction: { close: { terminalId: args.terminal_id } },
          });
          transport.send(hbb.Message.encode(msg).finish());
        }
        return "";
      }
      case "common": {
        const transport = this.getCurrentTransport();
        if (transport) {
          try {
            const args = JSON.parse(value) as { name?: string; value?: string };
            if (args.name === "continue-insecure-connection") {
              const msg = hbb.Message.create({
                misc: { option: {} },
              });
              transport.send(hbb.Message.encode(msg).finish());
            }
          } catch {
            // ignore invalid json
          }
        }
        return "";
      }
      case "option": {
        const args = JSON.parse(value) as { name?: string; value?: string };
        if (args.name) setOption(args.name, args.value ?? "");
        return "";
      }
      case "options": {
        setAllOptions(value);
        return "";
      }
      case "envvar": {
        const args = JSON.parse(value) as { name?: string; value?: string | null };
        if (args.name) {
          if (args.value === null) delete this.envVars[args.name];
          else if (args.value !== undefined) this.envVars[args.name] = args.value;
        }
        return "";
      }
      case "fav": {
        try {
          this.favPeers = JSON.parse(value) as string[];
          setOption("fav", value);
        } catch {
          // ignore invalid json
        }
        return "";
      }
      case "option:local": {
        const args = JSON.parse(value) as { name?: string; value?: string };
        if (args.name) setLocalOption(args.name, args.value ?? "");
        return "";
      }
      case "option:flutter:local": {
        const args = JSON.parse(value) as { name?: string; value?: string };
        if (args.name) setLocalOption(`flutter:${args.name}`, args.value ?? "");
        return "";
      }
      case "option:flutter:peer": {
        const entry = this.getCurrentSessionEntry();
        if (entry) {
          const args = JSON.parse(value) as { name?: string; value?: string };
          if (args.name) setPeerOption(entry.peerId, `flutter:${args.name}`, args.value ?? "");
        }
        return "";
      }
      case "option:peer": {
        const args = JSON.parse(value) as { id?: string; name?: string; value?: string };
        if (args.id && args.name) setPeerOption(args.id, args.name, args.value ?? "");
        return "";
      }
      case "option:user:default": {
        const args = JSON.parse(value) as { name?: string; value?: string };
        if (args.name) setUserDefaultOption(args.name, args.value ?? "");
        return "";
      }
      case "remove_peer": {
        const entry = this.sessions.get(value);
        if (entry) {
          entry.manager.close();
          this.sessions.delete(value);
        }
        this.removePeerOptions(value);
        return "";
      }
      case "save_ab": {
        setOption("ab-cache", value);
        return "";
      }
      case "clear_ab": {
        setOption("ab-cache", "");
        return "";
      }
      case "load_ab": {
        this.config.onLoadAbFinished?.(getOption("ab-cache"));
        return "";
      }
      case "save_group": {
        setOption("group-cache", value);
        return "";
      }
      case "clear_group": {
        setOption("group-cache", "");
        return "";
      }
      case "load_group": {
        this.config.onLoadGroupFinished?.(getOption("group-cache"));
        return "";
      }
      case "account_auth": {
        const args = JSON.parse(value) as { op?: string; remember?: boolean };
        void this.runAccountAuth(args.op ?? "", args.remember ?? false);
        return "";
      }
      case "account_auth_cancel": {
        this.accountAuthKeepQuerying = false;
        if (this.accountAuthPopup && !this.accountAuthPopup.closed) {
          try {
            this.accountAuthPopup.close();
          } catch {
            // ignore
          }
        }
        this.accountAuthPopup = null;
        return "";
      }
      default:
        return "";
    }
  }

  getByName(name: string, arg: string): string {
    switch (name) {
      case "platform": {
        return "Web";
      }
      case "is_using_public_server": {
        return getOption("custom-rendezvous-server") ? "false" : "true";
      }
      case "get_conn_status": {
        return JSON.stringify({ status_num: -1 });
      }
      case "resolve_avatar_url": {
        const trimmed = arg.trim();
        if (trimmed.startsWith("/")) {
          const apiServer = deriveApiServer();
          if (apiServer) {
            return apiServer.replace(/\/+$/, "") + trimmed;
          }
        }
        return trimmed;
      }
      case "option:session": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        return getPeerOption(entry.peerId, arg);
      }
      case "option:toggle": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "false";
        return getPeerToggleOption(entry.peerId, arg) ? "true" : "false";
      }
      case "read_local_dir": {
        return JSON.stringify({ id: 0, path: "", entries: [] });
      }

      case "image_quality": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "balanced";
        return getPeerOption(entry.peerId, "image_quality") || "balanced";
      }
      case "remember": {
        const entry = this.getCurrentSessionEntry();
        return entry?.remember ? "true" : "false";
      }
      case "option": {
        return getOption(arg);
      }
      case "options": {
        return getAllOptions();
      }
      case "option:local": {
        return getLocalOption(arg);
      }
      case "option:flutter:local": {
        return getLocalOption(`flutter:${arg}`);
      }
      case "option:flutter:peer": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        return getPeerOption(entry.peerId, `flutter:${arg}`);
      }
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
      case "option:user:default": {
        return getUserDefaultOption(arg);
      }
      case "version": {
        return APP_VERSION;
      }
      case "app-name": {
        return getLocalOption("app-name") || "RustDesk";
      }
      case "my_id": {
        return "web";
      }
      case "my_name": {
        return "web";
      }
      case "uuid": {
        return this.getOrCreateUuid();
      }
      case "build_date": {
        return typeof __BUILD_DATE__ === "string" ? __BUILD_DATE__ : "";
      }
      case "api_server": {
        return deriveApiServer();
      }
      case "audit_server": {
        return deriveApiServer() + "/api/audit/" + arg;
      }
      case "get_version_number": {
        return String(this.parseVersionNumber(arg));
      }
      case "langs": {
        return getLangs();
      }
      case "translate": {
        try {
          const params = JSON.parse(arg) as { locale?: string; text?: string };
          return translate(params.locale ?? "en", params.text ?? "");
        } catch {
          return arg;
        }
      }
      case "fav": {
        return JSON.stringify(this.favPeers);
      }
      case "envvar": {
        return this.envVars[arg] ?? "";
      }
      case "alternative_codecs": {
        return JSON.stringify(this.getAlternativeCodecs());
      }
      case "main_display": {
        if (typeof window !== "undefined") {
          return JSON.stringify({
            w: window.screen.availWidth,
            h: window.screen.availHeight,
            scaleFactor: window.devicePixelRatio,
          });
        }
        return "";
      }
      case "peer_exists": {
        return getPeerOption(arg, "info") !== "" ? "true" : "false";
      }
      case "peer_has_password": {
        return getPeerOption(arg, "password") !== "" ? "true" : "false";
      }
      case "load_recent_peers": {
        const peers = getAllPeers()
          .filter((p) => p.tm > 0)
          .sort((a, b) => b.tm - a.tm)
          .map((p) => ({
            id: p.id,
            username: p.username,
            hostname: p.hostname,
            platform: p.platform,
            alias: p.alias,
          }));
        this.config.onRegisteredEvent?.(
          JSON.stringify({
            name: "load_recent_peers",
            peers: JSON.stringify(peers),
          }),
        );
        return "";
      }
      case "load_recent_peers_sync": {
        const peers = getAllPeers()
          .filter((p) => p.tm > 0)
          .sort((a, b) => b.tm - a.tm)
          .map((p) => ({
            id: p.id,
            username: p.username,
            hostname: p.hostname,
            platform: p.platform,
            alias: p.alias,
          }));
        return JSON.stringify({ peers: JSON.stringify(peers) });
      }
      case "load_fav_peers": {
        const favSet = new Set(this.favPeers);
        const peers = getAllPeers()
          .filter((p) => p.tm > 0 && favSet.has(p.id))
          .sort((a, b) => b.tm - a.tm)
          .map((p) => ({
            id: p.id,
            username: p.username,
            hostname: p.hostname,
            platform: p.platform,
            alias: p.alias,
          }));
        this.config.onRegisteredEvent?.(
          JSON.stringify({
            name: "load_fav_peers",
            peers: JSON.stringify(peers),
          }),
        );
        return "";
      }
      case "account_auth_result": {
        return JSON.stringify({
          state_msg: this.accountAuthState,
          failed_msg: this.accountAuthFailedMsg,
          url: this.accountAuthUrl,
          url_launched: this.accountAuthUrlLaunched,
          auth_body: this.accountAuthBody,
        });
      }
      case "enable_trusted_devices": {
        const entry = this.getCurrentSessionEntry();
        return entry?.manager.enableTrustedDevices ? "Y" : "N";
      }
      case "conn_session_id": {
        const entry = this.getCurrentSessionEntry();
        if (!entry) return "";
        return String(entry.manager.getSessionId());
      }
      case "last_audit_note": {
        return this.lastAuditNote;
      }
      case "audit_guid": {
        return this.auditGuid;
      }
      default:
        return "";
    }
  }

  private parseVersionNumber(version: string): number {
    try {
      const parts = version.split("-");
      let result = 0;
      if (parts.length > 0) {
        let last = 0;
        for (const segment of parts[0].split(".")) {
          last = parseInt(segment, 10) || 0;
          result = result * 1000 + last;
        }
        result -= last;
        result += last * 10;
      }
      if (parts.length > 1) {
        result += parseInt(parts[1], 10) || 0;
      }
      return result;
    } catch {
      return 0;
    }
  }

  setSessionId(id: string): void {
    this.currentSessionId = id;
  }

  getCurrentPeerId(): string | null {
    const entry = this.getCurrentSessionEntry();
    return entry ? entry.peerId : null;
  }

  getAlternativeCodecs(): { vp8: boolean; av1: boolean; h264: boolean; h265: boolean } {
    const entry = this.getCurrentSessionEntry();
    if (!entry) return { vp8: false, av1: false, h264: false, h265: false };
    return entry.manager.getVideoDecoder().getAlternativeCodecs();
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
    if (!entry.password) {
      const savedPassword = getPeerOption(entry.peerId, "password");
      if (savedPassword) {
        entry.password = savedPassword;
        entry.remember = true;
      }
    }
    const connType = entry.isFileTransfer
      ? ConnType.FILE_TRANSFER
      : entry.isViewCamera
        ? ConnType.VIEW_CAMERA
        : entry.isTerminal
          ? ConnType.TERMINAL
          : ConnType.DEFAULT_CONN;
    let myName = "web";
    const userInfo = getLocalOption("user_info");
    if (userInfo) {
      try {
        const info = JSON.parse(userInfo) as { display_name?: string; name?: string };
        myName = info.display_name || info.name || myName;
      } catch {}
    }
    await entry.manager.startConnection({
      peerId: entry.peerId,
      password: entry.password,
      myId: "",
      myName,
      myPlatform: "Web",
      connType,
    });

    try {
      const result = await entry.manager.login(entry.password, {
        isFileTransfer: entry.isFileTransfer,
        isViewCamera: entry.isViewCamera,
        isTerminal: entry.isTerminal,
      });
      if (result.error) {
        entry.connecting = false;
        this.handleLoginError(new Error(`login failed: ${result.error}`));
        return;
      }
      const peerInfo = result.peerInfo!;
      entry.connected = true;
      entry.connecting = false;
      this.persistPeerInfo(entry.peerId, peerInfo);
      this.config.onGlobalEvent?.(buildPeerInfoEventJson(peerInfo));
      this.notifyWaitingForImage(entry);
      this.setupFileTransfer(entry);
    } catch (err) {
      entry.connecting = false;
      this.handleLoginError(err);
    }
  }

  private persistPeerInfo(peerId: string, peerInfo: hbb.IPeerInfo): void {
    setPeerOption(peerId, "info", JSON.stringify({
      username: peerInfo.username ?? "",
      hostname: peerInfo.hostname ?? "",
      platform: peerInfo.platform ?? "",
    }));
    setPeerOption(peerId, "tm", String(Date.now()));
  }

  private notifyWaitingForImage(entry: SessionEntry): void {
    if (entry.isFileTransfer || entry.isTerminal || entry.isViewCamera) return;
    entry.manager.resetFirstFrame();
    this.config.onGlobalEvent?.(
      JSON.stringify({
        name: "msgbox",
        type: "success",
        title: "Successful",
        text: "Connected, waiting for image...",
        link: "",
      }),
    );
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

  private handleToggleOption(entry: SessionEntry, name: string): void {
    const BoolOption = hbb.OptionMessage.BoolOption;
    const transport = entry.manager.getRelayTransport();

    if (name === "block-input") {
      if (transport) {
        const msg = hbb.Message.create({
          misc: { option: { blockInput: BoolOption.Yes } },
        });
        transport.send(hbb.Message.encode(msg).finish());
      }
      return;
    }
    if (name === "unblock-input") {
      if (transport) {
        const msg = hbb.Message.create({
          misc: { option: { blockInput: BoolOption.No } },
        });
        transport.send(hbb.Message.encode(msg).finish());
      }
      return;
    }

    const currentlyEnabled = getPeerToggleOption(entry.peerId, name);
    const newEnabled = !currentlyEnabled;
    setPeerToggleOption(entry.peerId, name, newEnabled);
    const val = newEnabled ? BoolOption.Yes : BoolOption.No;

    const fieldMap: Record<string, string> = {
      "show-remote-cursor": "showRemoteCursor",
      "disable-audio": "disableAudio",
      "disable-clipboard": "disableClipboard",
      "lock-after-session-end": "lockAfterSessionEnd",
      "privacy-mode": "privacyMode",
      "enable-file-copy-paste": "enableFileTransfer",
      "show-my-cursor": "showMyCursor",
      "follow-remote-cursor": "followRemoteCursor",
      "follow-remote-window": "followRemoteWindow",
      "disable-camera": "disableCamera",
    };

    if (name === "view-only") {
      const fields = [
        "disableKeyboard",
        "disableClipboard",
        "enableFileTransfer",
        "lockAfterSessionEnd",
      ];
      if (transport) {
        const opt: Record<string, number> = {};
        for (const f of fields) opt[f] = val;
        const msg = hbb.Message.create({ misc: { option: opt } });
        transport.send(hbb.Message.encode(msg).finish());
      }
      return;
    }

    const field = fieldMap[name];
    if (field && transport) {
      const opt: Record<string, number> = { [field]: val };
      const msg = hbb.Message.create({ misc: { option: opt } });
      transport.send(hbb.Message.encode(msg).finish());
    }
  }

  private buildImageQualityOption(value: string): hbb.IOptionMessage | null {
    const ImageQuality = hbb.ImageQuality;
    switch (value) {
      case "low":
        return { imageQuality: ImageQuality.Low };
      case "balanced":
        return { imageQuality: ImageQuality.Balanced };
      case "best":
        return { imageQuality: ImageQuality.Best };
      default:
        return null;
    }
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

  private getOrCreateUuid(): string {
    if (this.uuid) return this.uuid;
    try {
      const stored = getLocalOption("uuid");
      if (stored) {
        this.uuid = stored;
        return stored;
      }
      const keypair = cryptoBoxKeypair();
      const uuid = base64Encode(keypair.publicKey);
      setLocalOption("uuid", uuid);
      this.uuid = uuid;
      return uuid;
    } catch {
      return "";
    }
  }

  private async runAccountAuth(op: string, remember: boolean): Promise<void> {
    const apiServer = deriveApiServer();
    const myId = "web";
    const uuid = this.getOrCreateUuid();
    const QUERY_TIMEOUT_MS = 180_000;
    const POLL_INTERVAL_MS = 1000;

    this.accountAuthKeepQuerying = false;
    this.accountAuthState = "Requesting account auth";
    this.accountAuthFailedMsg = "";
    this.accountAuthUrl = null;
    this.accountAuthUrlLaunched = false;
    this.accountAuthBody = null;

    try {
      const resp = await fetch(`${apiServer}/api/oidc/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op,
          id: myId,
          uuid,
          deviceInfo: {
            os: "Web",
            type: "web client",
            name: navigator.userAgent,
          },
        }),
      });
      const authResp = await resp.json() as {
        error?: string;
        code?: string;
        url?: string;
      };

      if (authResp.error) {
        this.accountAuthFailedMsg = authResp.error;
        return;
      }
      if (!authResp.code || !authResp.url) {
        this.accountAuthFailedMsg = "Invalid auth response";
        return;
      }

      this.accountAuthUrl = authResp.url;
      this.accountAuthState = "Waiting account auth";

      let popup: Window | null = null;
      try {
        popup = window.open(authResp.url, "_blank", "width=400,height=600");
        if (popup) {
          popup.focus();
          this.accountAuthUrlLaunched = true;
        }
      } catch {
        // ignore popup error
      }
      this.accountAuthPopup = popup;

      if (!popup) {
        this.accountAuthFailedMsg =
          "Popup blocked, please allow popups and try again.";
        return;
      }

      this.accountAuthKeepQuerying = true;
      const startTime = Date.now();

      while (
        this.accountAuthKeepQuerying &&
        Date.now() - startTime < QUERY_TIMEOUT_MS
      ) {
        try {
          const queryUrl = new URL(`${apiServer}/api/oidc/auth-query`);
          queryUrl.searchParams.append("code", authResp.code);
          queryUrl.searchParams.append("id", myId);
          queryUrl.searchParams.append("uuid", uuid);
          const queryResp = await fetch(queryUrl.toString(), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });
          const queryResult = await queryResp.json() as {
            error?: string;
            type?: string;
            access_token?: string;
            tfa_type?: string;
            secret?: string;
            user?: {
              name?: string;
              display_name?: string;
              avatar?: string;
              email?: string;
              note?: string;
              status?: number;
              is_admin?: boolean;
            };
          };

          if (queryResult.error) {
            if (!queryResult.error.includes("No authed oidc is found")) {
              this.closeAccountAuthPopup();
              this.accountAuthState = "Waiting account auth";
              this.accountAuthFailedMsg = queryResult.error;
              return;
            }
          } else {
            if (
              queryResult.type === "access_token" &&
              queryResult.user &&
              remember
            ) {
              setLocalOption("access_token", queryResult.access_token ?? "");
              setLocalOption(
                "user_info",
                JSON.stringify({
                  name: queryResult.user.name,
                  display_name: queryResult.user.display_name,
                  avatar: queryResult.user.avatar,
                  status: queryResult.user.status,
                }),
              );
            }
            this.accountAuthState = "Login account auth";
            this.accountAuthBody = {
              access_token: queryResult.access_token,
              type: queryResult.type,
              tfa_type: queryResult.tfa_type,
              secret: queryResult.secret,
              user: queryResult.user,
            };
            this.closeAccountAuthPopup();
            return;
          }
        } catch (e) {
          console.error("Error querying oidc auth:", e);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, POLL_INTERVAL_MS),
        );
      }

      this.closeAccountAuthPopup();
      if (Date.now() - startTime >= QUERY_TIMEOUT_MS) {
        this.accountAuthState = "Waiting account auth";
        this.accountAuthFailedMsg = "timeout";
      }
    } catch (e) {
      this.closeAccountAuthPopup();
      this.accountAuthState = "Requesting account auth";
      this.accountAuthFailedMsg = e instanceof Error ? e.message : String(e);
    }
  }

  private closeAccountAuthPopup(): void {
    if (this.accountAuthPopup && !this.accountAuthPopup.closed) {
      try {
        this.accountAuthPopup.close();
      } catch {
        // ignore
      }
    }
    this.accountAuthPopup = null;
  }

  private handleLoginError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    const errorMsg = msg.replace(/^login failed:\s*/, "");

    let type = "error";
    let title = "Login Error";
    let text = errorMsg;
    let link = "";

    if (errorMsg === "Empty Password") {
      type = "input-password";
      title = "Password Required";
      text = "";
    } else if (errorMsg === "Wrong Password") {
      type = "re-input-password";
      title = "Wrong Password";
      text = "Do you want to enter again?";
    } else if (errorMsg === "2FA Required" || errorMsg === "Wrong 2FA Code") {
      type = "input-2fa";
      title = errorMsg;
      text = "";
    } else if (errorMsg === "No Password Access") {
      type = "wait-remote-accept-nook";
      title = "Prompt";
      text = "Please wait for the remote side to accept your session request...";
    }

    this.config.onGlobalEvent?.(
      JSON.stringify({ name: "msgbox", type, title, text, link }),
    );
  }

  private removePeerOptions(peerId: string): void {
    if (typeof localStorage === "undefined") return;
    const prefix = `rustdesk:peer:${peerId}:option:`;
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
  }
}
