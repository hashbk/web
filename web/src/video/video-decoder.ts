import { hbb } from "../proto/index.js";

export interface WebCodecsCallbacks {
  onVideoFrame?: (display: number, frame: unknown) => void;
  onRgba?: (display: number, rgba: Uint8Array) => void;
}

type Nalu = Uint8Array;

const H264_NAL_TYPE_MASK = 0x1f;
const H264_NAL_SPS = 7;
const H264_NAL_PPS = 8;

const H265_NAL_TYPE_MASK = 0x3f;
const H265_NAL_VPS = 32;
const H265_NAL_SPS = 33;
const H265_NAL_PPS = 34;


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

interface DecoderEntry {
  decoder: any;
  configured: boolean;
  codec: string;
  description?: Uint8Array;
}

export class VideoDecoderManager {
  private decoders = new Map<number, DecoderEntry>();
  private width = 0;
  private height = 0;

  constructor(private callbacks: WebCodecsCallbacks = {}) {}

  setDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  decodeVideoFrame(videoFrame: hbb.IVideoFrame): void {
    const display = videoFrame.display ?? 0;

    if (videoFrame.vp9s?.frames) {
      this.decodeEncodedFrames(display, "vp9", videoFrame.vp9s.frames, undefined);
    } else if (videoFrame.vp8s?.frames) {
      this.decodeEncodedFrames(display, "vp8", videoFrame.vp8s.frames, undefined);
    } else if (videoFrame.av1s?.frames) {
      this.decodeEncodedFrames(display, "av1", videoFrame.av1s.frames, undefined);
    } else if (videoFrame.h264s?.frames) {
      this.decodeH264Frames(display, videoFrame.h264s.frames);
    } else if (videoFrame.h265s?.frames) {
      this.decodeH265Frames(display, videoFrame.h265s.frames);

    }
  }

  private decodeEncodedFrames(
    display: number,
    codec: string,
    frames: hbb.IEncodedVideoFrame[],
    description: Uint8Array | undefined,
  ): void {
    const entry = this.getOrCreateDecoder(display, codec, description);
    if (!entry) return;

    for (const frame of frames) {
      this.feedChunk(entry, frame, false);
    }
  }

  private decodeH264Frames(
    display: number,
    frames: hbb.IEncodedVideoFrame[],
  ): void {
    let sps: Uint8Array | undefined;
    let pps: Uint8Array | undefined;

    for (const frame of frames) {
      const data = frame.data as Uint8Array;
      const nalus = splitNalus(data);
      for (const nalu of nalus) {
        const type = h264NalType(nalu);
        if (type === H264_NAL_SPS) sps = nalu;
        else if (type === H264_NAL_PPS) pps = nalu;
      }
    }

    let description: Uint8Array | undefined;
    let codec = "avc1.42c01e";
    if (sps && pps) {
      description = buildAvcC(sps, pps);
      codec = h264CodecString(sps);
    }

    const entry = this.getOrCreateDecoder(display, codec, description);
    if (!entry) return;

    for (const frame of frames) {
      this.feedChunk(entry, frame, true);
    }
  }

  private decodeH265Frames(
    display: number,
    frames: hbb.IEncodedVideoFrame[],
  ): void {
    let vps: Uint8Array | undefined;
    let sps: Uint8Array | undefined;
    let pps: Uint8Array | undefined;

    for (const frame of frames) {
      const data = frame.data as Uint8Array;
      const nalus = splitNalus(data);
      for (const nalu of nalus) {
        const type = h265NalType(nalu);
        if (type === H265_NAL_VPS) vps = nalu;
        else if (type === H265_NAL_SPS) sps = nalu;
        else if (type === H265_NAL_PPS) pps = nalu;
      }
    }

    let description: Uint8Array | undefined;
    let codec = "hev1.1.6.L93.B0";
    if (vps && sps && pps) {
      description = buildHevC(vps, sps, pps);
      codec = h265CodecString(sps);
    }

    const entry = this.getOrCreateDecoder(display, codec, description);
    if (!entry) return;

    for (const frame of frames) {
      this.feedChunk(entry, frame, true);
    }
  }

  private getOrCreateDecoder(
    display: number,
    codec: string,
    description: Uint8Array | undefined,
  ): DecoderEntry | null {
    let entry = this.decoders.get(display);
    if (entry && entry.configured && entry.codec !== codec) {
      this.closeDecoder(display);
      entry = undefined;
    }

    if (!entry) {
      const decoderCtor = (globalThis as any).VideoDecoder;
      if (!decoderCtor) return null;

      const decoder = new decoderCtor({
        output: (frame: any) => {
          if (this.callbacks.onVideoFrame) {
            this.callbacks.onVideoFrame(display, frame);
          } else {
            frame.close?.();
          }
        },
        error: (e: Error) => {
          console.error(`VideoDecoder error (display ${display}):`, e);
        },
      });

      entry = { decoder, configured: false, codec, description };
      this.decoders.set(display, entry);
    }

    if (!entry.configured) {
      const config: Record<string, unknown> = {
        codec,
        codedWidth: this.width,
        codedHeight: this.height,
        optimizeForLatency: true,
      };
      if (description) config.description = description;

      try {
        entry.decoder.configure(config);
        entry.configured = true;
        entry.codec = codec;
        entry.description = description;
      } catch (e) {
        console.error(`VideoDecoder configure failed (display ${display}):`, e);
        return null;
      }
    }

    return entry;
  }

  private feedChunk(
    entry: DecoderEntry,
    frame: hbb.IEncodedVideoFrame,
    convertAnnexB: boolean,
  ): void {
    let data = frame.data as Uint8Array;
    if (convertAnnexB) {
      data = annexBToLengthPrefix(data);
    }

    const chunkCtor = (globalThis as any).EncodedVideoChunk;
    if (!chunkCtor) return;

    const chunk = new chunkCtor({
      type: frame.key ? "key" : "delta",
      timestamp: frame.pts ?? 0,
      data,
    });

    try {
      entry.decoder.decode(chunk);
    } catch (e) {
      console.error("VideoDecoder decode failed:", e);
    }
  }


  private closeDecoder(display: number): void {
    const entry = this.decoders.get(display);
    if (entry) {
      try {
        entry.decoder.close();
      } catch {
        // ignore
      }
      this.decoders.delete(display);
    }
  }

  close(): void {
    for (const display of this.decoders.keys()) {
      this.closeDecoder(display);
    }
  }
}