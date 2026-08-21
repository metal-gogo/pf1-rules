import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { projectRoot } from "../config.js";


export interface ReferenceNormalizationInput {
  observationId: string;
  sourceUrl: string;
  artifactName: string;
  originalRepresentation: Uint8Array;
  originalSha256: string;
}


export interface ReferenceNormalizationView {
  providerId: string;
  content: string;
  metadata: Record<string, unknown>;
}


export interface ReferenceNormalizationProvider {
  readonly id: string;
  normalize(input: ReferenceNormalizationInput): Promise<ReferenceNormalizationView>;
}


export interface CorpusCase {
  id: string;
  observationPath: string;
  challenge: string;
  contaminationProbes?: string[];
}


interface SourceReference {
  anchor_text_raw: string;
  href_raw: string | null;
}


interface SourceObservation {
  observation_id: string;
  source: { url: string; site_id: string };
  retrieval: { content_sha256: string; raw_artifact_path: string };
  page: { source_notice_raw?: string | null };
  spell_raw: {
    name_raw: string;
    school_raw?: string | null;
    levels_raw?: string | null;
    casting_time_raw?: string | null;
    components_raw?: string | null;
    range_raw?: string | null;
    delivery_fields_raw?: Array<{ label_raw: string; value_raw: string | null }>;
    duration_raw?: string | null;
    saving_throw_raw?: string | null;
    spell_resistance_raw?: string | null;
    description_raw: string;
    references_raw?: SourceReference[];
  };
}


export interface CaseEvaluation {
  id: string;
  challenge: string;
  observation_id: string;
  site_id: string;
  source_url: string;
  original_artifact_path: string;
  original_sha256: string;
  original_sha256_verified: true;
  normalized_sha256: string;
  provider_id: string;
  provider_metadata: Record<string, unknown>;
  normalized_characters: number;
  evidence_characters: number;
  expansion_ratio: number;
  field_checks: { retained: number; expected: number; ratio: number };
  description_retained: boolean;
  reference_checks: { retained: number; expected: number; ratio: number };
  contamination: string[];
}


export interface EvaluationReport {
  evaluated_at: string;
  provider_id: string;
  authority_policy: {
    canonical_source_authoritative: true;
    original_representation_authoritative: true;
    normalized_view_is_derived_and_disposable: true;
  };
  cases: CaseEvaluation[];
  adoption_gates: {
    artifact_hashes_verified: boolean;
    all_descriptions_retained: boolean;
    all_fields_retained: boolean;
    all_references_retained: boolean;
    no_boundary_contamination: boolean;
    provider_version_recorded: boolean;
  };
  recommendation: "adopt" | "do_not_adopt";
}


function sha256(value: Uint8Array | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}


function foldEvidence(value: string): string {
  return (value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? []).join("");
}


function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}


function normalizedUrl(value: string, baseUrl: string): string | null {
  const unwrapped = value.replace(/^<|>$/g, "").replaceAll("\\(", "(").replaceAll("\\)", ")");
  try {
    const url = new URL(unwrapped, baseUrl);
    url.hash = decodeURIComponent(url.hash);
    return url.toString();
  } catch {
    return null;
  }
}


function markdownDestinations(markdown: string, baseUrl: string): Set<string> {
  const destinations = new Set<string>();
  for (const match of markdown.matchAll(/\]\((<[^>\n]+>|(?:\\.|[^)\n])+)\)/g)) {
    const destination = match[1];
    if (!destination) continue;
    const normalized = normalizedUrl(destination, baseUrl);
    if (normalized) destinations.add(normalized);
  }
  return destinations;
}


function evidenceFields(observation: SourceObservation): string[] {
  const spell = observation.spell_raw;
  return [
    spell.name_raw,
    observation.page.source_notice_raw,
    spell.school_raw,
    spell.levels_raw,
    spell.casting_time_raw,
    spell.components_raw,
    spell.range_raw,
    ...(spell.delivery_fields_raw ?? []).flatMap((field) => [field.label_raw, field.value_raw]),
    spell.duration_raw,
    spell.saving_throw_raw,
    spell.spell_resistance_raw,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}


export function evaluateNormalizedView(
  corpusCase: CorpusCase,
  observation: SourceObservation,
  artifactPath: string,
  view: ReferenceNormalizationView,
): CaseEvaluation {
  const foldedMarkdown = foldEvidence(view.content);
  const fields = evidenceFields(observation);
  const retainedFields = fields.filter((field) => foldedMarkdown.includes(foldEvidence(field))).length;
  const references = (observation.spell_raw.references_raw ?? []).filter(
    (reference): reference is SourceReference & { href_raw: string } => Boolean(reference.href_raw),
  );
  const destinations = markdownDestinations(view.content, observation.source.url);
  const retainedReferences = references.filter((reference) => {
    const expected = normalizedUrl(reference.href_raw, observation.source.url);
    return expected !== null && destinations.has(expected);
  }).length;
  const evidenceCharacters = fields.join("\n").length + observation.spell_raw.description_raw.length;
  return {
    id: corpusCase.id,
    challenge: corpusCase.challenge,
    observation_id: observation.observation_id,
    site_id: observation.source.site_id,
    source_url: observation.source.url,
    original_artifact_path: path.relative(projectRoot, artifactPath),
    original_sha256: observation.retrieval.content_sha256,
    original_sha256_verified: true,
    normalized_sha256: sha256(view.content),
    provider_id: view.providerId,
    provider_metadata: view.metadata,
    normalized_characters: view.content.length,
    evidence_characters: evidenceCharacters,
    expansion_ratio: ratio(view.content.length, evidenceCharacters),
    field_checks: { retained: retainedFields, expected: fields.length, ratio: ratio(retainedFields, fields.length) },
    description_retained: foldedMarkdown.includes(foldEvidence(observation.spell_raw.description_raw)),
    reference_checks: {
      retained: retainedReferences,
      expected: references.length,
      ratio: ratio(retainedReferences, references.length),
    },
    contamination: (corpusCase.contaminationProbes ?? []).filter((probe) => foldedMarkdown.includes(foldEvidence(probe))),
  };
}


export async function evaluateCorpus(
  corpus: CorpusCase[],
  provider: ReferenceNormalizationProvider,
): Promise<EvaluationReport> {
  const cases: CaseEvaluation[] = [];
  for (const corpusCase of corpus) {
    const observationPath = path.resolve(projectRoot, corpusCase.observationPath);
    const observation = JSON.parse(fs.readFileSync(observationPath, "utf8")) as SourceObservation;
    const artifactPath = path.resolve(path.dirname(observationPath), observation.retrieval.raw_artifact_path);
    const originalRepresentation = fs.readFileSync(artifactPath);
    const actualHash = sha256(originalRepresentation);
    if (actualHash !== observation.retrieval.content_sha256) {
      throw new Error(
        `${corpusCase.id} original artifact hash mismatch: expected ${observation.retrieval.content_sha256}, received ${actualHash}`,
      );
    }
    const view = await provider.normalize({
      observationId: observation.observation_id,
      sourceUrl: observation.source.url,
      artifactName: path.basename(artifactPath),
      originalRepresentation,
      originalSha256: actualHash,
    });
    cases.push(evaluateNormalizedView(corpusCase, observation, artifactPath, view));
  }
  const adoptionGates = {
    artifact_hashes_verified: cases.every((item) => item.original_sha256_verified),
    all_descriptions_retained: cases.every((item) => item.description_retained),
    all_fields_retained: cases.every((item) => item.field_checks.ratio === 1),
    all_references_retained: cases.every((item) => item.reference_checks.ratio === 1),
    no_boundary_contamination: cases.every((item) => item.contamination.length === 0),
    provider_version_recorded: cases.every((item) => typeof item.provider_metadata.version === "string"),
  };
  return {
    evaluated_at: new Date().toISOString(),
    provider_id: provider.id,
    authority_policy: {
      canonical_source_authoritative: true,
      original_representation_authoritative: true,
      normalized_view_is_derived_and_disposable: true,
    },
    cases,
    adoption_gates: adoptionGates,
    recommendation: Object.values(adoptionGates).every(Boolean) ? "adopt" : "do_not_adopt",
  };
}


export class MarkdownNewProvider implements ReferenceNormalizationProvider {
  readonly id = "markdown.new-upload-v1";

  constructor(
    private readonly endpoint = "https://markdown.new/convert",
    private readonly request: typeof fetch = fetch,
  ) {}

  async normalize(input: ReferenceNormalizationInput): Promise<ReferenceNormalizationView> {
    const body = new FormData();
    const bytes = Uint8Array.from(input.originalRepresentation).buffer;
    body.append("file", new Blob([bytes], { type: "text/html" }), input.artifactName);
    const response = await this.request(this.endpoint, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`markdown.new returned HTTP ${response.status}`);
    const payload = await response.json() as {
      success?: boolean;
      data?: { content?: string; [key: string]: unknown };
      error?: unknown;
    };
    if (payload.success !== true || typeof payload.data?.content !== "string") {
      throw new Error(`markdown.new conversion failed: ${JSON.stringify(payload.error ?? payload)}`);
    }
    const { content, ...metadata } = payload.data;
    return { providerId: this.id, content, metadata };
  }
}


async function main(): Promise<void> {
  if (process.env.PF1_ALLOW_EXTERNAL_NORMALIZER !== "1") {
    throw new Error("Set PF1_ALLOW_EXTERNAL_NORMALIZER=1 to upload captured public HTML snapshots to markdown.new.");
  }
  const corpusPath = path.join(projectRoot, "fixtures", "markdown-new-corpus.json");
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8")) as CorpusCase[];
  const report = await evaluateCorpus(corpus, new MarkdownNewProvider());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}


if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
