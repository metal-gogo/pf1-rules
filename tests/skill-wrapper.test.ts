import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { expect, test } from "vitest";

import { projectRoot } from "../src/config.js";


test.skipIf(process.platform === "win32")("skill wrapper signs only its batch and keeps failed work resumable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-skill-wrapper-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Wrapper Test");
    git("config", "user.email", "wrapper@example.invalid");
    git("config", "commit.gpgsign", "true");
    git("config", "gpg.format", "ssh");
    const key = path.join(root, "signing-key");
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
    git("config", "user.signingkey", key);
    git("config", "gpg.ssh.program", "ssh-keygen");
    fs.writeFileSync(path.join(root, "unrelated.txt"), "original");
    git("add", "unrelated.txt");
    git("commit", "-qm", "Initial");
    const original = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(root, "unrelated.txt"), "keep staged");
    git("add", "unrelated.txt");
    fs.mkdirSync(path.join(root, "bin"));
    fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir");
    fs.writeFileSync(path.join(root, "test.env"), "PF1_ARTIFACT_ROOT=/unused\n");
    fs.writeFileSync(path.join(root, "bin/pnpm"), `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> steps.log
if [[ "$FAIL_STEP" == "$1" ]]; then exit 1; fi
if [[ "$1" == ingest:skills ]]; then
  mkdir -p data/entities data/observations/skills/acrobatics
  printf '{}\n' > data/entities/skill-entities.json
  printf '{}\n' > data/observations/skills/acrobatics/aon-0.1.0.json
  printf '{}\n' > data/observations/skills/acrobatics/d20pfsrd-0.1.0.json
  printf '["skill.acrobatics"]\n' > .git/qwen-skill-ingestion.json
fi
`, { mode: 0o755 });
    const run = (failStep = "") => spawnSync("bash", [path.join(projectRoot, "scripts/run-qwen-skill-ingestion.sh"), "1"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path.join(root, "bin") + path.delimiter + process.env.PATH,
        PF1_ENV_FILE: path.join(root, "test.env"),
        FAIL_STEP: failStep,
      },
    });
    const pending = path.join(root, ".git/qwen-skill-ingestion.json");
    const failed = run("validate");
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("Resume: mise exec -- scripts/run-qwen-skill-ingestion.sh 1");
    expect(git("rev-parse", "HEAD")).toBe(original);
    expect(fs.existsSync(pending)).toBe(true);

    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(path.join(root, "steps.log"), "utf8").trim().split("\n").slice(-5)).toEqual([
      "ingest:skills --count=1 --batch-file=.git/qwen-skill-ingestion.json",
      "ingest:skills --count=1 --batch-file=.git/qwen-skill-ingestion.json --offline",
      "validate",
      "db:import",
      "db:check",
    ]);
    expect(fs.existsSync(pending)).toBe(false);
    expect(git("show", "--pretty=format:", "--name-only", "HEAD").split("\n")).toEqual([
      "data/entities/skill-entities.json",
      "data/observations/skills/acrobatics/aon-0.1.0.json",
      "data/observations/skills/acrobatics/d20pfsrd-0.1.0.json",
    ]);
    expect(git("cat-file", "commit", "HEAD")).toContain("BEGIN SSH SIGNATURE");
    expect(git("diff", "--cached", "--name-only")).toBe("unrelated.txt");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
