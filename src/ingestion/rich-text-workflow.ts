import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "../config.js";
import { auditRichTextRollout, enrichRichTextSpells } from "./enrich-rich-text-pilot.js";


const defaultBatchSize = 25;

export interface RichTextBatchFile {
  spell_id: string;
  canonical_path: string;
  canonical_sha256: string;
  decision_path: string;
  decision_sha256: string;
}

export interface RichTextBatchManifest {
  version: 1;
  base_commit: string;
  upstream_commit: string;
  batch_size: number;
  spell_ids: string[];
  files: RichTextBatchFile[];
}


function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}


function sha256(filename: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}


function relativeSpellPath(directory: "canonical" | "decisions", spellId: string): string {
  return path.posix.join("data", directory, `${spellId.replace(/^spell\./, "")}.json`);
}


function absolutePath(relativePath: string): string {
  const filename = path.resolve(projectRoot, relativePath);
  if (!filename.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`Path is outside the repository: ${relativePath}`);
  }
  return filename;
}


export function expectedBatchPaths(manifest: RichTextBatchManifest): string[] {
  return manifest.files.flatMap((file) => [file.canonical_path, file.decision_path]).sort();
}


export function formatRichTextBatchCommitMessage(
  firstSpellName: string,
  batchSize: number,
): string {
  return `ingest rich-text: ${firstSpellName} + ${batchSize - 1} spells`;
}


export function validateRichTextBatchManifest(manifest: RichTextBatchManifest): void {
  if (manifest.version !== 1 || !/^[0-9a-f]{40}$/.test(manifest.base_commit) ||
    !/^[0-9a-f]{40}$/.test(manifest.upstream_commit) ||
    !Number.isSafeInteger(manifest.batch_size) || manifest.batch_size < 1 ||
    manifest.spell_ids.length !== manifest.batch_size) {
    throw new Error("Manifest has an invalid rich-text batch size.");
  }
  if (new Set(manifest.spell_ids).size !== manifest.spell_ids.length) {
    throw new Error("Manifest contains duplicate spell IDs.");
  }
  if (manifest.files.length !== manifest.spell_ids.length) {
    throw new Error("Manifest files do not match its spell IDs.");
  }
  for (const [index, file] of manifest.files.entries()) {
    const spellId = manifest.spell_ids[index];
    if (!spellId || file.spell_id !== spellId ||
      file.canonical_path !== relativeSpellPath("canonical", spellId) ||
      file.decision_path !== relativeSpellPath("decisions", spellId) ||
      !/^[0-9a-f]{64}$/.test(file.canonical_sha256) ||
      !/^[0-9a-f]{64}$/.test(file.decision_sha256)) {
      throw new Error(`Manifest has invalid paths for ${file.spell_id}.`);
    }
  }
}


function gitDirectory(): string {
  return path.resolve(projectRoot, run("git", ["rev-parse", "--git-dir"]));
}


function manifestFilename(manifest: RichTextBatchManifest): string {
  const identity = crypto.createHash("sha256")
    .update(`${manifest.base_commit}\n${manifest.spell_ids.join("\n")}\n`)
    .digest("hex")
    .slice(0, 16);
  return path.join(gitDirectory(), "pf1-rich-text-batches", `${identity}.json`);
}


function requireCleanWorkingTree(): void {
  const status = run("git", ["status", "--porcelain"]);
  if (status) throw new Error(`Working tree is not clean:\n${status}`);
}


function requireBaseCommit(manifest: RichTextBatchManifest): void {
  const head = run("git", ["rev-parse", "HEAD"]);
  if (head !== manifest.base_commit) {
    throw new Error(`HEAD changed since planning: expected ${manifest.base_commit}, found ${head}.`);
  }
}


function requireUpstreamAtBase(manifest: RichTextBatchManifest): void {
  const upstream = run("git", ["rev-parse", "@{upstream}"]);
  if (upstream !== manifest.upstream_commit || upstream !== manifest.base_commit) {
    throw new Error("The upstream branch changed since planning.");
  }
}


function changedPaths(args: string[]): string[] {
  const output = run("git", args);
  return output ? output.split("\n").filter(Boolean).sort() : [];
}


function assertSamePaths(actual: string[], expected: string[], phase: string): void {
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      `${phase} changed an unexpected file set:\n` +
      `Expected:\n${expected.join("\n")}\nActual:\n${actual.join("\n")}`,
    );
  }
}


function readManifest(filename: string): RichTextBatchManifest {
  const manifest = JSON.parse(fs.readFileSync(filename, "utf8")) as RichTextBatchManifest;
  validateRichTextBatchManifest(manifest);
  return manifest;
}


export function planRichTextBatch(batchSize = defaultBatchSize): {
  filename: string;
  manifest: RichTextBatchManifest;
} {
  requireCleanWorkingTree();
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("--size must be a positive integer.");
  }
  const spellIds = auditRichTextRollout().safe_spell_ids.slice(0, batchSize);
  if (spellIds.length !== batchSize) {
    throw new Error(`Only ${spellIds.length} safe spells are available; need ${batchSize}.`);
  }
  const manifest: RichTextBatchManifest = {
    version: 1,
    base_commit: run("git", ["rev-parse", "HEAD"]),
    upstream_commit: run("git", ["rev-parse", "@{upstream}"]),
    batch_size: batchSize,
    spell_ids: spellIds,
    files: spellIds.map((spellId) => {
      const canonicalPath = relativeSpellPath("canonical", spellId);
      const decisionPath = relativeSpellPath("decisions", spellId);
      return {
        spell_id: spellId,
        canonical_path: canonicalPath,
        canonical_sha256: sha256(absolutePath(canonicalPath)),
        decision_path: decisionPath,
        decision_sha256: sha256(absolutePath(decisionPath)),
      };
    }),
  };
  if (manifest.base_commit !== manifest.upstream_commit) {
    throw new Error("HEAD is not synchronized with its upstream branch.");
  }
  validateRichTextBatchManifest(manifest);
  const filename = manifestFilename(manifest);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { filename, manifest };
}


export function applyRichTextBatch(filename: string): void {
  const manifest = readManifest(filename);
  requireCleanWorkingTree();
  requireBaseCommit(manifest);
  for (const file of manifest.files) {
    if (sha256(absolutePath(file.canonical_path)) !== file.canonical_sha256 ||
      sha256(absolutePath(file.decision_path)) !== file.decision_sha256) {
      throw new Error(`Input files changed since planning: ${file.spell_id}.`);
    }
  }
  enrichRichTextSpells(manifest.spell_ids);
  assertSamePaths(changedPaths(["diff", "--name-only"]), expectedBatchPaths(manifest), "Apply");
}


function runPnpm(args: string[]): void {
  execFileSync("pnpm", args, { cwd: projectRoot, stdio: "inherit" });
}


export function verifyRichTextBatch(filename: string): void {
  const manifest = readManifest(filename);
  requireBaseCommit(manifest);
  assertSamePaths(changedPaths(["diff", "--name-only"]), expectedBatchPaths(manifest), "Verify");
  run("git", ["diff", "--check"]);
  runPnpm(["db:import"]);
  runPnpm(["verify"]);
  assertSamePaths(changedPaths(["diff", "--name-only"]), expectedBatchPaths(manifest), "Verify");
}


function requireSingleBatchCommit(manifest: RichTextBatchManifest): void {
  const commitRange = manifest.base_commit + "..HEAD";
  const commits = Number(run("git", ["rev-list", "--count", commitRange]));
  if (commits !== 1) throw new Error(`Expected one commit after planning; found ${commits}.`);
  assertSamePaths(
    changedPaths(["diff", "--name-only", commitRange]),
    expectedBatchPaths(manifest),
    "Committed batch",
  );
}


function richTextBatchCommitMessage(manifest: RichTextBatchManifest): string {
  const names = manifest.files.map((file) => {
    const record = JSON.parse(fs.readFileSync(absolutePath(file.canonical_path), "utf8")) as {
      name?: unknown;
    };
    if (typeof record.name !== "string" || !record.name) {
      throw new Error(`Canonical spell lacks a name: ${file.canonical_path}.`);
    }
    return record.name;
  });
  const firstSpellName = names[0];
  if (!firstSpellName) throw new Error("Manifest has no spell names.");
  return formatRichTextBatchCommitMessage(firstSpellName, manifest.batch_size);
}


export function commitRichTextBatch(filename: string): void {
  const manifest = readManifest(filename);
  requireBaseCommit(manifest);
  assertSamePaths(changedPaths(["diff", "--name-only"]), expectedBatchPaths(manifest), "Commit");
  run("git", ["add", "--", ...expectedBatchPaths(manifest)]);
  run("git", ["diff", "--cached", "--check"]);
  run("git", ["commit", "-m", richTextBatchCommitMessage(manifest)]);
  if (run("git", ["status", "--porcelain"])) {
    throw new Error("Working tree is not clean after committing the batch.");
  }
  requireSingleBatchCommit(manifest);
}


export function pushRichTextBatch(filename: string): void {
  const manifest = readManifest(filename);
  requireCleanWorkingTree();
  requireSingleBatchCommit(manifest);
  requireUpstreamAtBase(manifest);
  execFileSync("git", ["push"], { cwd: projectRoot, stdio: "inherit" });
}


function manifestArgument(args: string[]): string {
  const index = args.indexOf("--manifest");
  const value = index >= 0 ? args[index + 1] : args.find((argument) => argument.startsWith("--manifest="))?.slice(11);
  if (!value) throw new Error("--manifest <path> is required.");
  return path.resolve(value);
}


function batchSizeArgument(args: string[]): number {
  const index = args.indexOf("--size");
  const value = index >= 0 ? args[index + 1] : args.find((argument) => argument.startsWith("--size="))?.slice(7);
  if (value === undefined) return defaultBatchSize;
  const batchSize = Number(value);
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("--size must be a positive integer.");
  }
  return batchSize;
}


function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (command === "plan") {
    const { filename, manifest } = planRichTextBatch(batchSizeArgument(args));
    process.stdout.write(JSON.stringify({ manifest: filename, spell_ids: manifest.spell_ids }, null, 2) + "\n");
    return;
  }
  if (command === "run") {
    const { filename, manifest } = planRichTextBatch(batchSizeArgument(args));
    process.stdout.write(JSON.stringify({ manifest: filename, spell_ids: manifest.spell_ids }, null, 2) + "\n");
    applyRichTextBatch(filename);
    verifyRichTextBatch(filename);
    commitRichTextBatch(filename);
    pushRichTextBatch(filename);
    return;
  }
  const filename = manifestArgument(args);
  if (command === "apply") return applyRichTextBatch(filename);
  if (command === "verify") return verifyRichTextBatch(filename);
  if (command === "commit") return commitRichTextBatch(filename);
  if (command === "push") return pushRichTextBatch(filename);
  throw new Error("Usage: rich-text-workflow.ts <plan|run|apply|verify|commit|push> [--manifest <path>]");
}


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
