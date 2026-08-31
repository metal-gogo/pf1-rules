import * as cheerio from "cheerio";

import type { ValidatedJson } from "./json.js";


export type RichTextMark = "bold" | "italic" | "superscript";

export interface RichTextTextNode {
  node_type: "text";
  value: string;
  marks?: RichTextMark[];
}

export interface RichTextEntityLinkNode {
  node_type: "entity_link";
  value: string;
  relationship_id: string;
  marks?: RichTextMark[];
}

export interface RichTextCitationNode {
  node_type: "citation";
  value: string;
  publication_id: string;
  publication_name: string;
}

export interface RichTextHardBreakNode {
  node_type: "hard_break";
}

export type RichTextInlineNode =
  | RichTextTextNode
  | RichTextEntityLinkNode
  | RichTextCitationNode
  | RichTextHardBreakNode;

export interface RichTextParagraphNode {
  node_type: "paragraph";
  content: RichTextInlineNode[];
}

export interface RichTextListItemNode {
  node_type: "list_item";
  content: RichTextInlineNode[];
}

export interface RichTextUnorderedListNode {
  node_type: "unordered_list";
  content: RichTextListItemNode[];
}

export interface RichTextHeadingNode {
  node_type: "heading";
  level: 2 | 3 | 4 | 5 | 6;
  content: RichTextInlineNode[];
}

export interface RichTextTableCellNode {
  node_type: "table_cell";
  header: boolean;
  content: RichTextInlineNode[];
}

export interface RichTextTableRowNode {
  node_type: "table_row";
  content: RichTextTableCellNode[];
}

export interface RichTextTableNode {
  node_type: "table";
  content: RichTextTableRowNode[];
}

export type RichTextBlockNode =
  | RichTextParagraphNode
  | RichTextUnorderedListNode
  | RichTextHeadingNode
  | RichTextTableNode;

export interface RichTextDocument {
  node_type: "document";
  content: RichTextBlockNode[];
}

export interface RichTextLinkWarning {
  code: "AMBIGUOUS_RICH_TEXT_LINK" | "UNMATCHED_RICH_TEXT_LINK";
  phrase: string;
  relationship_ids: string[];
}


export function richTextBlockInlines(block: RichTextBlockNode): RichTextInlineNode[] {
  if (block.node_type === "paragraph" || block.node_type === "heading") {
    return block.content;
  }
  if (block.node_type === "unordered_list") {
    return block.content.flatMap((item) => item.content);
  }
  return block.content.flatMap((row) => row.content.flatMap((cell) => cell.content));
}


export function mapRichTextBlockInlines(
  block: RichTextBlockNode,
  transform: (content: RichTextInlineNode[]) => RichTextInlineNode[],
): RichTextBlockNode {
  if (block.node_type === "paragraph" || block.node_type === "heading") {
    return { ...block, content: transform(block.content) };
  }
  if (block.node_type === "unordered_list") {
    return {
      ...block,
      content: block.content.map((item) => ({
        ...item,
        content: transform(item.content),
      })),
    };
  }
  return {
    ...block,
    content: block.content.map((row) => ({
      ...row,
      content: row.content.map((cell) => ({
        ...cell,
        content: transform(cell.content),
      })),
    })),
  };
}


function sameMarks(left?: RichTextMark[], right?: RichTextMark[]): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}


function appendText(
  content: RichTextInlineNode[],
  value: string,
  marks: RichTextMark[],
): void {
  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  if (!normalized) return;
  const previous = content.at(-1);
  if (previous?.node_type === "text" && sameMarks(previous.marks, marks)) {
    previous.value += normalized;
    return;
  }
  content.push({
    node_type: "text",
    value: normalized,
    ...(marks.length > 0 ? { marks } : {}),
  });
}


function inlineContent(
  $: cheerio.CheerioAPI,
  nodes: any[],
  inheritedMarks: RichTextMark[] = [],
): RichTextInlineNode[] {
  const content: RichTextInlineNode[] = [];
  const visit = (node: any, marks: RichTextMark[]): void => {
    if (node.type === "text") {
      appendText(content, node.data ?? "", marks);
      return;
    }
    const tag = String(node.tagName ?? node.name ?? "").toLocaleLowerCase("en-US");
    if (tag === "br") {
      content.push({ node_type: "hard_break" });
      return;
    }
    const nextMarks = [...marks];
    if ((tag === "i" || tag === "em") && !nextMarks.includes("italic")) {
      nextMarks.push("italic");
    }
    if ((tag === "b" || tag === "strong") && !nextMarks.includes("bold")) {
      nextMarks.push("bold");
    }
    if (tag === "sup" && !nextMarks.includes("superscript")) {
      nextMarks.push("superscript");
    }
    for (const child of $(node).contents().toArray()) visit(child, nextMarks);
  };
  for (const node of nodes) visit(node, inheritedMarks);
  while (content[0]?.node_type === "text" && !content[0].value.trim()) content.shift();
  if (content[0]?.node_type === "text") content[0].value = content[0].value.trimStart();
  let last = content.at(-1);
  while (last?.node_type === "text" && !last.value.trim()) {
    content.pop();
    last = content.at(-1);
  }
  if (last?.node_type === "text") last.value = last.value.trimEnd();
  return content;
}


export function parseRichTextHtml(html: string): RichTextDocument {
  const paragraphBreaks = html.replace(
    /<br\s*\/?>(?:\s|&nbsp;)*<br\s*\/?>/gi,
    "<rich-text-paragraph-break></rich-text-paragraph-break>",
  );
  const $ = cheerio.load(
    `<div id="rich-text-root">${paragraphBreaks}</div>`,
    undefined,
    false,
  );
  const blocks: RichTextBlockNode[] = [];
  let pending: any[] = [];
  const flushParagraph = (): void => {
    const content = inlineContent($, pending);
    pending = [];
    if (content.length > 0) blocks.push({ node_type: "paragraph", content });
  };

  for (const node of $("#rich-text-root").contents().toArray()) {
    const tag = String((node as any).tagName ?? (node as any).name ?? "")
      .toLocaleLowerCase("en-US");
    if (tag === "rich-text-paragraph-break") {
      flushParagraph();
      continue;
    }
    if (tag === "p") {
      flushParagraph();
      const content = inlineContent($, $(node).contents().toArray());
      if (content.length > 0) blocks.push({ node_type: "paragraph", content });
      continue;
    }
    if (tag === "ul") {
      flushParagraph();
      const items = $(node).children("li").toArray().flatMap((item) => {
        const content = inlineContent($, $(item).contents().toArray());
        return content.length > 0
          ? [{ node_type: "list_item" as const, content }]
          : [];
      });
      if (items.length > 0) blocks.push({ node_type: "unordered_list", content: items });
      continue;
    }
    if (/^h[2-6]$/.test(tag)) {
      flushParagraph();
      const content = inlineContent($, $(node).contents().toArray());
      if (content.length > 0) {
        blocks.push({
          node_type: "heading",
          level: Number.parseInt(tag.slice(1), 10) as 2 | 3 | 4 | 5 | 6,
          content,
        });
      }
      continue;
    }
    if (tag === "table") {
      flushParagraph();
      const rows = $(node).find("tr").toArray().flatMap((row, rowIndex) => {
        const cells = $(row).children("th, td").toArray().flatMap((cell) => {
          const content = inlineContent($, $(cell).contents().toArray());
          return content.length > 0
            ? [{
                node_type: "table_cell" as const,
                header: rowIndex === 0 || String((cell as any).tagName).toLowerCase() === "th",
                content,
              }]
            : [];
        });
        return cells.length > 0
          ? [{ node_type: "table_row" as const, content: cells }]
          : [];
      });
      if (rows.length > 0) blocks.push({ node_type: "table", content: rows });
      continue;
    }
    pending.push(node);
  }
  flushParagraph();
  return { node_type: "document", content: blocks };
}


function phraseKey(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll("’", "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}


function naturalSpellName(value: string): string {
  const match = /^(.*?),\s*(greater|lesser|mass|supreme)$/i.exec(value.trim());
  return match?.[1] && match[2] ? `${match[2]} ${match[1]}` : value;
}


function relationshipPriority(relationship: ValidatedJson): number {
  if (relationship.type === "functions_like") return 0;
  if (["spell", "spell_family"].includes(relationship.target.entity_type)) return 1;
  if (relationship.type === "uses_definition") return 2;
  return 3;
}


interface LinkCandidate {
  phrase: string;
  key: string;
  relationshipId: string;
  priority: number;
  expectsMatch: boolean;
  exactCase: boolean;
}


function linkCandidates(
  relationships: ValidatedJson[],
  ownerEntityId?: string,
): {
  candidates: LinkCandidate[];
  warnings: RichTextLinkWarning[];
} {
  const candidates: LinkCandidate[] = [];
  for (const relationship of relationships) {
    if (
      relationship.status !== "accepted" ||
      !relationship.target?.entity_id ||
      !relationship.relationship_id
    ) continue;
    if (
      relationship.target.entity_type === "spell" &&
      relationship.target.entity_id === ownerEntityId
    ) continue;
    const hasDescriptionEvidence = (relationship.evidence ?? []).some(
      (evidence: ValidatedJson) =>
        evidence.source_field === "spell_raw.description_raw"
    );
    const expectsMatch = relationship.type === "functions_like" ||
      relationship.target.entity_type === "spell" ||
      (
        relationship.target.entity_type === "spell_family" &&
        relationship.type === "references"
      ) ||
      hasDescriptionEvidence;
    if (
      !expectsMatch &&
      !["uses_definition", "uses_action"].includes(String(relationship.type))
    ) continue;
    const phrases = new Set<string>([
      String(relationship.target.name),
      naturalSpellName(String(relationship.target.name)),
    ]);
    for (const evidence of relationship.evidence ?? []) {
      const anchor = String(evidence.anchor_text_raw ?? "").trim();
      if (
        (
          evidence.source_field === "spell_raw.description_raw" ||
          evidence.evidence_kind === "hyperlink"
        ) &&
        anchor.length <= 100 &&
        !/[.!?](?:\s|$)/.test(anchor) &&
        (
          relationship.target.entity_type !== "spell" ||
          evidence.evidence_kind === "hyperlink" ||
          phraseKey(anchor) === phraseKey(String(relationship.target.name)) ||
          phraseKey(anchor) === phraseKey(naturalSpellName(String(relationship.target.name)))
        )
      ) phrases.add(anchor);
    }
    for (const phrase of phrases) {
      const key = phraseKey(phrase);
      if (!key) continue;
      candidates.push({
        phrase,
        key,
        relationshipId: String(relationship.relationship_id),
        priority: relationshipPriority(relationship),
        expectsMatch,
        exactCase: relationship.target.entity_type !== "spell" &&
          /^\p{Lu}[^\s]*$/u.test(phrase),
      });
    }
  }

  const byPhrase = new Map<string, LinkCandidate[]>();
  for (const candidate of candidates) {
    const existing = byPhrase.get(candidate.key) ?? [];
    existing.push(candidate);
    byPhrase.set(candidate.key, existing);
  }
  const warnings: RichTextLinkWarning[] = [];
  const resolved: LinkCandidate[] = [];
  for (const [key, matches] of byPhrase) {
    const bestPriority = Math.min(...matches.map((match) => match.priority));
    const best = matches.filter((match) => match.priority === bestPriority);
    const ids = [...new Set(best.map((match) => match.relationshipId))];
    if (ids.length > 1) {
      warnings.push({
        code: "AMBIGUOUS_RICH_TEXT_LINK",
        phrase: best[0]?.phrase ?? key,
        relationship_ids: ids.sort(),
      });
      continue;
    }
    resolved.push(best.find((match) => !match.exactCase) ?? best[0]!);
  }
  return {
    candidates: resolved.sort((left, right) =>
      right.key.length - left.key.length ||
      left.priority - right.priority ||
      left.relationshipId.localeCompare(right.relationshipId)
    ),
    warnings,
  };
}


function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}


function linkTextNode(node: RichTextTextNode, candidates: LinkCandidate[]): RichTextInlineNode[] {
  const matches: Array<{ start: number; end: number; candidate: LinkCandidate }> = [];
  for (const candidate of candidates) {
    const expression = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapedRegExp(candidate.phrase)}(?=$|[^\\p{L}\\p{N}]|UM\\b)`,
      candidate.exactCase ? "gu" : "giu",
    );
    for (const match of node.value.matchAll(expression)) {
      const start = match.index;
      if (start === undefined) continue;
      matches.push({ start, end: start + match[0].length, candidate });
    }
  }
  matches.sort((left, right) =>
    left.start - right.start ||
    (right.end - right.start) - (left.end - left.start) ||
    left.candidate.priority - right.candidate.priority
  );
  const selected: typeof matches = [];
  let consumed = 0;
  for (const match of matches) {
    if (match.start < consumed) continue;
    selected.push(match);
    consumed = match.end;
  }
  if (selected.length === 0) return [node];

  const content: RichTextInlineNode[] = [];
  let offset = 0;
  for (const match of selected) {
    if (match.start > offset) {
      content.push({
        node_type: "text",
        value: node.value.slice(offset, match.start),
        ...(node.marks ? { marks: node.marks } : {}),
      });
    }
    content.push({
      node_type: "entity_link",
      value: node.value.slice(match.start, match.end),
      relationship_id: match.candidate.relationshipId,
      ...(node.marks ? { marks: node.marks } : {}),
    });
    offset = match.end;
  }
  if (offset < node.value.length) {
    content.push({
      node_type: "text",
      value: node.value.slice(offset),
      ...(node.marks ? { marks: node.marks } : {}),
    });
  }
  return content;
}


export function linkRichTextDocument(
  document: RichTextDocument,
  relationships: ValidatedJson[],
  options: { ownerEntityId?: string } = {},
): { document: RichTextDocument; warnings: RichTextLinkWarning[] } {
  const { candidates, warnings } = linkCandidates(
    relationships,
    options.ownerEntityId,
  );
  const linkInline = (content: RichTextInlineNode[]): RichTextInlineNode[] =>
    content.flatMap((node) => node.node_type === "text" ? linkTextNode(node, candidates) : [node]);
  const linkedDocument: RichTextDocument = {
      node_type: "document",
      content: document.content.map((block) => mapRichTextBlockInlines(block, linkInline)),
  };
  const linkedRelationshipIds = new Set<string>();
  for (const block of linkedDocument.content) {
    for (const node of richTextBlockInlines(block)) {
      if (node.node_type === "entity_link") linkedRelationshipIds.add(node.relationship_id);
    }
  }
  const unmatched = new Map<string, LinkCandidate>();
  for (const candidate of candidates) {
    if (candidate.expectsMatch && !linkedRelationshipIds.has(candidate.relationshipId)) {
      unmatched.set(candidate.relationshipId, candidate);
    }
  }
  for (const candidate of unmatched.values()) {
    warnings.push({
      code: "UNMATCHED_RICH_TEXT_LINK",
      phrase: candidate.phrase,
      relationship_ids: [candidate.relationshipId],
    });
  }
  return {
    document: linkedDocument,
    warnings,
  };
}


export function richTextLeafText(document: RichTextDocument): string {
  return document.content.map((block) => {
    if (block.node_type === "paragraph" || block.node_type === "heading") {
      return block.content.map((node) => node.node_type === "hard_break" ? "\n" : node.value).join("");
    }
    if (block.node_type === "unordered_list") {
      return block.content.map((item) =>
        item.content.map((node) => node.node_type === "hard_break" ? "\n" : node.value).join("")
      ).join("");
    }
    return block.content.map((row) => row.content.map((cell) =>
      cell.content.map((node) => node.node_type === "hard_break" ? "\n" : node.value).join("")
    ).join("")).join("");
  }).join("\n\n");
}


export function comparableRichText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en-US");
}
