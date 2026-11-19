# Playbook

Playbook is a browser-local workspace for structured technical knowledge. The workspace supports topic management, Markdown context, explicit topic relationships, and project-scoped implementations.

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

The app seeds sample topics when the storage key is absent. It preserves an initialized empty workspace and retains malformed data for recovery. Deleting a topic promotes its direct children to the deleted topic’s parent, or to the top level if it had no parent.

Use **Dependencies → Add relationship** to connect two topics. A dependency points from the current topic to the required topic and appears under **Required by** on the other side. A related connection appears in both topics’ Content summaries. Topic hierarchy stays independent of both relationship types.

Sprint 01 topic arrays are read as workspaces with no relationships. The next successful write stores topics, relationships, projects, implementations, and tasks together without changing existing topic fields. Deleting a topic removes its incoming and outgoing relationships in the same write.

Use **Implementation** to create or select a project. This opens the current topic's plan and creates it automatically if needed. Set the plan status, manage and reorder tasks, and record technical decisions in Markdown. The progress ring shows the rounded percentage of tasks marked Done. A plan with zero tasks has 0% progress, and the plan status is managed independently.

The Azure Data Platform and AWS Data Platform example projects are supplied when implementation storage is first initialized. Deleting a task affects that task alone. Deleting an implementation removes its tasks and notes. Deleting a project removes its implementations and their tasks, and deleting a topic removes its implementations across projects as well as its topic relationships. Each deletion is saved in one write.

Data is stored per browser and origin. Save Content and Metadata edits before switching topics. Agent Instructions drafts save locally and regenerate on request. Version History captures topic knowledge and metadata independently from project-specific work. Core, Organization, and Project are topic classifications.
