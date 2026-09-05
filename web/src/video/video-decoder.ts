import { hbb } from "../proto/index.js";
import { FFmpegDecoder } from "./ffmpeg-decoder.js";
import { WebCodecsDecoder } from "./webcodecs-decoder.js";

export type { Nalu } from "./nal-utils.js";
export {
  splitNalus,
  h264NalType,
  h265NalType,
  nalusToLengthPrefix,
  annexBToLengthPrefix,
  buildAvcC,
  buildHevC,
  h264CodecString,
  h265CodecString,
} from "./nal-utils.js";

const CODEC_VP8 = 0;
const CODEC_VP9 = 1;
const CODEC_AV1 = 2;
const CODEC_H264 = 3;
const CODEC_H265 = 4;

export interface WebCodecsCallbacks {
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
  onChromaChange?: (chroma: string) => void;
}

interface QueuedFrame {
  display: number;
  codec: number;
  data: ArrayBuffer;
}

export class VideoDecoderManager {
  private ffmpeg: FFmpegDecoder;
  private webcodecs = new Map<number, WebCodecsDecoder>();
  private webcodecsDisabled = false;

  private supportedEncoding: { h264: boolean; h265: boolean; vp8: boolean; av1: boolean } = {
    h264: false, h265: false, vp8: false, av1: false,
  };
  private videoQueue: QueuedFrame[] = [];
  private decoding = false;
  private currentChroma = "";

  constructor(private callbacks: WebCodecsCallbacks = {}) {
    this.ffmpeg = new FFmpegDecoder();
  }

  async loadFFmpeg(): Promise<void> {
    try {
      await this.ffmpeg.load();
    } catch (e) {
      console.error("[ffmpeg] load failed:", e);
    }
  }

  setDimensions(_width: number, _height: number): void {
    // FFmpeg handles dimensions internally; kept for API compatibility.
  }

  setSupportedEncoding(enc: hbb.ISupportedEncoding): void {
    this.supportedEncoding = {
      h264: enc.h264 ?? false,
      h265: enc.h265 ?? false,
      vp8: enc.vp8 ?? false,
      av1: enc.av1 ?? false,
    };
  }

  getAlternativeCodecs(): { vp8: boolean; av1: boolean; h264: boolean; h265: boolean } {
    return {
      vp8: this.supportedEncoding.vp8,
      av1: this.supportedEncoding.av1,
      h264: this.supportedEncoding.h264,
      h265: this.supportedEncoding.h265,
    };
  }

  decodeVideoFrame(videoFrame: hbb.IVideoFrame): void {
    const display = videoFrame.display ?? 0;
    let codec: number;
    let frames: hbb.IEncodedVideoFrame[];

    if (videoFrame.vp8s?.frames) {
      codec = CODEC_VP8;
      frames = videoFrame.vp8s.frames;
    } else if (videoFrame.vp9s?.frames) {
      codec = CODEC_VP9;
      frames = videoFrame.vp9s.frames;
    } else if (videoFrame.av1s?.frames) {
      codec = CODEC_AV1;
      frames = videoFrame.av1s.frames;
    } else if (videoFrame.h264s?.frames) {
      codec = CODEC_H264;
      frames = videoFrame.h264s.frames;
    } else if (videoFrame.h265s?.frames) {
      codec = CODEC_H265;
      frames = videoFrame.h265s.frames;
    } else {
      return;
    }

    for (const frame of frames) {
      const raw = frame.data as Uint8Array;
      const isKey = frame.key ?? false;

      if (this.tryWebCodecs(display, codec, raw, isKey)) {
        continue;
      }

      const copy = new ArrayBuffer(raw.length);
      new Uint8Array(copy).set(raw);
      this.videoQueue.push({ display, codec, data: copy });
    }

    if (!this.decoding && this.videoQueue.length > 0) {
      void this.processQueue();
    }
  }

  private tryWebCodecs(
    display: number,
    codec: number,
    data: Uint8Array,
    isKey: boolean,
  ): boolean {
    if (this.webcodecsDisabled) return false;
    if (!WebCodecsDecoder.available || !WebCodecsDecoder.canHandle(codec)) {
      return false;
    }

    let decoder = this.webcodecs.get(display);
    if (!decoder) {
      decoder = new WebCodecsDecoder(display, {
        onFrame: (d, frame) => {
          this.callbacks.onVideoFrame?.(d, frame);
        },
        onChromaChange: (chroma) => this.updateChroma(chroma),
        onError: (e) => {
          console.error("[webcodecs] decoder error, falling back to ffmpeg:", e);
          this.webcodecsDisabled = true;
          this.closeWebCodecsDecoders();
        },
      });
      this.webcodecs.set(display, decoder);
    }

    return decoder.decode(codec, data, isKey);
  }

  private updateChroma(chroma: string): void {
    if (this.currentChroma !== chroma) {
      this.currentChroma = chroma;
      this.callbacks.onChromaChange?.(chroma);
    }
  }

  private closeWebCodecsDecoders(): void {
    for (const decoder of this.webcodecs.values()) {
      decoder.close();
    }
    this.webcodecs.clear();
  }

  private async processQueue(): Promise<void> {
    this.decoding = true;
    try {
      if (!this.ffmpeg.isLoaded()) {
        await this.loadFFmpeg();
      }
      while (this.videoQueue.length > 0) {
        await this.decodeOne(this.videoQueue.shift()!);
      }
    } catch (e) {
      console.error("[ffmpeg] processQueue failed:", e);
    }
    this.decoding = false;
  }

  private async decodeOne(item: QueuedFrame): Promise<void> {
    try {
      const result = await this.ffmpeg.decode(item.codec, item.data);
      if (result && result.data) {
        const rgba = new Uint8Array(result.data);
        this.callbacks.onRgba?.(item.display, rgba);
        const chroma = result.yuvFormat === 5 ? "4:4:4" : "4:2:0";
        this.updateChroma(chroma);
      }
    } catch (e) {
      console.error("[ffmpeg] decode failed:", e);
    }
  }

  close(): void {
    this.videoQueue = [];
    this.decoding = false;
    this.ffmpeg.close();
    this.closeWebCodecsDecoders();
  }
}
