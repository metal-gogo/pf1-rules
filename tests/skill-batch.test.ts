import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import { standardSkills } from "../src/domain/skills.js";


afterEach(() => {
  vi.doUnmock("../src/config.js");
  vi.resetModules();
});

function capture(root: string, relative: string, url: string, body: string): void {
  const filename = path.join(root, "data", "raw", relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, body);
  fs.writeFileSync(`${filename}.meta.json`, JSON.stringify({
    url,
    retrieved_at: "2026-09-12T00:00:00.000Z",
    http_status: 200,
    content_sha256: createHash("sha256").update(body).digest("hex"),
    response_content_type: "text/html",
  }));
}

test("skill batches discover the 26 standard skills and replay byte-for-byte", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-skill-batch-"));
  vi.doMock("../src/config.js", () => ({ projectRoot: root }));
  try {
    fs.mkdirSync(path.join(root, "data", "entities"), { recursive: true });
    const rows = standardSkills.map(([id, name]) =>
      `<tr><td><a href="https://www.d20pfsrd.com/skills/${id.slice(6)}">${name}</a></td></tr>`
    ).join("");
    const catalog = `<div id="article-content"><h1>Skills</h1><p>General rules.</p><table><caption>Table: Skill Summary</caption>${rows}</table><h2>Acquiring Skills</h2><p>Gain ranks.</p></div>`;
    const detail = `<div id="article-content"><h1>Acrobatics (Dex; Armor Check Penalty)</h1><p>Move safely.</p><h2>Check</h2><table><caption>Table: DCs</caption><tr><th>Task</th><th>DC</th></tr><tr><td>Jump</td><td>10</td></tr></table><p>See <a href="https://www.d20pfsrd.com/skills/climb">Climb</a>.</p></div>`;
    const aonDetail = `<span id="MainContent_DataListTalentsAll_LabelName_0"><h1>Acrobatics (Dex; Armor Check Penalty)</h1><b>Source</b> Core Rulebook<br><br><b>Check</b>: Move safely.</span>`;
    capture(root, "catalogs/skills/d20pfsrd.html", "https://www.d20pfsrd.com/skills/", catalog);
    capture(root, "skills/acrobatics/d20pfsrd.html", "https://www.d20pfsrd.com/skills/acrobatics", detail);
    capture(root, "skills/acrobatics/aon.html", "https://www.aonprd.com/Skills.aspx?ItemName=Acrobatics", aonDetail);

    const { ingestSkillBatch } = await import("../src/ingestion/ingest-skill-batch.js");
    await ingestSkillBatch(1, true);
    const generalPath = path.join(root, "data/observations/skills/skills-general/d20pfsrd-0.1.0.json");
    const skillPath = path.join(root, "data/observations/skills/acrobatics/d20pfsrd-0.1.0.json");
    const aonPath = path.join(root, "data/observations/skills/acrobatics/aon-0.1.0.json");
    const before = [fs.readFileSync(generalPath, "utf8"), fs.readFileSync(skillPath, "utf8"), fs.readFileSync(aonPath, "utf8")];
    const skill = JSON.parse(before[1]!);
    expect(skill.entity_raw.key_ability_raw).toBe("Dex");
    expect(skill.entity_raw.trained_only_raw).toBe(false);
    expect(skill.entity_raw.armor_check_penalty_raw).toBe(true);
    expect(skill.entity_raw.document_raw.content.some((block: { node_type: string }) => block.node_type === "table")).toBe(true);
    expect(skill.entity_raw.document_raw.content.some((block: { content?: Array<{ node_type: string }> }) => block.content?.some((node) => node.node_type === "source_link"))).toBe(true);
    expect(skill.entity_raw.links_raw[0].target_entity_id_hint).toBe("skill.climb");
    await ingestSkillBatch(1, true);
    expect([fs.readFileSync(generalPath, "utf8"), fs.readFileSync(skillPath, "utf8"), fs.readFileSync(aonPath, "utf8")]).toEqual(before);
    const registry = JSON.parse(fs.readFileSync(path.join(root, "data/entities/skill-entities.json"), "utf8"));
    expect(registry.entities).toHaveLength(27);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pending skill batches retain their exact IDs", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-skill-selection-"));
  vi.doMock("../src/config.js", () => ({ projectRoot: root }));
  try {
    fs.mkdirSync(path.join(root, "data", "entities"), { recursive: true });
    const rows = standardSkills.map(([id, name]) => `<tr><td><a href="/skills/${id.slice(6)}">${name}</a></td></tr>`).join("");
    const catalog = `<div id="article-content"><h1>Skills</h1><p>Rules.</p><table><caption>Table: Skill Summary</caption>${rows}</table></div>`;
    capture(root, "catalogs/skills/d20pfsrd.html", "https://www.d20pfsrd.com/skills/", catalog);
    for (const [id, name] of standardSkills.slice(0, 2)) {
      capture(root, `skills/${id.slice(6)}/d20pfsrd.html`, `https://www.d20pfsrd.com/skills/${id.slice(6)}`, `<div id="article-content"><h1>${name} (Int; Trained Only)</h1><p>Rules.</p></div>`);
      capture(root, `skills/${id.slice(6)}/aon.html`, `https://www.aonprd.com/Skills.aspx?ItemName=${name}`, `<span id="MainContent_DataListTalentsAll_LabelName_0"><h1>${name} (Int; Trained Only)</h1><p>Rules.</p></span>`);
    }
    const batchFile = path.join(root, "pending.json");
    const { ingestSkillBatch } = await import("../src/ingestion/ingest-skill-batch.js");
    await ingestSkillBatch(2, true, batchFile);
    expect(JSON.parse(fs.readFileSync(batchFile, "utf8"))).toEqual(["skill.acrobatics", "skill.appraise"]);
    await expect(ingestSkillBatch(1, true, batchFile)).rejects.toThrow("original count");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
