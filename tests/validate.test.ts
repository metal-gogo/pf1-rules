import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { projectRoot } from "../src/config.js";
import { validatePackage } from "../src/ingestion/validate.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("rejects duplicate canonical spell IDs before importing", () => {
  vi.stubEnv("PF1_VERIFY_ARTIFACTS", "0");
  const readDirectory = fs.readdirSync;
  vi.spyOn(fs, "readdirSync").mockImplementation(((...args: Parameters<typeof fs.readdirSync>) => {
    const entries = readDirectory(...args);
    return args[0] === path.join(projectRoot, "data", "canonical")
      ? [...entries, entries[0]!]
      : entries;
  }) as typeof fs.readdirSync);
  expect(() => validatePackage()).toThrow("Duplicate canonical spell ID");
}, 30_000);

it("rejects duplicate relationship IDs before importing", () => {
  vi.stubEnv("PF1_VERIFY_ARTIFACTS", "0");
  const readFile = fs.readFileSync;
  const filename = path.join(projectRoot, "data", "canonical", "blink.json");
  vi.spyOn(fs, "readFileSync").mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
    const content = readFile(...args);
    if (args[0] !== filename) return content;
    const record = JSON.parse(String(content));
    record.relationships.push(record.relationships[0]);
    return JSON.stringify(record);
  }) as typeof fs.readFileSync);
  expect(() => validatePackage()).toThrow("Duplicate relationship ID");
}, 30_000);

it("checks manifest ordering even when raw artifact checks are disabled", () => {
  vi.stubEnv("PF1_VERIFY_ARTIFACTS", "0");
  const readFile = fs.readFileSync;
  const filename = path.join(projectRoot, "data", "ingestion", "level-0-spells.json");
  vi.spyOn(fs, "readFileSync").mockImplementation(((...args: Parameters<typeof fs.readFileSync>) => {
    const content = readFile(...args);
    if (args[0] !== filename) return content;
    const record = JSON.parse(String(content));
    record.spells[0].priority = 9999;
    return JSON.stringify(record);
  }) as typeof fs.readFileSync);
  expect(() => validatePackage()).toThrow("Unstable ingestion ordering");
});
