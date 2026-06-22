"use client";

import { useCallback, useMemo, useState } from "react";
import { DetailPanel } from "@/components/home/detail-panel";
import { MetadataCard } from "@/components/home/metadata-card";
import { MetadataValueView } from "@/components/home/metadata-value";
import { ContextualPanels } from "@/components/views/contextual-panels";
import { useLayoutSelection } from "@/components/views/use-layout-selection";
import { ViewSelector } from "@/components/views/view-selector";
import type {
  Entry,
  GovernanceDefinition,
  KnowledgeNode,
  MetadataValue,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition,
  TaxonomyOption,
  ViewDefinition,
  ViewLayoutSettings,
  ViewSelectorDefinition
} from "@/types/content";

function getPath(entry: Entry, path: string): MetadataValue | undefined {
  let current: unknown = entry;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as MetadataValue | undefined;
}

function displayValue(value: MetadataValue | undefined) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value == null ? "—" : String(value);
}

function EntryCards({
  entries,
  category,
  taxonomy,
  view,
  layout,
  governance,
  onSelect
}: ViewLayoutProps & { onSelect: (entry: Entry) => void }) {
  const periodic = layout.layout === "periodic";
  return (
    <div className={periodic ? "local-periodic-grid" : "periodic-grid"}>
      {entries.map((entry) => (
        <MetadataCard
          key={entry.id}
          entry={entry}
          category={category}
          dimensions={taxonomy.dimensions}
          view={view}
          density={layout.cardDensity}
          governance={governance}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function KanbanView(props: ViewLayoutProps & { onSelect: (entry: Entry) => void }) {
  const groupBy = props.layout.groupBy;
  const columns = useMemo(() => {
    const grouped = new Map<string, Entry[]>();
    for (const entry of props.entries) {
      const raw = groupBy ? getPath(entry, groupBy) : undefined;
      const values = Array.isArray(raw) ? raw : [raw];
      const keys = values.filter(
        (value): value is string => typeof value === "string"
      );
      for (const key of keys.length ? keys : ["Unassigned"]) {
        grouped.set(key, [...(grouped.get(key) ?? []), entry]);
      }
    }
    return [...grouped.entries()];
  }, [groupBy, props.entries]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map(([column, entries]) => (
        <section key={column} className="rounded-2xl border bg-muted/20 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{column}</h2>
            <span className="rounded-full border bg-background px-2 py-0.5 text-xs">
              {entries.length}
            </span>
          </div>
          <div className="space-y-3">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => props.onSelect(entry)}
                className="w-full rounded-xl border bg-background p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="font-medium">{entry.title}</p>
                {entry.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {entry.summary}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TimelineView({ entries, layout }: ViewLayoutProps) {
  const dateField = layout.dateField;
  const ordered = [...entries].sort((a, b) =>
    displayValue(dateField ? getPath(b, dateField) : undefined).localeCompare(
      displayValue(dateField ? getPath(a, dateField) : undefined)
    )
  );

  return (
    <ol className="relative space-y-6 border-l pl-6">
      {ordered.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[1.93rem] top-1.5 size-3 rounded-full border-2 border-background bg-primary" />
          <p className="text-xs text-muted-foreground">
            {displayValue(dateField ? getPath(entry, dateField) : undefined)}
          </p>
          <h2 className="mt-1 font-semibold">{entry.title}</h2>
          {entry.summary ? (
            <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TableView({ entries, layout }: ViewLayoutProps) {
  const columns = layout.columns?.length ? layout.columns : ["title"];
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              {columns.map((column) => (
                <td key={column} className="px-4 py-3 align-top">
                  {displayValue(getPath(entry, column))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailView({ entries }: ViewLayoutProps) {
  return (
    <div className="space-y-6">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-2xl border p-6">
          <h2 className="text-2xl font-semibold">{entry.title}</h2>
          {entry.summary ? (
            <p className="mt-2 text-muted-foreground">{entry.summary}</p>
          ) : null}
          {entry.attributes ? (
            <div className="mt-6">
              <MetadataValueView value={entry.attributes} />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

interface ViewLayoutProps {
  entries: Entry[];
  category: TaxonomyOption;
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  registry: KnowledgeNode[];
  layout: ResolvedViewLayout;
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
  selector?: ViewSelectorDefinition;
  layouts?: Record<
    string,
    Partial<ViewLayoutSettings> & { enabled?: boolean }
  >;
  contextTitle?: string;
  governance: GovernanceDefinition;
}

export function ViewLayout(props: ViewLayoutProps) {
  const layouts = props.layouts ?? {};
  const selection = useLayoutSelection(props.layout, props.selector, layouts);
  const renderProps = { ...props, layout: selection.layout };
  const [selectedEntry, setSelectedEntry] = useState<Entry>();
  const closePanel = useCallback(() => setSelectedEntry(undefined), []);
  const detailEnabled =
    selection.layout.enabledPanels?.includes("detail") ?? false;
  const selectorEnabled =
    selection.layout.selectorEnabled ?? props.selector?.enabled ?? false;
  const selectEntry = useCallback(
    (entry: Entry) => {
      if (detailEnabled) setSelectedEntry(entry);
    },
    [detailEnabled]
  );
  const graphRoots = props.entries.flatMap((entry) => {
    const node = props.registry.find((candidate) => candidate.id === entry.id);
    return node ? [node] : [];
  });

  let content;
  switch (selection.layout.layout) {
    case "periodic":
    case "catalog":
      content = <EntryCards {...renderProps} onSelect={selectEntry} />;
      break;
    case "kanban":
      content = <KanbanView {...renderProps} onSelect={selectEntry} />;
      break;
    case "timeline":
      content = <TimelineView {...renderProps} />;
      break;
    case "table":
      content = <TableView {...renderProps} />;
      break;
    case "detail":
      content = <DetailView {...renderProps} />;
      break;
    case "graph-placeholder":
      content = (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <h2 className="font-semibold">Graph view</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This metadata-selected layout is reserved for the future graph panel.
          </p>
        </div>
      );
      break;
    default:
      content = <EntryCards {...renderProps} onSelect={selectEntry} />;
  }

  return (
    <div className="space-y-6">
      {selectorEnabled ? (
        <div className="flex justify-end">
          <ViewSelector
            available={selection.available}
            selected={selection.layout.layout}
            layouts={layouts}
            onSelect={selection.select}
          />
        </div>
      ) : null}
      <ContextualPanels
        roots={graphRoots}
        registry={props.registry}
        taxonomy={props.taxonomy}
        layout={selection.layout}
        relationshipGraph={props.relationshipGraph}
        levelDimension={props.levelDimension}
        contextTitle={props.contextTitle}
      />
      <div
        data-layout={selection.layout.layout}
        data-view-source={selection.layout.source}
      >
        {content}
      </div>
      {detailEnabled ? (
        <DetailPanel
          entry={selectedEntry}
          registry={props.registry}
          taxonomy={props.taxonomy}
          governance={props.governance}
          sections={selection.layout.detailSections}
          onClose={closePanel}
        />
      ) : null}
    </div>
  );
}
