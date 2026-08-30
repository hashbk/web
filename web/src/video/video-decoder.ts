import { hbb } from "../proto/index.js";

export interface WebCodecsCallbacks {
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
  onChromaChange?: (chroma: string) => void;
}

type Nalu = Uint8Array;

const H264_NAL_TYPE_MASK = 0x1f;
const H265_NAL_TYPE_MASK = 0x3f;


export function splitNalus(data: Uint8Array): Nalu[] {
  const nalus: Nalu[] = [];
  let i = 0;
  const len = data.length;

  while (i < len) {
    let nalStart = -1;
    for (let j = i; j < len - 2; j++) {
      if (data[j] === 0 && data[j + 1] === 0) {
        if (data[j + 2] === 1) {
          nalStart = j + 3;
          break;
        }
        if (j < len - 3 && data[j + 2] === 0 && data[j + 3] === 1) {
          nalStart = j + 4;
          break;
        }
      }
    }
    if (nalStart < 0) break;

    let end = len;
    for (let j = nalStart; j < len - 2; j++) {
      if (data[j] === 0 && data[j + 1] === 0) {
        if (data[j + 2] === 1) {
          end = j;
          break;
        }
        if (j < len - 3 && data[j + 2] === 0 && data[j + 3] === 1) {
          end = j;
          break;
        }
      }
    }

    nalus.push(data.subarray(nalStart, end));
    i = end;
  }

  return nalus;
}

export function h264NalType(nalu: Uint8Array): number {
  if (nalu.length < 1) return -1;
  return nalu[0] & H264_NAL_TYPE_MASK;
}

export function h265NalType(nalu: Uint8Array): number {
  if (nalu.length < 2) return -1;
  return (nalu[0] >> 1) & H265_NAL_TYPE_MASK;
}

export function nalusToLengthPrefix(nalus: Nalu[]): Uint8Array {
  let totalLen = 0;
  for (const nalu of nalus) {
    totalLen += 4 + nalu.length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const nalu of nalus) {
    const view = new DataView(result.buffer, offset, 4);
    view.setUint32(0, nalu.length);
    offset += 4;
    result.set(nalu, offset);
    offset += nalu.length;
  }
  return result;
}

export function annexBToLengthPrefix(data: Uint8Array): Uint8Array {
  return nalusToLengthPrefix(splitNalus(data));
}

export function buildAvcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  if (sps.length < 4) throw new Error("SPS too short");
  const profile = sps[1];
  const constraint = sps[2];
  const level = sps[3];

  const buf = new Uint8Array(11 + sps.length + pps.length);
  let i = 0;
  buf[i++] = 1;
  buf[i++] = profile;
  buf[i++] = constraint;
  buf[i++] = level;
  buf[i++] = 0xff;
  buf[i++] = 0xe1;
  buf[i++] = (sps.length >> 8) & 0xff;
  buf[i++] = sps.length & 0xff;
  buf.set(sps, i); i += sps.length;
  buf[i++] = 1;
  buf[i++] = (pps.length >> 8) & 0xff;
  buf[i++] = pps.length & 0xff;
  buf.set(pps, i);
  return buf;
}

export function buildHevC(
  vps: Uint8Array,
  sps: Uint8Array,
  pps: Uint8Array,
): Uint8Array {
  const buf = new Uint8Array(22 + 6 + vps.length + 6 + sps.length + 6 + pps.length);


  let i = 0;
  buf[i++] = 1;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 3;

  buf[i++] = 0x80 | 0x40 | 0x20 | 0x10;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;
  buf[i++] = 0;

  buf[i++] = (vps.length >> 8) & 0xff;
  buf[i++] = vps.length & 0xff;
  buf.set(vps, i); i += vps.length;

  buf[i++] = (sps.length >> 8) & 0xff;
  buf[i++] = sps.length & 0xff;
  buf.set(sps, i); i += sps.length;

  buf[i++] = (pps.length >> 8) & 0xff;
  buf[i++] = pps.length & 0xff;
  buf.set(pps, i);

  return buf;
}

export function h264CodecString(sps: Uint8Array): string {
  if (sps.length < 4) return "avc1.42c01e";
  const profile = sps[1];
  const level = sps[3];
  return `avc1.${profile.toString(16).padStart(2, "0")}00${level.toString(16).padStart(2, "0")}`;
}

export function h265CodecString(sps: Uint8Array): string {
  if (sps.length < 4) return "hev1.1.6.L93.B0";
  return "hev1.1.6.L93.B0";
}

import { FFmpegDecoder } from "./ffmpeg-decoder.js";

const CODEC_VP8 = 0;
const CODEC_VP9 = 1;
const CODEC_AV1 = 2;
const CODEC_H264 = 3;
const CODEC_H265 = 4;

interface QueuedFrame {
  display: number;
  codec: number;
  data: ArrayBuffer;
}

export class VideoDecoderManager {
  private ffmpeg: FFmpegDecoder;

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
      const copy = new ArrayBuffer(raw.length);
      new Uint8Array(copy).set(raw);
      this.videoQueue.push({ display, codec, data: copy });
    }

    if (!this.decoding) {
      void this.processQueue();
    }
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
        if (this.currentChroma !== chroma) {
          this.currentChroma = chroma;
          this.callbacks.onChromaChange?.(chroma);
        }
      }
    } catch (e) {
      console.error("[ffmpeg] decode failed:", e);
    }
  }

  close(): void {
    this.videoQueue = [];
    this.decoding = false;
    this.ffmpeg.close();
  }
}