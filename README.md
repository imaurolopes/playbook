# Playbook

Playbook is a metadata-driven visual knowledge system for humans and AI agents. Its foundation separates reusable knowledge, long-form documents, project-specific outputs, and system configuration.

## Principles

- Domain concepts live in content metadata, not TypeScript types or routes.
- Navigation, classification, hierarchy, icons, colors, themes, and views are YAML-configured.
- Reusable knowledge and project evidence remain separate.
- Content stays readable, reviewable, and version-controlled.
- The application runtime provides generic loading and rendering primitives.

## Content structure

- `content/system/` defines schemas, taxonomy, navigation, views, and theme tokens.
- `content/entries/` stores generic reusable knowledge records.
- `content/documents/` stores Markdown or MDX documents referenced by entries.
- `content/projects/` stores filled outputs for individual projects or initiatives.

## Application structure

- `src/app/` contains the Next.js App Router and static routes.
- `src/components/renderers/` renders generic metadata and documents.
- `src/components/shell/` builds the metadata-driven application shell.
- `src/components/theme/` provides metadata-controlled light and dark themes.
- `src/components/ui/` is ready for shadcn/ui components.
- `src/lib/content/` loads YAML and Markdown at build time.
- `src/lib/metadata/` resolves generic presentation metadata.
- `src/lib/navigation/` resolves metadata-defined navigation.
- `src/types/` contains only generic content-engine contracts.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validation

```bash
npm run typecheck
npm run lint
npm run build
```

The production build is exported to `out/`.

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the static export when `main` changes. In the repository settings, configure Pages to use **GitHub Actions** as its source.

The Next.js base path is inferred from `GITHUB_REPOSITORY` during the GitHub Actions build, so project sites work without repository-specific source changes.

## Current scope

This foundation includes metadata loading, generic rendering, light/dark mode, YAML content, Markdown documents, sample project outputs, shadcn/ui configuration, and GitHub Pages deployment.

Graph visualization, dedicated skills pages, and agent package generation are intentionally not implemented.
