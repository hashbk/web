import {
  buildAvcC,
  buildHevC,
  extractH264Params,
  extractH265Params,
  h264CodecString,
  h265CodecString,
} from "./nal-utils.js";

export const CODEC_VP8 = 0;
export const CODEC_VP9 = 1;
export const CODEC_AV1 = 2;
export const CODEC_H264 = 3;
export const CODEC_H265 = 4;

interface WebCodecsFrameSink {
  onFrame: (display: number, frame: VideoFrame) => void;
  onChromaChange: (chroma: string) => void;
  onError: (e: Error) => void;
}

function chromaFromFormat(format: string): string {
  if (format === "I444" || format === "I444A" || format === "I444X") {
    return "4:4:4";
  }
  return "4:2:0";
}

function vp9CodecString(): string {
  return "vp09.00.10.08";
}

function av1CodecString(): string {
  return "av01.0.04M.08";
}

export class WebCodecsDecoder {
  private decoder: VideoDecoder | null = null;
  private configuredCodec = -1;
  private readonly display: number;
  private readonly sink: WebCodecsFrameSink;
  private nextTimestamp = 0;
  private readonly failedCodecs = new Set<number>();

  constructor(display: number, sink: WebCodecsFrameSink) {
    this.display = display;
    this.sink = sink;
  }

  static get available(): boolean {
    return typeof VideoDecoder !== "undefined";
  }

  static canHandle(codec: number): boolean {
    return codec !== CODEC_H265;
  }

  decode(codec: number, data: Uint8Array, isKey: boolean): boolean {
    if (!WebCodecsDecoder.available) return false;
    if (!WebCodecsDecoder.canHandle(codec)) return false;
    if (this.failedCodecs.has(codec)) return false;

    try {
      if (this.configuredCodec !== codec) {
        if (!isKey) return false;
        if (!this.configure(codec, data)) {
          this.failedCodecs.add(codec);
          return false;
        }
      }

      const dec = this.decoder;
      if (!dec || dec.state === "closed" || dec.state === "unconfigured") {
        return false;
      }

      const chunk = new EncodedVideoChunk({
        type: isKey ? "key" : "delta",
        timestamp: this.nextTimestamp++,
        data,
      });
      dec.decode(chunk);
      return true;
    } catch (e) {
      this.sink.onError(e instanceof Error ? e : new Error(String(e)));
      return false;
    }
  }

  private configure(codec: number, keyframe: Uint8Array): boolean {
    let config: VideoDecoderConfig;

    switch (codec) {
      case CODEC_VP8:
        config = { codec: "vp8" };
        break;
      case CODEC_VP9:
        config = { codec: vp9CodecString() };
        break;
      case CODEC_AV1:
        config = { codec: av1CodecString() };
        break;
      case CODEC_H264: {
        const { sps, pps } = extractH264Params(keyframe);
        if (!sps || !pps) return false;
        config = {
          codec: h264CodecString(sps),
          description: buildAvcC(sps, pps),
        };
        break;
      }
      case CODEC_H265: {
        const { vps, sps, pps } = extractH265Params(keyframe);
        if (!vps || !sps || !pps) return false;
        config = {
          codec: h265CodecString(sps),
          description: buildHevC(vps, sps, pps),
        };
        break;
      }
      default:
        return false;
    }

    this.closeDecoder();
    this.decoder = new VideoDecoder({
      output: (frame: VideoFrame) => {
        this.sink.onChromaChange(chromaFromFormat(frame.format ?? ""));
        this.sink.onFrame(this.display, frame);
      },
      error: (e: DOMException) => {
        this.sink.onError(new Error(e.message));
      },
    });
    this.decoder.configure(config);
    this.configuredCodec = codec;
    return true;
  }

  private closeDecoder(): void {
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {
        // ignore
      }
      this.decoder = null;
    }
  }

  close(): void {
    this.closeDecoder();
    this.configuredCodec = -1;
  }
}