# Source Comparison Rubric

Score each source from 0 to 4 for every criterion. The weighted score helps summarize the experiment, but the mandatory gates decide whether a source can be used as a primary source.

## Scale

| Score | Meaning |
|---:|---|
| 0 | Unusable or absent |
| 1 | Major failures; extensive manual correction required |
| 2 | Mixed; meaningful gaps or exceptions |
| 3 | Good; small and manageable exceptions |
| 4 | Excellent; consistent and audit-ready |

## Criteria

| Criterion | Weight | Evidence to collect |
|---|---:|---|
| Rules-text fidelity | 25% | Material differences, omissions, silent edits, and agreement with manually verified published text |
| Coverage | 15% | Missing spells, missing sections, incomplete tables, and unsupported page types |
| Publication provenance | 15% | Book, page, publisher, first-party status, FAQ, and errata references |
| Extraction consistency | 10% | Selector exceptions, ambiguous headings, URL predictability, and parse-failure rate |
| First/third-party scope control | 10% | Publisher labels, third-party leakage, and distinction between original and later first-party spell lists |
| FAQ and errata currency | 10% | Whether corrections are present, visible, dated, and traceable |
| Content separation | 5% | Ads, navigation, artwork, comments, discussion links, and mythic text entering base rules data |
| Snapshot and parser stability | 5% | Repeatability across archived pages and resilience to harmless markup changes |
| Licensing and attribution clarity | 5% | Detectable notices and sufficient metadata for a later distribution review |

Weighted score formula:

```text
weighted score = sum((criterion score / 4) * criterion weight)
```

The result is a percentage from 0 to 100.

## Mandatory gates

A primary source candidate fails regardless of its weighted score if any of these conditions is true:

- Unexplained third-party material enters the first-party corpus.
- Rules text is silently rewritten or summarized.
- Raw snapshots or original URLs are not retained.
- Parser failures can silently produce incomplete records.
- Material canonical fields cannot be traced to source observations.

## Difference classifications

| Classification | Meaning | Example treatment |
|---|---|---|
| Exact match | Same meaningful content | Accept without review |
| Formatting only | Whitespace, punctuation, capitalization, or markup | Normalize but preserve raw values |
| Semantically equivalent | Wording differs without changing the rule | Flag for one-time human confirmation |
| Scope expansion | A later first-party class, domain, or other valid list is added | Preserve with explicit scope metadata |
| Missing in source | One source omits a field or record | Measure as coverage/provenance loss |
| Material conflict | The rule, number, qualifier, or outcome differs | Require human resolution |
| Parse failure | Page contains data that the adapter failed to capture | Fix adapter; never resolve as missing data |
| Not applicable | The source intentionally does not carry the field | Exclude from conflict counts but include in capability notes |
| Needs review | Difference cannot yet be classified safely | Do not create a validated canonical record |

## Per-source scorecard

Create one copy of this table for each source after the 22-spell run:

| Criterion | Score 0–4 | Weighted points | Evidence and exceptions |
|---|---:|---:|---|
| Rules-text fidelity |  |  |  |
| Coverage |  |  |  |
| Publication provenance |  |  |  |
| Extraction consistency |  |  |  |
| First/third-party scope control |  |  |  |
| FAQ and errata currency |  |  |  |
| Content separation |  |  |  |
| Snapshot and parser stability |  |  |  |
| Licensing and attribution clarity |  |  |  |
| **Total** |  | **/100** |  |

## Decision report

The final report should answer these questions:

1. Which source should define the default canonical spell record?
2. Which source should serve as the independent baseline?
3. Which fields, if any, need a different preferred source?
4. How are later first-party spell-list additions represented?
5. How are FAQ and errata changes represented without erasing original text?
6. Which conflicts require book or PDF verification?
7. What conditions would trigger a future re-import?
