import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

import { projectRoot } from "../src/config.js";

it("rejects unknown commands and invalid spell levels", () => {
  for (const args of [["typo"], ["list", "spell-list.wizard", "1.5"], ["list", "spell-list.wizard", "10"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: projectRoot, encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Unknown command|Spell level must/);
  }
});
