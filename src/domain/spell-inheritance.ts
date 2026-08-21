export type JsonObject = Record<string, unknown>;

export interface SpellInheritanceOverride {
  path: string;
  value: unknown;
  source_field: string;
  raw: string;
  note?: string | null;
}

export interface SpellInheritanceRule {
  from_spell_id: string;
  relationship: "functions_like";
  inherited_paths: string[];
  overrides: SpellInheritanceOverride[];
  resolution_status: "resolved" | "pending" | "cycle_detected" | "missing_parent";
}

export interface InheritableSpell extends JsonObject {
  spell_id: string;
  rules_inheritance: SpellInheritanceRule[];
}

export interface AppliedInheritance {
  spellId: string;
  fromSpellId: string;
  inheritedPaths: string[];
  overridePaths: string[];
}

export interface ResolvedSpellInheritance<T extends InheritableSpell> {
  record: T;
  lineage: string[];
  applied: AppliedInheritance[];
}

export type InheritanceErrorCode =
  | "cycle_detected"
  | "duplicate_spell"
  | "invalid_path"
  | "missing_parent"
  | "overlapping_paths"
  | "resolution_pending"
  | "stale_resolution_status"
  | "undeclared_override";

export class SpellInheritanceError extends Error {
  constructor(
    readonly code: InheritanceErrorCode,
    message: string,
  ) {
    super(message);
  }
}


function clone<T>(value: T): T {
  return structuredClone(value);
}


function pointerTokens(pointer: string): string[] {
  if (!pointer.startsWith("/") || pointer === "/") {
    throw new SpellInheritanceError(
      "invalid_path",
      `Inheritance path must be a non-root JSON Pointer: ${JSON.stringify(pointer)}`,
    );
  }
  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}


function displayPath(path: string, ownerId: string): string {
  return `${ownerId}${path}`;
}


export function readJsonPointer(document: unknown, pointer: string, ownerId = "document"): unknown {
  let current = document;
  for (const token of pointerTokens(pointer)) {
    if (current === null || typeof current !== "object" || !(token in current)) {
      throw new SpellInheritanceError(
        "invalid_path",
        `Inheritance path does not exist: ${displayPath(pointer, ownerId)}`,
      );
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}


export function writeJsonPointer(document: unknown, pointer: string, value: unknown, ownerId = "document"): void {
  const tokens = pointerTokens(pointer);
  const finalToken = tokens.at(-1);
  let current = document;
  for (const token of tokens.slice(0, -1)) {
    if (current === null || typeof current !== "object" || !(token in current)) {
      throw new SpellInheritanceError(
        "invalid_path",
        `Inheritance path has no writable parent: ${displayPath(pointer, ownerId)}`,
      );
    }
    current = (current as Record<string, unknown>)[token];
  }
  if (finalToken === undefined || current === null || typeof current !== "object") {
    throw new SpellInheritanceError(
      "invalid_path",
      `Inheritance path has no writable parent: ${displayPath(pointer, ownerId)}`,
    );
  }
  (current as Record<string, unknown>)[finalToken] = clone(value);
}


function pathContains(ancestor: string, descendant: string): boolean {
  const ancestorTokens = pointerTokens(ancestor);
  const descendantTokens = pointerTokens(descendant);
  return ancestorTokens.length <= descendantTokens.length &&
    ancestorTokens.every((token, index) => token === descendantTokens[index]);
}


function assertNoOverlappingPaths(paths: string[], ownerId: string): void {
  for (const [index, path] of paths.entries()) {
    pointerTokens(path);
    for (const other of paths.slice(index + 1)) {
      if (pathContains(path, other) || pathContains(other, path)) {
        throw new SpellInheritanceError(
          "overlapping_paths",
          `${ownerId} declares overlapping inherited paths ${path} and ${other}.`,
        );
      }
    }
  }
}


function assertRulePaths(rule: SpellInheritanceRule, ownerId: string): void {
  assertNoOverlappingPaths(rule.inherited_paths, ownerId);
  const overridePaths = new Set<string>();
  for (const override of rule.overrides) {
    pointerTokens(override.path);
    if (overridePaths.has(override.path)) {
      throw new SpellInheritanceError(
        "overlapping_paths",
        `${ownerId} declares override ${override.path} more than once.`,
      );
    }
    overridePaths.add(override.path);
    if (!rule.inherited_paths.some((path) => pathContains(path, override.path))) {
      throw new SpellInheritanceError(
        "invalid_path",
        `${ownerId} override ${override.path} is not within an inherited path.`,
      );
    }
  }
}


function indexSpells<T extends InheritableSpell>(spells: Iterable<T>): Map<string, T> {
  const index = new Map<string, T>();
  for (const spell of spells) {
    if (index.has(spell.spell_id)) {
      throw new SpellInheritanceError("duplicate_spell", `Duplicate spell ${spell.spell_id}.`);
    }
    index.set(spell.spell_id, spell);
  }
  return index;
}


function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}


export function resolveSpellInheritance<T extends InheritableSpell>(
  spells: Iterable<T>,
  spellId: string,
): ResolvedSpellInheritance<T> {
  const index = indexSpells(spells);
  const cache = new Map<string, ResolvedSpellInheritance<T>>();
  const active: string[] = [];

  const resolve = (currentId: string): ResolvedSpellInheritance<T> => {
    const cached = cache.get(currentId);
    if (cached) return clone(cached);
    const cycleStart = active.indexOf(currentId);
    if (cycleStart >= 0) {
      const cycle = [...active.slice(cycleStart), currentId].join(" -> ");
      throw new SpellInheritanceError("cycle_detected", `Spell inheritance cycle: ${cycle}`);
    }
    const source = index.get(currentId);
    if (!source) {
      throw new SpellInheritanceError("missing_parent", `Missing canonical spell ${currentId}.`);
    }

    active.push(currentId);
    try {
      const record = clone(source);
      const lineage: string[] = [];
      const applied: AppliedInheritance[] = [];
      const claimedPaths: string[] = [];
      for (const rule of source.rules_inheritance) {
        assertRulePaths(rule, currentId);
        if (rule.resolution_status !== "resolved") {
          throw new SpellInheritanceError(
            rule.resolution_status === "missing_parent" ? "missing_parent" : "resolution_pending",
            `${currentId} inheritance from ${rule.from_spell_id} is ${rule.resolution_status}.`,
          );
        }
        for (const claimed of claimedPaths) {
          for (const inheritedPath of rule.inherited_paths) {
            if (pathContains(claimed, inheritedPath) || pathContains(inheritedPath, claimed)) {
              throw new SpellInheritanceError(
                "overlapping_paths",
                `${currentId} inherits overlapping path ${inheritedPath} from multiple parents.`,
              );
            }
          }
        }

        const parent = resolve(rule.from_spell_id);
        for (const inheritedPath of rule.inherited_paths) {
          const inheritedValue = readJsonPointer(parent.record, inheritedPath, rule.from_spell_id);
          writeJsonPointer(record, inheritedPath, inheritedValue, currentId);
          claimedPaths.push(inheritedPath);
        }
        for (const override of rule.overrides) {
          writeJsonPointer(record, override.path, override.value, currentId);
        }
        for (const ancestor of [...parent.lineage, rule.from_spell_id]) {
          if (!lineage.includes(ancestor)) lineage.push(ancestor);
        }
        applied.push(...parent.applied, {
          spellId: currentId,
          fromSpellId: rule.from_spell_id,
          inheritedPaths: [...rule.inherited_paths],
          overridePaths: rule.overrides.map((override) => override.path),
        });
      }
      const result = { record, lineage, applied };
      cache.set(currentId, clone(result));
      return result;
    } finally {
      active.pop();
    }
  };

  return resolve(spellId);
}


export function validateSpellInheritance<T extends InheritableSpell>(spells: Iterable<T>): void {
  const spellList = [...spells];
  const index = indexSpells(spellList);
  for (const spell of spellList) {
    for (const rule of spell.rules_inheritance) {
      assertRulePaths(rule, spell.spell_id);
      const parentExists = index.has(rule.from_spell_id);
      if (rule.resolution_status === "resolved" && !parentExists) {
        throw new SpellInheritanceError(
          "missing_parent",
          `${spell.spell_id} marks missing parent ${rule.from_spell_id} as resolved.`,
        );
      }
      if (rule.resolution_status === "missing_parent" && parentExists) {
        throw new SpellInheritanceError(
          "stale_resolution_status",
          `${spell.spell_id} still marks available parent ${rule.from_spell_id} as missing.`,
        );
      }
    }
  }

  for (const spell of spellList) {
    if (spell.rules_inheritance.length === 0 ||
      spell.rules_inheritance.some((rule) => rule.resolution_status !== "resolved")) {
      continue;
    }
    const resolved = resolveSpellInheritance(spellList, spell.spell_id).record;
    for (const rule of spell.rules_inheritance) {
      for (const path of rule.inherited_paths) {
        const declared = readJsonPointer(spell, path, spell.spell_id);
        const materialized = readJsonPointer(resolved, path, spell.spell_id);
        if (!sameJson(declared, materialized)) {
          throw new SpellInheritanceError(
            "undeclared_override",
            `${spell.spell_id}${path} differs from its resolved parent value without an explicit override.`,
          );
        }
      }
    }
  }
}
