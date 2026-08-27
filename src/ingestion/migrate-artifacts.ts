import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";
import type { ArtifactMetadata } from "./artifact-store.js";
import {
  artifactBodyPath,
  artifactHash,
  configuredArtifactRoot,
  writeArtifactBody,
  writeCapturedArtifact,
} from "./artifact-store.js";


interface ArtifactInventory {
  filename: string;
  bytes: number;
  hash: string;
  metadata: ArtifactMetadata | null;
}


function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  });
}


function inventory(rawRoot: string): {
  artifacts: ArtifactInventory[];
  hashMismatches: string[];
} {
  const artifacts: ArtifactInventory[] = [];
  const hashMismatches: string[] = [];
  for (const filename of filesUnder(rawRoot).filter((item) => !item.endsWith(".meta.json")).sort()) {
    const body = fs.readFileSync(filename);
    const hash = artifactHash(body);
    const metadataPath = `${filename}.meta.json`;
    const metadata = fs.existsSync(metadataPath)
      ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) as ArtifactMetadata
      : null;
    if (metadata && metadata.content_sha256 !== hash) {
      hashMismatches.push(path.relative(rawRoot, filename));
    }
    artifacts.push({ filename, bytes: body.byteLength, hash, metadata });
  }
  return { artifacts, hashMismatches };
}


function migrate(write: boolean): Record<string, unknown> {
  const rawRoot = path.join(projectRoot, "data", "raw");
  const destination = configuredArtifactRoot();
  const { artifacts, hashMismatches } = inventory(rawRoot);
  const uniqueBodies = new Map<string, number>();
  for (const artifact of artifacts) uniqueBodies.set(artifact.hash, artifact.bytes);

  let alreadyStoredBodies = 0;
  let alreadyStoredBytes = 0;
  for (const [hash, bytes] of uniqueBodies) {
    const storedPath = artifactBodyPath(hash);
    if (!fs.existsSync(storedPath)) continue;
    const storedHash = artifactHash(fs.readFileSync(storedPath));
    if (storedHash !== hash) throw new Error(`Stored artifact hash mismatch: ${storedPath}`);
    alreadyStoredBodies += 1;
    alreadyStoredBytes += bytes;
  }

  const totalBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
  const uniqueBytes = [...uniqueBodies.values()].reduce((sum, bytes) => sum + bytes, 0);
  const report = {
    mode: write ? "write" : "dry-run",
    source: rawRoot,
    destination,
    artifact_files: artifacts.length,
    artifact_bytes: totalBytes,
    unique_bodies: uniqueBodies.size,
    unique_bytes: uniqueBytes,
    duplicate_files: artifacts.length - uniqueBodies.size,
    duplicate_bytes: totalBytes - uniqueBytes,
    capture_metadata_files: artifacts.filter((artifact) => artifact.metadata).length,
    artifacts_without_capture_metadata: artifacts.filter((artifact) => !artifact.metadata).length,
    hash_mismatches: hashMismatches,
    already_stored_bodies: alreadyStoredBodies,
    already_stored_bytes: alreadyStoredBytes,
    bodies_to_copy: uniqueBodies.size - alreadyStoredBodies,
    bytes_to_copy: uniqueBytes - alreadyStoredBytes,
  };
  if (hashMismatches.length > 0) return report;

  if (write) {
    for (const artifact of artifacts) {
      const body = fs.readFileSync(artifact.filename);
      if (artifact.metadata) {
        writeCapturedArtifact(artifact.filename, body, artifact.metadata);
      } else {
        writeArtifactBody(body);
      }
    }
  }
  return report;
}


const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--write")) {
  throw new Error("Usage: pnpm artifacts:migrate [--write]");
}
const report = migrate(arguments_.includes("--write"));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if ((report.hash_mismatches as string[]).length > 0) process.exitCode = 1;
