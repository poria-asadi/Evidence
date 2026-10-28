# Evidence Flow

A web app for systematic review workflows, including reference imports, duplicate detection, screening, and full-text PDF review.

## Run locally

Requires Node.js 22.13+ and pnpm.

```bash
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm dev
```

Set `OPENROUTER_API_KEY` in `.dev.vars` to use the AI screening features. The local identity settings in the example file are for development only.

## Repository contents

The application code, database schema and migrations, configuration, lockfile, and required browser PDF runtime assets are committed. Dependencies, build output, local databases, temporary files, and real environment values are excluded.
