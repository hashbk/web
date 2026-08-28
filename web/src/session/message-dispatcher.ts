import { hbb } from "../proto/index.js";
import { VideoDecoderManager } from "../video/video-decoder.js";
import {
  cursorDataToJson,
  cursorPositionToJson,
  cursorIdToJson,
} from "../cursor/cursor.js";

export function buildPeerInfoEventJson(pi: hbb.IPeerInfo): string {
  const displays = (pi.displays ?? []).map((d) => {
    const h: Record<string, number> = {
      x: d.x ?? 0,
      y: d.y ?? 0,
      width: d.width ?? 0,
      height: d.height ?? 0,
      cursor_embedded: d.cursorEmbedded ? 1 : 0,
    };
    if (d.originalResolution) {
      h["original_width"] = d.originalResolution.width ?? 0;
      h["original_height"] = d.originalResolution.height ?? 0;
    }
    const scale = d.scale ?? 0;
    if (scale > 0 && (d.width ?? 0) > 0) {
      h["scaled_width"] = Math.round((d.width as number) / scale);
    }
    return h;
  });

  const features: Record<string, boolean> = {};
  if (pi.features) {
    features["privacy_mode"] = pi.features.privacyMode ?? false;
  }

  const resolutions = (pi.resolutions?.resolutions ?? []).map((r) => ({
    width: r.width ?? 0,
    height: r.height ?? 0,
  }));

  return JSON.stringify({
    name: "peer_info",
    username: pi.username ?? "",
    hostname: pi.hostname ?? "",
    platform: pi.platform ?? "",
    sas_enabled: pi.sasEnabled ? "true" : "false",
    displays: JSON.stringify(displays),
    version: pi.version ?? "",
    features: JSON.stringify(features),
    current_display: String(pi.currentDisplay ?? 0),
    resolutions: JSON.stringify(resolutions),
    platform_additions: pi.platformAdditions ?? "",
  });
}

export function buildConnectionReadyEventJson(
  isSecured: boolean,
  direct: boolean,
  streamType: string = "",
): string {
  return JSON.stringify({
    name: "connection_ready",
    secure: isSecured ? "true" : "false",
    direct: direct ? "true" : "false",
    stream_type: streamType,
  });
}

export interface MessageDispatcherCallbacks {
  onGlobalEvent?: (json: string) => void;
  onPeerInfo?: (peerInfo: hbb.IPeerInfo) => void;
  onClipboard?: (text: string) => void;
  onMisc?: (misc: hbb.IMisc) => void;
  onFileResponse?: (fileResponse: hbb.IFileResponse) => void;
  onFileAction?: (fileAction: hbb.IFileAction) => void;
  onMessageBox?: (messageBox: hbb.IMessageBox) => void;
  onDefault?: (msg: hbb.Message) => void;
  sendToPeer?: (msg: hbb.Message) => void;
}

export class MessageDispatcher {
  private videoDecoder: VideoDecoderManager;
  private loadedCursorIds = new Set<number>();
  private firstFrame = false;
  isFileTransfer = false;

  constructor(
    videoDecoder: VideoDecoderManager,
    private callbacks: MessageDispatcherCallbacks = {},
  ) {
    this.videoDecoder = videoDecoder;
  }

  dispatch(bytes: Uint8Array): void {
    let msg: hbb.Message;
    try {
      msg = hbb.Message.decode(bytes);
    } catch (e) {
      console.error("Message decode failed:", e);
      return;
    }
    this.handleMessage(msg);
  }

  setFileResponseHandler(
    handler: (fr: hbb.IFileResponse) => void,
  ): void {
    this.callbacks.onFileResponse = handler;
  }

  setSendToPeer(fn: (msg: hbb.Message) => void): void {
    this.callbacks.sendToPeer = fn;
  }

  handleMessage(msg: hbb.Message): void {
    if (msg.videoFrame) {
      if (!this.firstFrame) {
        this.firstFrame = true;
        this.callbacks.onGlobalEvent?.(
          JSON.stringify({ name: "msgbox", type: "", title: "", text: "" }),
        );
      }
      this.videoDecoder.decodeVideoFrame(msg.videoFrame);
      this.sendVideoReceived();
      return;
    }
    if (msg.cursorData) {
      this.handleCursorData(msg.cursorData);
      return;
    }
    if (msg.cursorPosition) {
      this.handleCursorPosition(msg.cursorPosition);
      return;
    }
    if (msg.cursorId !== undefined && msg.cursorId !== null) {
      this.handleCursorId(msg.cursorId as number);
      return;
    }
    if (msg.clipboard) {
      this.handleClipboard(msg.clipboard);
      return;
    }
    if (msg.misc) {
      this.handleMisc(msg.misc);
      return;
    }
    if (msg.peerInfo) {
      this.updateDimensionsFromPeerInfo(msg.peerInfo);
      this.callbacks.onGlobalEvent?.(buildPeerInfoEventJson(msg.peerInfo));
      if (!this.isFileTransfer) {
        this.firstFrame = false;
        this.callbacks.onGlobalEvent?.(
          JSON.stringify({
            name: "msgbox",
            type: "success",
            title: "Successful",
            text: "Connected, waiting for image...",
            link: "",
          }),
        );
      }
      this.callbacks.onPeerInfo?.(msg.peerInfo);
      return;
    }
    if (msg.audioFrame) {
      return;
    }
    if (msg.messageBox) {
      this.callbacks.onMessageBox?.(msg.messageBox);
      return;
    }
    if (msg.fileResponse) {
      this.callbacks.onFileResponse?.(msg.fileResponse);
      return;
    }
    if (msg.fileAction) {
      this.callbacks.onFileAction?.(msg.fileAction);
      return;
    }
    if (msg.cliprdr) {
      return;
    }
    if (msg.voiceCallRequest || msg.voiceCallResponse) {
      return;
    }
    if (msg.switchSidesResponse) {
      return;
    }
    if (msg.testDelay) {
      return;
    }
    this.callbacks.onDefault?.(msg);
  }

  private handleCursorData(cursorData: hbb.ICursorData): void {
    const width = cursorData.width ?? 0;
    const height = cursorData.height ?? 0;
    const expectedLen = width * height * 4;
    const rawColors = (cursorData.colors as Uint8Array) ?? new Uint8Array(0);
    let colors = rawColors;
    if (expectedLen > 0 && rawColors.length !== expectedLen) {
      colors = new Uint8Array(expectedLen);
      colors.set(rawColors.subarray(0, Math.min(rawColors.length, expectedLen)));
    }
    const json = cursorDataToJson(
      cursorData.id as number,
      cursorData.hotx ?? 0,
      cursorData.hoty ?? 0,
      width,
      height,
      colors,
    );
    this.loadedCursorIds.add(cursorData.id as number);
    this.callbacks.onGlobalEvent?.(json);
  }

  private handleCursorPosition(pos: hbb.ICursorPosition): void {
    const json = cursorPositionToJson(pos.x ?? 0, pos.y ?? 0);
    this.callbacks.onGlobalEvent?.(json);
  }

  private handleCursorId(id: number): void {
    if (!this.loadedCursorIds.has(id)) return;
    const json = cursorIdToJson(id);
    this.callbacks.onGlobalEvent?.(json);
  }

  private updateDimensionsFromPeerInfo(pi: hbb.IPeerInfo): void {
    const displays = pi.displays ?? [];
    const idx = pi.currentDisplay ?? 0;
    const d = displays[idx];
    if (d) {
      const w = d.width ?? 0;
      const h = d.height ?? 0;
      if (w > 0 && h > 0) {
        this.videoDecoder.setDimensions(w, h);
      }
    }
    if (pi.encoding) {
      this.videoDecoder.setSupportedEncoding(pi.encoding);
    }
  }

  private handleClipboard(clipboard: hbb.IClipboard): void {
    const content = clipboard.content as Uint8Array | undefined;
    if (content && content.length > 0) {
      const text = new TextDecoder().decode(content);
      this.callbacks.onClipboard?.(text);
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({ name: "clipboard", content: text }),
      );
    }
  }

  private handleMisc(misc: hbb.IMisc): void {
    this.callbacks.onMisc?.(misc);

    if (misc.switchDisplay) {
      const sd = misc.switchDisplay;
      const w = sd.width ?? 0;
      const h = sd.height ?? 0;
      if (w > 0 && h > 0) {
        this.videoDecoder.setDimensions(w, h);
      }
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "switch_display",
          display: String(sd.display ?? 0),
          x: String(sd.x ?? 0),
          y: String(sd.y ?? 0),
          width: String(sd.width ?? 0),
          height: String(sd.height ?? 0),
          cursorEmbedded: sd.cursorEmbedded ? "true" : "false",
        }),
      );
      return;
    }

    if (misc.permissionInfo) {
      const pi = misc.permissionInfo;
      const permName = permissionToString(pi.permission ?? 0);
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "permission",
          [permName]: pi.enabled ? "true" : "false",
        }),
      );
      return;
    }

    if (misc.closeReason !== undefined && misc.closeReason !== null) {
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({ name: "close_reason", reason: misc.closeReason }),
      );
      return;
    }

  }

  private sendVideoReceived(): void {
    if (!this.callbacks.sendToPeer) return;
    const msg = hbb.Message.create({
      misc: { videoReceived: true },
    });
    this.callbacks.sendToPeer(msg);
  }
}

function permissionToString(perm: number): string {
  switch (perm) {
    case 0: return "keyboard";
    case 1: return "cliprdr";
    case 2: return "audio";
    case 3: return "file";
    case 4: return "restart";
    case 5: return "recording";
    default: return "unknown";
  }
}