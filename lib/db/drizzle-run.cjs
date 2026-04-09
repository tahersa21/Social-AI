#!/usr/bin/env node
/**
 * drizzle-run.cjs — Patches Node's require via tsx/cjs so drizzle-kit can
 * load TypeScript schema files that use .js import extensions (ESM convention).
 *
 * Usage: node ./drizzle-run.cjs <drizzle-kit args>
 *   e.g. node ./drizzle-run.cjs push --config ./drizzle.config.ts
 */

"use strict";

// 1. Patch require to understand TypeScript (.ts) and .js → .ts aliasing
require("tsx/cjs");

// 2. Locate drizzle-kit bin.cjs in the pnpm store (version-agnostic)
const path = require("path");
const fs   = require("fs");

const root  = path.resolve(__dirname, "../..");
const pnpm  = path.join(root, "node_modules/.pnpm");

let drizzleBin = null;

if (fs.existsSync(pnpm)) {
  const entries = fs.readdirSync(pnpm).filter((e) => e.startsWith("drizzle-kit@"));
  for (const entry of entries) {
    const candidate = path.join(pnpm, entry, "node_modules/drizzle-kit/bin.cjs");
    if (fs.existsSync(candidate)) {
      drizzleBin = candidate;
      break;
    }
  }
}

if (!drizzleBin) {
  console.error("[drizzle-run] ERROR: drizzle-kit/bin.cjs not found in", pnpm);
  process.exit(1);
}

// 3. Run drizzle-kit — process.argv already contains the sub-command and flags
require(drizzleBin);
