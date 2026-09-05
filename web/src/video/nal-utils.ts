export type Nalu = Uint8Array;

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

export function extractH264Params(
  data: Uint8Array,
): { sps?: Uint8Array; pps?: Uint8Array } {
  const nalus = splitNalus(data);
  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;
  for (const nalu of nalus) {
    const type = h264NalType(nalu);
    if (type === 7) sps = nalu;
    else if (type === 8) pps = nalu;
  }
  return { sps, pps };
}

export function extractH265Params(
  data: Uint8Array,
): { vps?: Uint8Array; sps?: Uint8Array; pps?: Uint8Array } {
  const nalus = splitNalus(data);
  let vps: Uint8Array | undefined;
  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;
  for (const nalu of nalus) {
    const type = h265NalType(nalu);
    if (type === 32) vps = nalu;
    else if (type === 33) sps = nalu;
    else if (type === 34) pps = nalu;
  }
  return { vps, sps, pps };
}