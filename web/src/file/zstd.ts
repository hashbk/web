type ZstdDecompress = typeof import("@bokuweb/zstd-wasm")["decompress"];

let zstdDecompressRaw: ZstdDecompress | null = null;

export async function initZstd(): Promise<void> {
  if (zstdDecompressRaw) return;
  const mod = await import("@bokuweb/zstd-wasm");
  await mod.init();
  zstdDecompressRaw = mod.decompress;
}

export function zstdDecompress(buf: Uint8Array): Uint8Array {
  if (!zstdDecompressRaw) {
    throw new Error("zstd not initialized; call initZstd() first");
  }
  return zstdDecompressRaw(buf);
}