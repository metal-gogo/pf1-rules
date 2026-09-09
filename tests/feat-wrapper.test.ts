import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { projectRoot } from "../src/config.js";

test.skipIf(process.platform === "win32")("wrapper signs only batch files and preserves the batch on failure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pf1-feat-wrapper-"));
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
printf '%s\\n' "$*" >> steps.log
if [[ "$FAIL_STEP" == "$1" ]]; then exit 1; fi
if [[ "$1" == ingest:feats ]]; then
  mkdir -p data/entities data/observations/feats/example
  printf '{}\\n' > data/entities/feat-batch-entities.json
  printf '{}\\n' > data/observations/feats/example/aon-batch-0.1.0.json
  printf '["Example"]\\n' > .git/qwen-feat-ingestion.json
fi
`, { mode: 0o755 });
    const run = (failStep = "") => spawnSync("bash", [path.join(projectRoot, "scripts/run-qwen-feat-ingestion.sh"), "1"], {
      cwd: root, encoding: "utf8",
      env: { ...process.env, PATH: path.join(root, "bin") + path.delimiter + process.env.PATH,
        PF1_ENV_FILE: path.join(root, "test.env"), FAIL_STEP: failStep },
    });
    const pending = path.join(root, ".git/qwen-feat-ingestion.json");
    expect(run("validate").status).toBe(1);
    expect(git("rev-parse", "HEAD")).toBe(original);
    expect(fs.existsSync(pending)).toBe(true);
    expect(fs.readFileSync(path.join(root, "steps.log"), "utf8")).not.toContain("db:import");

    git("config", "gpg.ssh.program", "/bin/false");
    expect(run().status).not.toBe(0);
    expect(git("rev-parse", "HEAD")).toBe(original);
    expect(fs.existsSync(pending)).toBe(true);

    git("config", "gpg.ssh.program", "ssh-keygen");
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("db:check commit");
    expect(fs.existsSync(pending)).toBe(false);
    expect(git("show", "--pretty=format:", "--name-only", "HEAD").split("\n")).toEqual([
      "data/entities/feat-batch-entities.json",
      "data/observations/feats/example/aon-batch-0.1.0.json",
    ]);
    expect(git("cat-file", "commit", "HEAD")).toContain("BEGIN SSH SIGNATURE");
    expect(git("log", "-1", "--format=%s")).toBe("ingest feats: Example + 0 feats");
    expect(git("diff", "--cached", "--name-only")).toBe("unrelated.txt");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
