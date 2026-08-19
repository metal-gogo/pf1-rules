# PF1 Rules project instructions

## Tooling environment

- Perform all project work with Linux-native tools inside the `Ubuntu-24.04` WSL distribution.
- Run commands from `/home/mgogo/src/pf1-rules` and use Linux paths in project scripts and documentation.
- Do not invoke Windows executables or Windows-provided shims for project operations, even if they appear earlier on `PATH`.
- Use the toolchain pinned by `mise` for Node.js, Corepack, pnpm, Prisma, TypeScript, and tests.
- If a command resolves outside the Linux filesystem, locate and use its Linux-native equivalent before continuing.
