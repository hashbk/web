import { defineConfig, Plugin, UserConfig } from "vite";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const sodiumCjs = fileURLToPath(
  new URL(
    "./node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js",
    import.meta.url,
  ),
);

function formatBuildDate(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function assetHash(filePath: string): string {
  if (!existsSync(filePath)) return "";
  return createHash("sha256").update(readFileSync(filePath)).digest("hex").slice(0, 12);
}

function copyFFmpegFiles(): Plugin {
  return {
    name: "copy-ffmpeg-files",
    writeBundle(opts) {
      const outDir = opts.dir ?? "dist";
      mkdirSync(outDir, { recursive: true });
      const root = dirname(fileURLToPath(import.meta.url));
      const files: Array<[string, string]> = [
        [join(root, "public", "ffmpeg.js"), "ffmpeg.js"],
        [join(root, "public", "ffmpeg-core.js"), "ffmpeg-core.js"],
        [join(root, "public", "ffmpeg-core.wasm"), "ffmpeg-core.wasm"],
      ];
      for (const [src, dest] of files) {
        if (existsSync(src)) {
          copyFileSync(src, join(outDir, dest));
        }
      }
    },
  };
}

export function createBaseConfig(entry: string): UserConfig {
  const root = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(root, "public");
  return defineConfig({
    resolve: {
      alias: {
        "libsodium-wrappers-sumo": sodiumCjs,
      },
    },
    optimizeDeps: {
      exclude: ["@bokuweb/zstd-wasm"],
    },
    define: {
      __BUILD_DATE__: JSON.stringify(formatBuildDate()),
      __FFMPEG_JS_HASH__: JSON.stringify(assetHash(join(publicDir, "ffmpeg.js"))),
      __FFMPEG_CORE_JS_HASH__: JSON.stringify(assetHash(join(publicDir, "ffmpeg-core.js"))),
      __FFMPEG_CORE_WASM_HASH__: JSON.stringify(assetHash(join(publicDir, "ffmpeg-core.wasm"))),
    },
    plugins: [copyFFmpegFiles()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: { main: entry },
        output: {
          entryFileNames: "index-[hash].js",
          chunkFileNames: "[name]-[hash].js",
          assetFileNames: "[name]-[hash][extname]",
          manualChunks(id) {
            if (id.includes("node_modules")) {
              return "vendor";
            }
          },
        },
      },
    },
  });
}