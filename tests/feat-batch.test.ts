import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";

test("batch IDs use artifact hashes and next batches skip observations and replay unchanged", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-feat-batch-"));
  vi.doMock("../src/config.js", () => ({ projectRoot: root }));
  try {
    const { ingestAonFeatBatch } = await import("../src/ingestion/ingest-feat-batch.js");
    fs.mkdirSync(path.join(root, "data/entities"), { recursive: true });
    const captures: Array<[string, string]> = [
      ["catalogs/feats/aon-all.html", '<table id="MainContent_GridView6"><tr><td><a href="FeatDisplay.aspx?ItemName=Example">Example</a></td></tr><tr><td><a href="FeatDisplay.aspx?ItemName=Second">Second</a></td></tr><tr><td><a href="FeatDisplay.aspx?ItemName=Third">Third</a></td></tr></table>'],
      ["feats/batch/example/aon.html", '<span id="MainContent_DataListTypes_LabelName_0"><h1>Example</h1><b>Source</b> Book<br><b>Benefit</b> Text.</span>'],
    ];
    for (const name of ["Second", "Third"]) {
      captures.push([`feats/batch/${name.toLowerCase()}/aon.html`, `<span id="MainContent_DataListTypes_LabelName_0"><h1>${name}</h1><b>Source</b> Book<br><b>Benefit</b> Text.</span>`]);
    }
    for (const [relative, body] of captures) {
      const filename = path.join(root, "data/raw", relative!);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, body!);
      fs.writeFileSync(filename + ".meta.json", JSON.stringify({
        url: "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Example",
        retrieved_at: "2026-09-08T00:00:00.000Z",
        http_status: 200,
        content_sha256: createHash("sha256").update(body!).digest("hex"),
        response_content_type: "text/html",
      }));
    }
    await ingestAonFeatBatch(1, true);
    const filename = path.join(root, "data/observations/feats/example/aon-batch-0.1.0.json");
    const before = fs.readFileSync(filename, "utf8");
    const observation = JSON.parse(before);
    const hash = createHash("sha256").update(captures[1]![1]!).digest("hex");
    expect(observation.observation_id).toBe(`aon:feat.example:${hash.slice(0, 8)}`);
    await ingestAonFeatBatch(1, true);
    expect(fs.readFileSync(filename, "utf8")).toBe(before);
    fs.writeFileSync(path.join(root, "data/entities/linked.json"), JSON.stringify({
      entities: [{ entity_id: "feat.second" }],
    }));
    const batchFile = path.join(root, "pending.json");
    await ingestAonFeatBatch(2, true, batchFile);
    expect(JSON.parse(fs.readFileSync(batchFile, "utf8"))).toEqual(["Second", "Third"]);
    const second = path.join(root, "data/observations/feats/second/aon-batch-0.1.0.json");
    const third = path.join(root, "data/observations/feats/third/aon-batch-0.1.0.json");
    const batchBefore = [second, third].map((file) => fs.readFileSync(file, "utf8"));
    await ingestAonFeatBatch(2, true, batchFile);
    expect([second, third].map((file) => fs.readFileSync(file, "utf8"))).toEqual(batchBefore);
    expect(fs.readFileSync(filename, "utf8")).toBe(before);
    await expect(ingestAonFeatBatch(1, true, batchFile)).rejects.toThrow("original count");
    fs.unlinkSync(batchFile);
    await expect(ingestAonFeatBatch(1, true, batchFile)).rejects.toThrow("Only 0");
    expect(fs.existsSync(batchFile)).toBe(false);
    fs.unlinkSync(second);
    await ingestAonFeatBatch(1, true, batchFile);
    expect(JSON.parse(fs.readFileSync(batchFile, "utf8"))).toEqual(["Second"]);
    fs.writeFileSync(batchFile, JSON.stringify(["Unknown"]));
    await expect(ingestAonFeatBatch(1, true, batchFile)).rejects.toThrow("unknown AoN ItemName");

  } finally {
    vi.doUnmock("../src/config.js");
    vi.resetModules();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
