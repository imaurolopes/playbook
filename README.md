# Playbook

Playbook is a browser-local workspace for reusable technical knowledge and project execution.

## Architecture

- **Knowledge Management** maintains Topics, their relationships, reusable implementation checklists, and immutable versions.
- **Project Design** is the planned layer for composing solutions from specific knowledge versions.
- **Project Execution** runs project-specific task instances against pinned Topic versions. **Projects → Topics** shows the pinned version. **Upgrade knowledge** explicitly pins the current Topic and adds missing task definitions while preserving existing execution task content and progress.

## Topic Management

All six tabs in the Topic Management milestone have completed functional validation.

| Tab | Workflow |
| --- | --- |
| Content | Edit reusable summaries and technical content in Markdown. Open the Topic menu to edit, duplicate, or move a Topic to Trash. |
| Dependencies | Manage directed dependencies and related Topics. The table and the interactive graph show relationship direction. |
| Implementation | Define and reorder reusable checklist tasks with instructions, acceptance criteria, task dependencies, and references. Completion and evidence belong to Project Execution. |
| Agent Instructions | Select an agent profile and Workspace generation template. Generate a read-only Markdown or YAML preview with copy and download actions. Topic generation uses persisted Working knowledge. Project-context generation can use pinned snapshots and their saved classification. |
| Version History | Compare the Working version with saved immutable snapshots and restore historical knowledge. Snapshots capture reusable knowledge and classification. Restoration preserves current governance and existing project pins. |
| Metadata | Classify Topics as Concept, Architecture, Technology, Pattern, Practice, or General. Assign optional reusable Technical domains and tags, edit governance, and manage Text, Number, Boolean, Date, and URL custom properties. |

**Workspace → Templates** centralizes generation template management. Built-in templates can be duplicated. Custom templates can be created, edited, duplicated, and deleted. Topic Agent Instructions only selects a template.

The Workspace and Topics sidebars can be independently resized, pinned, or set to auto-hide. Panel preferences are stored locally. Narrow layouts collapse or stack panels to keep the main workspace usable.

## Persistence and compatibility

Data is stored per browser and origin. The app seeds samples when storage is absent, preserves initialized empty workspaces, and retains malformed data for recovery. Legacy topic arrays and workspace records are supported. Migration retains legacy organization and execution data in backups when applicable. Single technical domains remain readable, and untyped custom properties are interpreted as Text with their original values and IDs. Existing historical snapshots retain their original contents.

Use the Topic menu to move a Topic to **Trash**. Restore it from Trash or permanently delete it there when safeguards allow. Project pins and version history remain protected by the existing deletion safeguards.

## Known limitations and technical debt

- Project Design and active Core, Organization, and Project inheritance resolution remain future work. Legacy scope and customization records are retained for migration. Project inclusion and task provenance do not assign knowledge ownership.
- Storage is browser-local. Collaboration, cross-device synchronization, and access enforcement are outside this milestone.
- Older snapshots may lack some classification or checklist details. The app handles these records without reconstructing missing history.
- URL custom properties accept HTTP and HTTPS. Rich icons in the Topic type dropdown depend on browser support for customizable native selects.
- Vite reports that the production JavaScript chunk exceeds its default size warning threshold. Bundle splitting remains a follow-up.

## Setup

Use Node.js 22.12+ (20.19+ is also supported on the Node 20 release line) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. On Windows, use `npm.cmd` if PowerShell blocks the npm script shim.

```sh
npm test
npm run lint
npm run build
npm run preview
```

The production build is written to `dist/`. For static hosting, configure the host to serve `index.html` for client-side topic routes.

Run the browser integration suite with Chromium. It starts its own local server and uses isolated browser storage.

```sh
npx playwright install chromium
npm run test:e2e
```

Set `PLAYBOOK_BROWSER_CHANNEL=chrome` to run against an installed Google Chrome instead.

## Project layout

- `src/domain/` holds the topic and relationship models and their validation rules.
- `src/application/` defines the repository contract and coordinates topic changes.
- `src/infrastructure/` provides the LocalStorage implementation and sample data.
- `src/presentation/` contains the React shell, topic routes, editor, Markdown rendering, dependency graph, and implementation workspace.
- `docs/prototypes/topic/` contains the visual references.
