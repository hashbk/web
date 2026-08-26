import { hbb } from "../proto/index.js";
import { VideoDecoderManager } from "../video/video-decoder.js";
import {
  cursorDataToJson,
  cursorPositionToJson,
  cursorIdToJson,
} from "../cursor/cursor.js";

export interface MessageDispatcherCallbacks {
  onGlobalEvent?: (json: string) => void;
  onPeerInfo?: (peerInfo: hbb.IPeerInfo) => void;
  onClipboard?: (text: string) => void;
  onMisc?: (misc: hbb.IMisc) => void;
  onFileResponse?: (fileResponse: hbb.IFileResponse) => void;
  onFileAction?: (fileAction: hbb.IFileAction) => void;
  onMessageBox?: (messageBox: hbb.IMessageBox) => void;
  onDefault?: (msg: hbb.Message) => void;
}

export class MessageDispatcher {
  private videoDecoder: VideoDecoderManager;

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

  handleMessage(msg: hbb.Message): void {
    if (msg.videoFrame) {
      this.videoDecoder.decodeVideoFrame(msg.videoFrame);
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
    const json = cursorDataToJson(
      cursorData.id as number,
      cursorData.hotx ?? 0,
      cursorData.hoty ?? 0,
      cursorData.width ?? 0,
      cursorData.height ?? 0,
      (cursorData.colors as Uint8Array) ?? new Uint8Array(0),
    );
    this.callbacks.onGlobalEvent?.(json);
  }

  private handleCursorPosition(pos: hbb.ICursorPosition): void {
    const json = cursorPositionToJson(pos.x ?? 0, pos.y ?? 0);
    this.callbacks.onGlobalEvent?.(json);
  }

  private handleCursorId(id: number): void {
    const json = cursorIdToJson(id);
    this.callbacks.onGlobalEvent?.(json);
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

    if (misc.audioFormat) {
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "audio_format",
          channels: String(misc.audioFormat.channels ?? 0),
          sampleRate: String(misc.audioFormat.sampleRate ?? 0),
        }),
      );
      return;
    }
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