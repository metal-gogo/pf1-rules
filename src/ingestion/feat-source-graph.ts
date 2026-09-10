import { createHash } from "node:crypto";
import { observationEntityId, type ValidatedJson } from "../domain/json.js";

export function sourceUrlKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = "https:";
    url.hostname = url.hostname.replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/$/, "");
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

export function buildFeatSourceGraph(observations: ValidatedJson[], entities: ValidatedJson[]) {
  const byId = new Map(entities.map((entity) => [entity.entity_id, entity]));
  const byUrl = new Map<string, Set<string>>();
  const register = (url: string | null, id: string) => {
    const key = url ? sourceUrlKey(url) : null;
    if (!key || !byId.has(id)) return;
    if (!byUrl.has(key)) byUrl.set(key, new Set());
    byUrl.get(key)!.add(id);
  };
  for (const entity of entities) {
    for (const evidence of entity.evidence) register(evidence.source_href, entity.entity_id);
  }
  for (const observation of observations) {
    register(observation.source.url, observationEntityId(observation.observation_id));
    for (const link of (observation.spell_raw ?? observation.entity_raw).links_raw ?? []) {
      if (link.target_entity_id_hint) register(link.href_resolved, link.target_entity_id_hint);
    }
  }
  const nodes: ValidatedJson[] = [];
  const targets = new Map<string, string>();
  const relationships = new Map<string, { owner: string; record: ValidatedJson }>();
  for (const observation of observations.filter((item) => item.entity_type === "feat")) {
    const owner = observationEntityId(observation.observation_id);
    for (const [index, link] of (observation.entity_raw.links_raw ?? []).entries()) {
      if (link.role_hint === "publication") continue;
      const key = sourceUrlKey(link.href_resolved);
      if (!key) continue;
      let targetId = byId.has(link.target_entity_id_hint) ? link.target_entity_id_hint as string : null;
      const candidates = byUrl.get(key);
      if (!targetId && candidates?.size === 1) targetId = [...candidates][0]!;
      if (!targetId && candidates?.size) continue;
      if (!targetId) {
        const url = new URL(key);
        if (!["aonprd.com", "d20pfsrd.com"].includes(url.hostname) || !link.anchor_text_raw.trim()) continue;
        const type = /FeatDisplay\.aspx$/i.test(url.pathname) || url.pathname.startsWith("/feats/") ? "feat"
          : /SpellDisplay\.aspx$/i.test(url.pathname) || url.pathname.startsWith("/magic/all-spells/") ? "spell" : "rule";
        targetId = `${type}.source-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
        if (!byId.has(targetId)) {
          const node = { entity_id: targetId, entity_type: type, name: link.anchor_text_raw, status: "stub",
            aliases: [], evidence: [], notes: [`Unresolved source URL: ${key}. No cross-source identity inferred from its display name.`] };
          nodes.push(node); byId.set(targetId, node);
        }
        register(key, targetId);
      }
      targets.set(`${observation.observation_id}:${index}`, targetId);
      if (targetId === owner) continue;
      const id = `${owner}:references:${targetId}`;
      if (!relationships.has(id)) relationships.set(id, { owner, record: {
        relationship_id: id, type: "references", target: {
          entity_type: byId.get(targetId)!.entity_type, entity_id: targetId, name: byId.get(targetId)!.name,
        }, status: "accepted", evidence: [], note: "Source hyperlinks only; prerequisite logic is not inferred.",
      } });
      relationships.get(id)!.record.evidence.push({
        observation_id: observation.observation_id, source_field: `entity_raw.links_raw[${index}]`,
        evidence_kind: "hyperlink", anchor_text_raw: link.anchor_text_raw, source_href: link.href_resolved,
      });
    }
  }
  return { nodes, targets, relationships: [...relationships.values()] };
}
