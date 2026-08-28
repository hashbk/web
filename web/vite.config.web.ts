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
        [join(root, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.js"), "ffmpeg-core.js"],
        [join(root, "node_modules", "@ffmpeg", "core", "dist", "esm", "ffmpeg-core.wasm"), "ffmpeg-core.wasm"],
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
  resolve: {
    alias: {
      "libsodium-wrappers-sumo": sodiumCjs,
    },
  },
  define: {
    __BUILD_DATE__: JSON.stringify(formatBuildDate()),
  },
  plugins: [copyFFmpegFiles()],
  build: {
    lib: {
      entry: "src/bootstrap.ts",
      name: "RustdeskWeb",
      fileName: "rustdesk-web",
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});