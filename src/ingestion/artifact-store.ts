import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { projectRoot } from "../config.js";


export interface ArtifactMetadata {
  content_sha256: string;
}


const projectRawRoot = path.join(projectRoot, "data", "raw");


export function artifactHash(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}


function artifactRoot(): string | null {
  const configured = process.env.PF1_ARTIFACT_ROOT?.trim();
  return configured ? path.resolve(configured) : null;
}


export function configuredArtifactRoot(): string {
  const root = artifactRoot();
  if (!root) throw new Error("PF1_ARTIFACT_ROOT is not configured");
  return root;
}


function captureKey(logicalPath: string): string {
  const relative = path.relative(projectRawRoot, logicalPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact capture path is outside ${projectRawRoot}: ${logicalPath}`);
  }
  return relative;
}


function storedBodyPath(root: string, hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`Invalid SHA-256 artifact hash: ${hash}`);
  }
  return path.join(root, "sha256", hash.slice(0, 2), hash.slice(2, 4), hash);
}


export function artifactBodyPath(hash: string): string {
  return storedBodyPath(configuredArtifactRoot(), hash);
}


function storedMetadataPath(root: string, logicalPath: string): string {
  return path.join(root, "captures", `${captureKey(logicalPath)}.meta.json`);
}


function readMetadata<T extends ArtifactMetadata>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}


function assertHash(body: Buffer, metadata: ArtifactMetadata, filename: string): void {
  const actual = artifactHash(body);
  if (actual !== metadata.content_sha256) {
    throw new Error(
      `Cached artifact hash mismatch: ${filename}; expected ${metadata.content_sha256}, got ${actual}`,
    );
  }
}


export function readCapturedArtifact<T extends ArtifactMetadata = ArtifactMetadata>(
  logicalPath: string,
): { body: string; metadata: T } | null {
  const legacyMetadataPath = `${logicalPath}.meta.json`;
  const hasLegacyBody = fs.existsSync(logicalPath);
  const hasLegacyMetadata = fs.existsSync(legacyMetadataPath);
  if (hasLegacyBody || hasLegacyMetadata) {
    if (!hasLegacyBody || !hasLegacyMetadata) {
      throw new Error(`Incomplete cached capture pair for ${logicalPath}`);
    }
    const body = fs.readFileSync(logicalPath);
    const metadata = readMetadata<T>(legacyMetadataPath);
    assertHash(body, metadata, logicalPath);
    return { body: body.toString("utf8"), metadata };
  }

  const root = artifactRoot();
  if (!root) return null;
  const metadataPath = storedMetadataPath(root, logicalPath);
  if (!fs.existsSync(metadataPath)) return null;
  const metadata = readMetadata<T>(metadataPath);
  const bodyPath = storedBodyPath(root, metadata.content_sha256);
  if (!fs.existsSync(bodyPath)) {
    throw new Error(`Cached artifact body is missing: ${bodyPath}`);
  }
  const body = fs.readFileSync(bodyPath);
  assertHash(body, metadata, bodyPath);
  return { body: body.toString("utf8"), metadata };
}


export function capturedArtifactExists(logicalPath: string): boolean {
  return readCapturedArtifact(logicalPath) !== null;
}


export function writeCapturedArtifact<T extends ArtifactMetadata>(
  logicalPath: string,
  body: string | Buffer,
  metadata: T,
): void {
  if (artifactHash(body) !== metadata.content_sha256) {
    throw new Error(`Artifact metadata hash does not match the body for ${logicalPath}`);
  }

  const root = artifactRoot();
  if (!root) {
    fs.mkdirSync(path.dirname(logicalPath), { recursive: true });
    fs.writeFileSync(logicalPath, body, { encoding: "utf8", flag: "wx" });
    fs.writeFileSync(
      `${logicalPath}.meta.json`,
      `${JSON.stringify(metadata, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return;
  }

  writeArtifactBody(body);

  const metadataPath = storedMetadataPath(root, logicalPath);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  const serializedMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
  if (fs.existsSync(metadataPath)) {
    if (fs.readFileSync(metadataPath, "utf8") !== serializedMetadata) {
      throw new Error(`Refusing to overwrite differing capture metadata ${metadataPath}`);
    }
  } else {
    fs.writeFileSync(metadataPath, serializedMetadata, { encoding: "utf8", flag: "wx" });
  }
}


export function writeArtifactBody(body: string | Buffer): { path: string; created: boolean } {
  const hash = artifactHash(body);
  const bodyPath = artifactBodyPath(hash);
  fs.mkdirSync(path.dirname(bodyPath), { recursive: true });
  if (fs.existsSync(bodyPath)) {
    assertHash(fs.readFileSync(bodyPath), { content_sha256: hash }, bodyPath);
    return { path: bodyPath, created: false };
  }
  fs.writeFileSync(bodyPath, body, { encoding: "utf8", flag: "wx" });
  return { path: bodyPath, created: true };
}


export function resolveArtifactPath(
  recordPath: string,
  rawArtifactPath: string,
  expectedHash: string,
): string {
  const legacyPath = path.resolve(path.dirname(recordPath), rawArtifactPath);
  if (fs.existsSync(legacyPath)) return legacyPath;
  const root = artifactRoot();
  return root ? storedBodyPath(root, expectedHash) : legacyPath;
}
