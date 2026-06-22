"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconToken } from "@/components/metadata/icon-token";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import { RelationshipGraph } from "@/components/relationships/relationship-graph";
import { buildRelationshipGraph } from "@/lib/relationships/graph";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  BreadcrumbDefinition,
  KnowledgeNode,
  RelationshipEdgeIndex,
  RelationshipEndpointIndex,
  RelationshipExplorerDefinition,
  RelationshipImpactGroupDefinition,
  TaxonomyDefinition
} from "@/types/content";

type Filters = Record<string, string>;

function options(
  edges: RelationshipEdgeIndex[],
  id: string,
  taxonomy: TaxonomyDefinition
): Array<{ value: string; label: string }> {
  const values = new Map<string, string>();
  const add = (value: string | undefined, label?: string) => {
    if (value) values.set(value, label ?? value);
  };
  for (const edge of edges) {
    if (id === "relationshipType") add(edge.type, edge.label);
    if (id === "sourceCollection")
      add(edge.source.collection, edge.source.collectionLabel);
    if (id === "targetCollection")
      add(edge.target.collection, edge.target.collectionLabel);
    if (id === "category")
      [...edge.source.categories, ...edge.target.categories].forEach((value) =>
        add(value)
      );
    if (id === "lifecycle") {
      add(edge.source.lifecycle);
      add(edge.target.lifecycle);
    }
    if (id === "artifactKind") {
      add(edge.source.artifactKind);
      add(edge.target.artifactKind);
    }
    if (id === "project") {
      add(edge.source.project);
      add(edge.target.project);
      if (edge.source.collection === "projects") add(edge.source.id, edge.source.title);
      if (edge.target.collection === "projects") add(edge.target.id, edge.target.title);
    }
    if (id === "confidence") {
      add(edge.source.confidence);
      add(edge.target.confidence);
    }
    if (id === "evidenceLevel") {
      add(edge.source.evidenceLevel);
      add(edge.target.evidenceLevel);
    }
  }
  const dimensionId =
    id === "category"
      ? "categories"
      : id === "artifactKind"
        ? "artifactKind"
        : id === "confidence"
          ? "confidence"
          : id === "evidenceLevel"
            ? "evidenceLevel"
            : id === "lifecycle"
              ? "lifecycle"
              : undefined;
  const dimension = dimensionId
    ? resolveTaxonomyDimension(taxonomy, dimensionId)
    : undefined;
  return [...values].map(([value, label]) => ({
    value,
    label: dimension ? resolveTaxonomyOption(dimension, value).label : label
  })).sort(
    (a, b) => a.label.localeCompare(b.label)
  );
}

function matches(edge: RelationshipEdgeIndex, id: string, value: string) {
  if (!value) return true;
  if (id === "relationshipType") return edge.type === value;
  if (id === "sourceCollection") return edge.source.collection === value;
  if (id === "targetCollection") return edge.target.collection === value;
  if (id === "category")
    return [...edge.source.categories, ...edge.target.categories].includes(value);
  if (id === "lifecycle")
    return edge.source.lifecycle === value || edge.target.lifecycle === value;
  if (id === "artifactKind")
    return edge.source.artifactKind === value || edge.target.artifactKind === value;
  if (id === "project")
    return (
      edge.source.project === value ||
      edge.target.project === value ||
      (edge.source.collection === "projects" && edge.source.id === value) ||
      (edge.target.collection === "projects" && edge.target.id === value)
    );
  if (id === "confidence")
    return edge.source.confidence === value || edge.target.confidence === value;
  if (id === "evidenceLevel")
    return (
      edge.source.evidenceLevel === value || edge.target.evidenceLevel === value
    );
  return true;
}

function Endpoint({ node }: { node: RelationshipEndpointIndex }) {
  const body = (
    <div>
      <p className="font-medium">{node.title}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {node.collectionLabel}
      </p>
    </div>
  );
  return node.route ? <Link href={node.route}>{body}</Link> : body;
}

function EdgeActions({
  edge,
  onGraph
}: {
  edge: RelationshipEdgeIndex;
  onGraph: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      {edge.source.route ? (
        <Link className="rounded-md border px-2 py-1" href={edge.source.route}>
          Open source node
        </Link>
      ) : null}
      {edge.target.route ? (
        <Link className="rounded-md border px-2 py-1" href={edge.target.route}>
          Open target node
        </Link>
      ) : null}
      <Link className="rounded-md border px-2 py-1" href={edge.source.relatedRoute}>
        Open related view
      </Link>
      <button
        type="button"
        className="rounded-md border px-2 py-1"
        onClick={() => onGraph(edge.source.id)}
      >
        Open graph context
      </button>
    </div>
  );
}

function EdgeRow({
  edge,
  onGraph
}: {
  edge: RelationshipEdgeIndex;
  onGraph: (id: string) => void;
}) {
  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3"><Endpoint node={edge.source} /></td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          style={{ color: edge.color, borderColor: `${edge.color ?? "#64748b"}55` }}
        >
          <IconToken token={edge.icon} className="size-3.5" />
          {edge.label}
        </span>
      </td>
      <td className="px-4 py-3"><Endpoint node={edge.target} /></td>
      <td className="px-4 py-3"><EdgeActions edge={edge} onGraph={onGraph} /></td>
    </tr>
  );
}

function TableView({
  edges,
  onGraph
}: {
  edges: RelationshipEdgeIndex[];
  onGraph: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[60rem] text-left text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Relationship</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>{edges.map((edge) => <EdgeRow key={edge.id} edge={edge} onGraph={onGraph} />)}</tbody>
      </table>
    </div>
  );
}

function GroupedView({
  edges,
  groupBy,
  onGraph
}: {
  edges: RelationshipEdgeIndex[];
  groupBy: "relationship-type" | "source" | "target";
  onGraph: (id: string) => void;
}) {
  const grouped = new Map<string, { label: string; order: number; edges: RelationshipEdgeIndex[] }>();
  for (const edge of edges) {
    const key =
      groupBy === "relationship-type"
        ? edge.type
        : groupBy === "source"
          ? edge.source.id
          : edge.target.id;
    const label =
      groupBy === "relationship-type"
        ? edge.label
        : groupBy === "source"
          ? edge.source.title
          : edge.target.title;
    const current = grouped.get(key) ?? { label, order: groupBy === "relationship-type" ? edge.order : 0, edges: [] };
    current.edges.push(edge);
    grouped.set(key, current);
  }
  return (
    <div className="space-y-5">
      {[...grouped.entries()]
        .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label))
        .map(([key, group]) => (
          <section key={key} className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{group.label}</h2>
              <span className="rounded-full border px-2 py-0.5 text-xs">{group.edges.length}</span>
            </div>
            <TableView edges={group.edges} onGraph={onGraph} />
          </section>
        ))}
    </div>
  );
}

function ImpactGroup({
  group,
  nodeId,
  edges,
  onGraph
}: {
  group: RelationshipImpactGroupDefinition;
  nodeId: string;
  edges: RelationshipEdgeIndex[];
  onGraph: (id: string) => void;
}) {
  const matches = edges.filter(
    (edge) =>
      group.relationshipTypes.includes(edge.type) &&
      (group.direction === "incoming"
        ? edge.target.id === nodeId
        : edge.source.id === nodeId)
  );
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">{group.label}</h2>
      <div className="mt-4">
        {matches.length ? (
          <TableView edges={matches} onGraph={onGraph} />
        ) : (
          <p className="text-sm text-muted-foreground">No matching relationships.</p>
        )}
      </div>
    </section>
  );
}

export function RelationshipExplorer({
  edges,
  registry,
  taxonomy,
  definition,
  breadcrumbs
}: {
  edges: RelationshipEdgeIndex[];
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  definition: RelationshipExplorerDefinition;
  breadcrumbs?: BreadcrumbDefinition;
}) {
  const [filters, setFilters] = useState<Filters>({});
  const [view, setView] = useState(definition.defaultView);
  const [impactNode, setImpactNode] = useState(registry.find((node) => node.relationships?.length)?.id ?? "");
  const [graphNode, setGraphNode] = useState<string>();
  const filtered = useMemo(
    () =>
      edges.filter((edge) =>
        definition.filters.every((filter) =>
          matches(edge, filter.id, filters[filter.id] ?? "")
        )
      ),
    [definition.filters, edges, filters]
  );
  const graphRoot = graphNode
    ? registry.find((node) => node.id === graphNode)
    : undefined;
  const graph = graphRoot
    ? buildRelationshipGraph([graphRoot], registry, taxonomy, 1)
    : undefined;

  return (
    <div className="space-y-8">
      <ContextBreadcrumbs config={breadcrumbs} context="local" items={[{ label: "Relationship Explorer" }]} />
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Relationship registry</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Relationship Explorer</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Explore dependencies, production flows, support links, provenance, and impact across registered Playbook knowledge.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Relationships</p><p className="mt-1 text-3xl font-semibold">{edges.length}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Connected nodes</p><p className="mt-1 text-3xl font-semibold">{new Set(edges.flatMap((edge) => [edge.source.id, edge.target.id])).size}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Relationship kinds</p><p className="mt-1 text-3xl font-semibold">{new Set(edges.map((edge) => edge.type)).size}</p></div>
      </div>

      <section className="rounded-2xl border bg-card p-5">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {definition.filters.map((filter) => (
            <label key={filter.id} className="text-xs font-medium">
              {filter.label}
              <select
                value={filters[filter.id] ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, [filter.id]: event.target.value }))}
                className="mt-1.5 w-full rounded-lg border bg-background px-2.5 py-2 text-xs"
              >
                <option value="">All</option>
                {options(edges, filter.id, taxonomy).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} matching relationships</span>
          <button type="button" onClick={() => setFilters({})} className="rounded-lg border px-3 py-1.5">Clear filters</button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {definition.views.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setView(candidate.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${view === candidate.id ? "bg-primary text-primary-foreground" : ""}`}
          >
            <IconToken token={candidate.icon} className="size-3.5" />
            {candidate.label}
          </button>
        ))}
      </div>

      {graph && graphRoot ? (
        <section className="rounded-2xl border bg-muted/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Graph context: {graphRoot.title}</h2>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => setGraphNode(undefined)}>Close</button>
          </div>
          <RelationshipGraph model={graph} compact={false} contextTitle={graphRoot.title} />
        </section>
      ) : null}

      {view === "table" ? <TableView edges={filtered} onGraph={setGraphNode} /> : null}
      {view === "relationship-type" ? <GroupedView edges={filtered} groupBy="relationship-type" onGraph={setGraphNode} /> : null}
      {view === "source" ? <GroupedView edges={filtered} groupBy="source" onGraph={setGraphNode} /> : null}
      {view === "target" ? <GroupedView edges={filtered} groupBy="target" onGraph={setGraphNode} /> : null}
      {view === "impact" ? (
        <div className="space-y-5">
          <label className="block max-w-xl text-sm font-medium">
            Impact node
            <select value={impactNode} onChange={(event) => setImpactNode(event.target.value)} className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5">
              {registry.filter((node) => edges.some((edge) => edge.source.id === node.id || edge.target.id === node.id)).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
            </select>
          </label>
          {definition.impact.groups.map((group) => (
            <ImpactGroup key={group.id} group={group} nodeId={impactNode} edges={filtered} onGraph={setGraphNode} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
