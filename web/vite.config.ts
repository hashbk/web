import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const sodiumCjs = fileURLToPath(
  new URL(
    "./node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js",
    import.meta.url,
  ),
);

export default defineConfig({
  resolve: {
    alias: {
      "libsodium-wrappers-sumo": sodiumCjs,
    },
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