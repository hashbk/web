import { init as initZstdWasm, decompress as zstdDecompressRaw } from "@bokuweb/zstd-wasm";

let ready = false;

export async function initZstd(): Promise<void> {
  if (ready) return;
  await initZstdWasm();
  ready = true;
}

export function zstdDecompress(buf: Uint8Array): Uint8Array {
  if (!ready) {
    throw new Error("zstd not initialized; call initZstd() first");
  }
  return zstdDecompressRaw(buf);
}