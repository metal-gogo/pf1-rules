# Getting started

PF1 Rules uses the development environment pinned in [`.mise.toml`](../.mise.toml) and the package commands defined in [`package.json`](../package.json).

## Set up a fresh checkout

Run these commands from the project directory in Ubuntu:

```bash
mise trust
mise install
corepack enable
pnpm install
pnpm exec playwright install chromium
pnpm db:setup
pnpm verify
```

## Use the project

- Run `pnpm web`, then open `http://127.0.0.1:3000`, to use the [local rules browser](../src/web/server.ts).
- Run `pnpm tsx src/cli.ts --help` to discover operations provided by the [command-line interface](../src/cli.ts).
- Run `pnpm db:studio` to inspect the local database with Prisma Studio.
- Run `pnpm verify` to validate records, type-check the project, check the database, and run the unit and browser [test suites](../tests/).

## Project configuration

- [Package metadata and scripts](../package.json)
- [Locked dependencies](../pnpm-lock.yaml)
- [TypeScript configuration](../tsconfig.json)
- [Prisma configuration](../prisma.config.ts)
- [Workspace instructions](../AGENTS.md)

Return to the [project index](index.md).
