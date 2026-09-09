#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^[0-9]+$ || ! $1 =~ [1-9] ]]; then
  echo "Usage: scripts/run-qwen-feat-ingestion.sh <COUNT> (positive integer)" >&2
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
batch_file=$(git rev-parse --git-path qwen-feat-ingestion.json)
completed=()
trap 'printf "\nCount: %s; completed: %s\n" "$count" "${completed[*]:-none}"' EXIT

pnpm ingest:feats --count="$count" --batch-file="$batch_file"
completed+=("ingest:feats")
pnpm ingest:feats --count="$count" --batch-file="$batch_file" --offline
completed+=("ingest:feats(offline)")
PF1_VERIFY_ARTIFACTS=0 pnpm validate
completed+=("validate")
pnpm db:import
completed+=("db:import")
pnpm db:check
completed+=("db:check")
rm -- "$batch_file"
