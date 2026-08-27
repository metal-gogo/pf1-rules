import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { projectRoot } from "../src/config.js";
import {
  artifactHash,
  readCapturedArtifact,
  resolveArtifactPath,
  writeCapturedArtifact,
} from "../src/ingestion/artifact-store.js";


describe.sequential("artifact store", () => {
  const previousRoot = process.env.PF1_ARTIFACT_ROOT;
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-artifacts-"));
  const body = "same captured response";
  const contentHash = artifactHash(body);
  const firstLogicalPath = path.join(projectRoot, "data", "raw", "test", "first.html");
  const secondLogicalPath = path.join(projectRoot, "data", "raw", "test", "second.html");

  beforeAll(() => {
    process.env.PF1_ARTIFACT_ROOT = storeRoot;
  });

  afterAll(() => {
    if (previousRoot === undefined) delete process.env.PF1_ARTIFACT_ROOT;
    else process.env.PF1_ARTIFACT_ROOT = previousRoot;
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it("stores identical captures once and preserves both retrieval records", () => {
    for (const [logicalPath, url] of [
      [firstLogicalPath, "https://example.test/first"],
      [secondLogicalPath, "https://example.test/second"],
    ] as const) {
      writeCapturedArtifact(logicalPath, body, {
        url,
        content_sha256: contentHash,
      });
    }

    const storedBodies = fs.readdirSync(path.join(storeRoot, "sha256", contentHash.slice(0, 2), contentHash.slice(2, 4)));
    expect(storedBodies).toEqual([contentHash]);
    expect(readCapturedArtifact(firstLogicalPath)?.body).toBe(body);
    expect(readCapturedArtifact(secondLogicalPath)?.body).toBe(body);

    const recordPath = path.join(projectRoot, "data", "observations", "test", "aon.json");
    expect(resolveArtifactPath(recordPath, "../../raw/test/first.html", contentHash)).toBe(
      path.join(storeRoot, "sha256", contentHash.slice(0, 2), contentHash.slice(2, 4), contentHash),
    );
  });
});
