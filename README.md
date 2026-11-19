# Playbook

Playbook is a browser-local workspace for structured technical knowledge. The workspace supports topic management, Markdown context, and explicit topic relationships.

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

## Project layout

- `src/domain/` holds the topic and relationship models and their validation rules.
- `src/application/` defines the repository contract and coordinates topic changes.
- `src/infrastructure/` provides the LocalStorage implementation and sample data.
- `src/presentation/` contains the React shell, topic routes, editor, Markdown rendering, and dependency graph.
- `docs/prototypes/topic/` contains the visual references.

The app seeds sample topics when the storage key is absent. It preserves an initialized empty workspace and retains malformed data for recovery. Deleting a topic promotes its direct children to the deleted topic’s parent, or to the top level if it had no parent.

Use **Dependencies → Add relationship** to connect two topics. A dependency points from the current topic to the required topic and appears under **Required by** on the other side. A related connection appears in both topics’ Content summaries. Topic hierarchy stays independent of both relationship types.

Sprint 01 topic arrays are read as workspaces with no relationships. The next successful write stores topics and relationships together without changing existing topic fields. Deleting a topic removes its incoming and outgoing relationships in the same write.

Data is stored per browser and origin. Save edits before switching topics. Implementation, Agent Instructions, Version History, and Metadata are navigation placeholders. Core, Organization, and Project are classifications in this sprint.
