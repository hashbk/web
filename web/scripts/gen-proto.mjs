#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const protoDir = resolve(root, "../rustdesk/libs/hbb_common/protos");
const outDir = resolve(root, "src/proto/generated");

if (!existsSync(protoDir)) {
  console.error(`error: proto source directory not found: ${protoDir}`);
  console.error("Ensure the rustdesk git submodule is initialized.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const protoFiles = [
  resolve(protoDir, "rendezvous.proto"),
  resolve(protoDir, "message.proto"),
];

const jsOut = resolve(outDir, "proto.js");
const dtsOut = resolve(outDir, "proto.d.ts");

console.log("Generating proto.js...");
execFileSync(
  "npx",
  [
    "pbjs",
    "-t", "static-module",
    "-w", "es6",
    "-r", "rustdesk_proto",
    "--es6",

    "-o", jsOut,
    ...protoFiles,
  ],
  { stdio: "inherit", cwd: root },
);

console.log("Generating proto.d.ts...");
execFileSync(
  "npx",
  [
    "pbts",
    "-o", dtsOut,
    jsOut,
  ],
  { stdio: "inherit", cwd: root },
);

console.log(`Proto files generated:\n  ${jsOut}\n  ${dtsOut}`);