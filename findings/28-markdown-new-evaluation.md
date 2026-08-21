# `markdown.new` normalization evaluation

`markdown.new` was evaluated on 2026-08-21 as a possible pluggable,
non-authoritative normalization layer for source-reference checking. It was not
adopted.

## Authority boundary

The experiment preserves the existing evidence model:

1. The canonical source URL identifies the source.
2. The captured original representation and its recorded SHA-256 hash are the
   authoritative retrieval evidence.
3. The source-specific bounded observation remains authoritative for literal
   fields, links, and entry ownership.
4. Converted Markdown is a derived, disposable view. It cannot update an
   observation or canonical record.

URL conversion was rejected as the evaluation path because it would make a new
live retrieval that could not be proven equivalent to the captured artifact.
The test harness instead verifies the captured artifact hash and uploads those
exact public HTML bytes through the documented `/convert` endpoint. External
upload is disabled unless `PF1_ALLOW_EXTERNAL_NORMALIZER=1` is set.

## Difficult corpus

The 12-case fixture at [`fixtures/markdown-new-corpus.json`](../fixtures/markdown-new-corpus.json)
covers all three source layouts and deliberately stresses:

- AoN and d20PFSRD pages containing multiple spell entries;
- Legacy PRD fragment-addressed entries;
- shared numbered and lesser/greater family pages;
- 9,000-character descriptions;
- tables and multiple delivery fields; and
- reference-dense entries, including Permanency with 86 recorded references.

Every case points to a versioned observation, which in turn points to the
original captured artifact and hash. The corpus does not copy source wording
into a new authority.

## Result

The exact-snapshot upload pipeline returned HTTP success for all 12 cases. The
strict comparison produced:

| Check | Result |
| --- | ---: |
| Captured artifact hashes verified before conversion | 12 / 12 |
| Complete bounded descriptions retained | 4 / 12 |
| Raw field values retained | 121 / 135 |
| Recorded reference destinations retained | 157 / 157 |
| Grouped-page boundary probes clean | 0 / 2 |
| Provider/version identifier returned | 0 / 12 |
| Byte-identical result on an immediate second full run | 12 / 12 |

The normalized output was between 2.37 and 34.04 times the size of the bounded
spell evidence, with a median of 7.17 times. The two grouped Air Walk cases both
included the base spell when the requested observation was Air Walk, Communal.
Several long, tabular, fragment-addressed, and numbered-family cases failed the
complete-description check even after case-folding, Unicode normalization, and
ignoring punctuation and whitespace.

The link result is useful but insufficient. It shows that the converter can
provide a convenient secondary view over already-known links. It does not
establish entry ownership, and the same full-page behavior that retained links
also admitted sibling-entry and navigation links. Raw anchors and raw/resolved
URLs therefore must continue to come from the bounded source adapter.

The service documentation also describes a fallback pipeline whose method can
change between native Markdown, Workers AI, and browser rendering, documents a
500-request daily limit, and warns that very large pages may be truncated. The
upload response identified only a generic `markdown` format and supplied no
converter or model version. That is not enough metadata to reproduce a derived
normalization later.

## Decision

Do not adopt `markdown.new` in ingestion, validation, canonicalization, CI, or
runtime source checking.

The experiment remains isolated behind
[`ReferenceNormalizationProvider`](../src/experiments/markdown-new-evaluation.ts)
so another implementation can be measured without changing evidence. A future
candidate should be reconsidered only if it:

- consumes the verified captured artifact or an explicitly recorded bounded
  derivative rather than refetching the URL;
- cannot write source observations or canonical records;
- returns a pin-able implementation/model version;
- retains every expected raw field, complete description, reference anchor,
  and destination on this corpus;
- rejects sibling and navigation content; and
- can run reproducibly without an unversioned remote dependency.

## Reproduction

The default tests use an in-memory provider and perform no network requests.
The live experiment is explicit:

```bash
PF1_ALLOW_EXTERNAL_NORMALIZER=1 pnpm evaluate:markdown-new > /tmp/markdown-new-report.json
```

The JSON report contains source observation IDs, original and derived hashes,
provider metadata, and aggregate checks. It deliberately omits the converted
source text.
