import { defineConfig, Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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

export default defineConfig({
  base: "./",
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
  },
  plugins: [copyFFmpegFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/bootstrap.ts",
      output: {
        format: "es",
        entryFileNames: "rustdesk-web.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
