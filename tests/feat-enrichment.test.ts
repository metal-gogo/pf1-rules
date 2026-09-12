import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, vi } from "vitest";


test("feat enrichment reuses entities and relationships and is idempotent", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-feat-enrichment-"));
  vi.doMock("../src/config.js", () => ({ projectRoot: root }));
  try {
    const entities = path.join(root, "data/entities");
    const observations = path.join(root, "data/observations/feats/example");
    fs.mkdirSync(entities, { recursive: true });
    fs.mkdirSync(observations, { recursive: true });
    fs.writeFileSync(path.join(entities, "entities.json"), JSON.stringify({
      registry_id: "entities",
      entities: [
        { entity_id: "feat.example", entity_type: "feat", name: "Example", evidence: [], relationships: [] },
        { entity_id: "feat.target", entity_type: "feat", name: "Target", evidence: [{ source_href: "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Target" }] },
      ],
    }));
    fs.writeFileSync(path.join(observations, "aon.json"), JSON.stringify({
      observation_id: "aon:feat.example:12345678",
      entity_type: "feat",
      source: { url: "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Example" },
      entity_raw: { links_raw: [
        { href_resolved: "https://www.aonprd.com/FeatDisplay.aspx?ItemName=Target", anchor_text_raw: "Target", role_hint: "prerequisite" },
        { href_resolved: "https://www.aonprd.com/Rules.aspx?Name=Missing", anchor_text_raw: "Missing rule", role_hint: "cross_reference" },
      ] },
    }));

    const { enrichFeatRegistries } = await import("../src/ingestion/enrich-feats.js");
    expect(enrichFeatRegistries(true)).toEqual({
      entitiesAdded: 1,
      relationshipsAdded: 2,
      evidenceAdded: 2,
      filesChanged: 2,
    });
    expect(enrichFeatRegistries(true)).toEqual({
      entitiesAdded: 0,
      relationshipsAdded: 0,
      evidenceAdded: 0,
      filesChanged: 0,
    });
    const registry = JSON.parse(fs.readFileSync(path.join(entities, "entities.json"), "utf8"));
    expect(registry.entities[0].relationships.map((relationship: any) => relationship.target.entity_id))
      .toContain("feat.target");
    const generated = JSON.parse(fs.readFileSync(path.join(entities, "feat-source-link-entities.json"), "utf8"));
    expect(generated.entities).toHaveLength(1);
  } finally {
    vi.doUnmock("../src/config.js");
    vi.resetModules();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
