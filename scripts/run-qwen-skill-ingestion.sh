#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^[0-9]+$ || ! $1 =~ [1-9] ]]; then
  echo "Usage: scripts/run-qwen-skill-ingestion.sh <COUNT> (positive integer)" >&2
  exit 1
fi

root=$(git rev-parse --show-toplevel) || exit 1
if [[ $(pwd -P) != "$root" ]]; then
  echo "Run this script from the repository root: $root" >&2
  exit 1
fi

env_file=${PF1_ENV_FILE-/home/mgogo/src/pf1-rules/.env}
if [[ ! -f "$env_file" ]]; then
  echo "Environment file not found: $env_file (set PF1_ENV_FILE)" >&2
  exit 1
fi
PF1_ARTIFACT_ROOT=$(node --input-type=module - "$env_file" <<'JS'
import fs from "node:fs";
import { parse } from "dotenv";

const value = parse(fs.readFileSync(process.argv[2])).PF1_ARTIFACT_ROOT?.trim();
if (!value) {
  console.error("PF1_ARTIFACT_ROOT is missing or empty in the environment file");
  process.exit(1);
}
process.stdout.write(value);
JS
)
export PF1_ARTIFACT_ROOT

count=$1
batch_file=$(git rev-parse --git-path qwen-skill-ingestion.json)
completed=()
finish() {
  local status=$?
  printf "\nCount: %s; completed: %s\n" "$count" "${completed[*]:-none}"
  if (( status != 0 )) && [[ -f "$batch_file" ]]; then
    printf 'Batch retained. Resume: mise exec -- scripts/run-qwen-skill-ingestion.sh %s\n' "$count" >&2
  fi
}
trap finish EXIT

pnpm ingest:skills --count="$count" --batch-file="$batch_file"
completed+=("ingest:skills")
pnpm ingest:skills --count="$count" --batch-file="$batch_file" --offline
completed+=("ingest:skills(offline)")
PF1_VERIFY_ARTIFACTS=0 pnpm validate
completed+=("validate")
pnpm db:import
completed+=("db:import")
pnpm db:check
completed+=("db:check")
batch_paths=(data/entities/skill-entities.json data/observations/skills)
git add -- "${batch_paths[@]}"
git diff --cached --check -- "${batch_paths[@]}"
if ! git diff --cached --quiet -- "${batch_paths[@]}"; then
  commit_message=$(node --input-type=module - "$batch_file" <<'JS'
import fs from "node:fs";

const ids = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const names = ids.map((id) => id.slice("skill.".length).replaceAll("-", " "));
console.log(`ingest skills: ${names[0]} + ${names.length - 1} skills`);
JS
)
  git commit -S --only -m "$commit_message" -- "${batch_paths[@]}"
fi
completed+=("commit")
rm -- "$batch_file"
