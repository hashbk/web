import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

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

export default defineConfig({
  resolve: {
    alias: {
      "libsodium-wrappers-sumo": sodiumCjs,
    },
  },
  define: {
    __BUILD_DATE__: JSON.stringify(formatBuildDate()),
  },
  build: {
    lib: {
      entry: "src/index.ts",
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
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});