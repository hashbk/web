import { describe, it, expect } from "vitest";
import {
  splitNalus,
  annexBToLengthPrefix,
  buildAvcC,
  buildHevC,
  h264NalType,
  h265NalType,
  h264CodecString,
  nalusToLengthPrefix,
  VideoDecoderManager,
} from "../src/video/video-decoder.js";
import { hbb } from "../src/proto/index.js";

function startCode3(): Uint8Array {
  return new Uint8Array([0x00, 0x00, 0x01]);
}

function startCode4(): Uint8Array {
  return new Uint8Array([0x00, 0x00, 0x00, 0x01]);
}

function makeAnnexB(...nalus: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const nalu of nalus) {
    parts.push(startCode4());
    parts.push(nalu);
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.length;
  }
  return result;
}

describe("splitNalus", () => {
  it("splits single NALU with 4-byte start code", () => {
    const nalu = new Uint8Array([0x67, 0x42, 0xc0, 0x1e]);
    const data = makeAnnexB(nalu);
    const nalus = splitNalus(data);
    expect(nalus.length).toBe(1);
    expect(Array.from(nalus[0])).toEqual([0x67, 0x42, 0xc0, 0x1e]);
  });

  it("splits multiple NALUs", () => {
    const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e, 0x23]);
    const pps = new Uint8Array([0x68, 0xce, 0x3c, 0x80]);
    const idr = new Uint8Array([0x65, 0x88, 0x84, 0x00]);
    const data = makeAnnexB(sps, pps, idr);
    const nalus = splitNalus(data);
    expect(nalus.length).toBe(3);
    expect(nalus[0][0]).toBe(0x67);
    expect(nalus[1][0]).toBe(0x68);
    expect(nalus[2][0]).toBe(0x65);
  });

  it("handles 3-byte start codes", () => {
    const nalu = new Uint8Array([0x67, 0x01, 0x02]);
    const sc = startCode3();
    const data = new Uint8Array(sc.length + nalu.length);
    data.set(sc, 0);
    data.set(nalu, sc.length);
    const nalus = splitNalus(data);
    expect(nalus.length).toBe(1);
    expect(Array.from(nalus[0])).toEqual([0x67, 0x01, 0x02]);
  });

  it("returns empty for no start codes", () => {
    const data = new Uint8Array([0x01, 0x02, 0x03]);
    expect(splitNalus(data)).toEqual([]);
  });
});

describe("h264NalType / h265NalType", () => {
  it("h264NalType extracts lower 5 bits", () => {
    expect(h264NalType(new Uint8Array([0x67]))).toBe(7);
    expect(h264NalType(new Uint8Array([0x68]))).toBe(8);
    expect(h264NalType(new Uint8Array([0x65]))).toBe(5);
  });

  it("h265NalType extracts bits 1-6", () => {
    expect(h265NalType(new Uint8Array([0x40, 0x01]))).toBe(32);
    expect(h265NalType(new Uint8Array([0x42, 0x01]))).toBe(33);
    expect(h265NalType(new Uint8Array([0x44, 0x01]))).toBe(34);
  });
});

describe("nalusToLengthPrefix", () => {
  it("prepends 4-byte big-endian length to each NALU", () => {
    const nalu1 = new Uint8Array([0x67, 0x42]);
    const nalu2 = new Uint8Array([0x68, 0xce, 0x3c]);
    const result = nalusToLengthPrefix([nalu1, nalu2]);
    const view = new DataView(result.buffer);
    expect(view.getUint32(0)).toBe(2);
    expect(result[4]).toBe(0x67);
    expect(result[5]).toBe(0x42);
    expect(view.getUint32(6)).toBe(3);
    expect(result[10]).toBe(0x68);
  });
});

describe("annexBToLengthPrefix", () => {
  it("converts annexB to 4-byte length-prefix format", () => {
    const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e]);
    const pps = new Uint8Array([0x68, 0xce, 0x3c, 0x80]);
    const data = makeAnnexB(sps, pps);
    const result = annexBToLengthPrefix(data);
    const view = new DataView(result.buffer);
    expect(view.getUint32(0)).toBe(4);
    expect(result[4]).toBe(0x67);
    expect(view.getUint32(8)).toBe(4);
    expect(result[12]).toBe(0x68);
  });
});

describe("buildAvcC", () => {
  it("builds valid avcC with SPS and PPS", () => {
    const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e, 0x23, 0x45]);
    const pps = new Uint8Array([0x68, 0xce, 0x3c, 0x80]);
    const avcc = buildAvcC(sps, pps);
    expect(avcc[0]).toBe(1);
    expect(avcc[1]).toBe(0x42);
    expect(avcc[2]).toBe(0xc0);
    expect(avcc[3]).toBe(0x1e);
    expect(avcc[4]).toBe(0xff);
    expect(avcc[5]).toBe(0xe1);
    expect(avcc[6]).toBe(0);
    expect(avcc[7]).toBe(sps.length);
  });
});

describe("buildHevC", () => {
  it("builds valid hevC with VPS, SPS, PPS", () => {
    const vps = new Uint8Array([0x40, 0x01, 0x0c]);
    const sps = new Uint8Array([0x42, 0x01, 0x01]);
    const pps = new Uint8Array([0x44, 0x01, 0xc1]);
    const hevc = buildHevC(vps, sps, pps);
    expect(hevc[0]).toBe(1);
    expect(hevc.length).toBeGreaterThan(vps.length + sps.length + pps.length);
  });
});

describe("h264CodecString", () => {
  it("extracts profile and level from SPS", () => {
    const sps = new Uint8Array([0x67, 0x42, 0xc0, 0x1e]);
    expect(h264CodecString(sps)).toBe("avc1.42001e");
  });

  it("returns default for too-short SPS", () => {
    expect(h264CodecString(new Uint8Array([0x67]))).toBe("avc1.42c01e");
  });
});

describe("VideoDecoderManager", () => {
  it("ignores RGB frames (proto RGB has no data field)", () => {
    const received: Array<{ display: number; rgba: Uint8Array }> = [];
    const manager = new VideoDecoderManager({
      onRgba: (display, rgba) => received.push({ display, rgba }),
    });
    const vf = hbb.VideoFrame.create({ rgb: { compress: false }, display: 0 });
    manager.decodeVideoFrame(vf);
    expect(received.length).toBe(0);
    manager.close();
  });

  it("close() does not throw when no decoders exist", () => {
    const manager = new VideoDecoderManager({});
    expect(() => manager.close()).not.toThrow();
  });
});