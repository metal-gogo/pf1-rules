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
cp .env.example .env
```

Set `PF1_ARTIFACT_ROOT` in `.env` to a retained artifact store before importing.
Raw captures are stored outside Git and are required for artifact hash validation.
To build only from the versioned JSON records without checking the captures, use
`PF1_VERIFY_ARTIFACTS=0 pnpm db:setup`.

```bash
pnpm db:setup
pnpm verify
```

## Use the project

- Run `pnpm web`, then open `http://127.0.0.1:3000`, to use the [local rules browser](../src/web/server.ts).
- Run `pnpm tsx src/cli.ts --help` to discover operations provided by the [command-line interface](../src/cli.ts).
- Run `pnpm db:studio` to inspect the local database with Prisma Studio.
- Run `pnpm verify` to validate records, type-check the project, check the database, and run the unit and browser [test suites](../tests/).

Set `PF1_DATABASE_PATH` to use a different SQLite file for both migrations and
the application. After updating versioned data, run `pnpm db:import` to refresh
the local read model before running tests.

## Project configuration

- [Package metadata and scripts](../package.json)
- [Locked dependencies](../pnpm-lock.yaml)
- [TypeScript configuration](../tsconfig.json)
- [Prisma configuration](../prisma.config.ts)

Return to the [project index](index.md).
