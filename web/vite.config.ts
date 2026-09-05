import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const sodiumCjs = fileURLToPath(
  new URL(
    "./node_modules/libsodium-wrappers/dist/modules/libsodium-wrappers.js",
    import.meta.url,
  ),
);

function formatBuildDate(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "libsodium-wrappers": sodiumCjs,
    },
  },
  optimizeDeps: {
    exclude: ["@bokuweb/zstd-wasm"],
  },
  define: {
    __BUILD_DATE__: JSON.stringify(formatBuildDate()),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: "src/bootstrap.ts",
      output: {
        format: "es",
        entryFileNames: "rustdesk-web-[hash].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (id.includes("node_modules/protobufjs/")) {
            return "protobufjs";
          }
        },
      },
    },
  },
});
