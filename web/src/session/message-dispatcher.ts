import { hbb } from "../proto/index.js";
import { VideoDecoderManager } from "../video/video-decoder.js";
import {
  cursorDataToJson,
  cursorPositionToJson,
  cursorIdToJson,
} from "../cursor/cursor.js";
import { base64Encode } from "../crypto/sodium.js";
import { initZstd, zstdDecompress } from "../file/zstd.js";

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
  private recvBytes = 0;
  private frameCount: Record<number, number> = {};
  private statsTs = 0;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private currentCodec = "";

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
    this.recvBytes += bytes.length;
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
          JSON.stringify({ name: "msgbox", type: "", title: "", text: "", link: "" }),
        );
        this.startStatsTimer();
      }
      const display = msg.videoFrame.display ?? 0;
      this.frameCount[display] = (this.frameCount[display] ?? 0) +
        this.countVideoFrames(msg.videoFrame);
      const codec = this.getCodecFormat(msg.videoFrame);
      if (codec !== this.currentCodec) {
        this.currentCodec = codec;
        this.callbacks.onGlobalEvent?.(
          JSON.stringify({
            name: "update_quality_status",
            codec_format: codec,
          }),
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
      this.handleTestDelay(msg.testDelay);
      return;
    }
    if (msg.terminalResponse) {
      void this.handleTerminalResponse(msg.terminalResponse);
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

  private handleTestDelay(td: hbb.ITestDelay): void {
    if (td.fromClient) return;
    this.callbacks.onGlobalEvent?.(
      JSON.stringify({
        name: "update_quality_status",
        delay: `${td.lastDelay ?? 0}`,
        target_bitrate: `${td.targetBitrate ?? 0}`,
      }),
    );
    this.callbacks.sendToPeer?.(hbb.Message.create({ testDelay: td }));
  }

  private async handleTerminalResponse(
    tr: hbb.ITerminalResponse,
  ): Promise<void> {
    if (tr.opened) {
      const o = tr.opened;
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "terminal_response",
          type: "opened",
          terminal_id: o.terminalId ?? 0,
          success: o.success ?? false,
          message: o.message ?? "",
          pid: o.pid ?? 0,
          service_id: o.serviceId ?? "",
        }),
      );
    } else if (tr.closed) {
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "terminal_response",
          type: "closed",
          terminal_id: tr.closed.terminalId ?? 0,
          exit_code: tr.closed.exitCode ?? 0,
        }),
      );
    } else if (tr.error) {
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "terminal_response",
          type: "error",
          terminal_id: tr.error.terminalId ?? 0,
          message: tr.error.message ?? "",
        }),
      );
    } else if (tr.data) {
      const d = tr.data;
      let raw = (d.data as Uint8Array) ?? new Uint8Array(0);
      if (d.compressed && raw.length > 0) {
        await initZstd();
        raw = zstdDecompress(raw);
      }
      this.callbacks.onGlobalEvent?.(
        JSON.stringify({
          name: "terminal_response",
          type: "data",
          terminal_id: d.terminalId ?? 0,
          data: base64Encode(raw),
        }),
      );
    }
  }

  private countVideoFrames(vf: hbb.IVideoFrame): number {
    const frames =
      vf.vp9s?.frames ??
      vf.h264s?.frames ??
      vf.h265s?.frames ??
      vf.av1s?.frames ??
      vf.vp8s?.frames;
    return frames?.length ?? 0;
  }

  private getCodecFormat(vf: hbb.IVideoFrame): string {
    if (vf.vp9s) return "VP9";
    if (vf.vp8s) return "VP8";
    if (vf.av1s) return "AV1";
    if (vf.h264s) return "H264";
    if (vf.h265s) return "H265";
    return "Unknown";
  }

  private startStatsTimer(): void {
    if (this.statsTimer) return;
    this.statsTs = Date.now();
    this.statsTimer = setInterval(() => this.updateQualityStats(), 1000);
  }

  private updateQualityStats(): void {
    const now = Date.now();
    const elapsed = now - this.statsTs;
    if (elapsed < 1000) return;
    this.statsTs = now;
    const speed = `${(this.recvBytes / 1024 / elapsed * 1000).toFixed(2)} kb/s`;
    this.recvBytes = 0;
    const fps: Record<string, number> = {};
    for (const k in this.frameCount) {
      if (Object.prototype.hasOwnProperty.call(this.frameCount, k)) {
        fps[k] = Math.floor(this.frameCount[k] / (elapsed / 1000));
      }
    }
    this.frameCount = {};
    this.callbacks.onGlobalEvent?.(
      JSON.stringify({
        name: "update_quality_status",
        speed,
        fps: JSON.stringify(fps),
      }),
    );
  }

  destroy(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
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