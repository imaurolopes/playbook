"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { IconToken } from "@/components/metadata/icon-token";
import type {
  RelationshipGraphEdge,
  RelationshipGraphModel
} from "@/lib/relationships/graph";

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

function NodeCard({
  title,
  collection,
  route,
  emphasis = false
}: {
  title: string;
  collection: string;
  route?: string;
  emphasis?: boolean;
}) {
  const content = (
    <div
      className={`relative z-10 min-w-0 rounded-xl border bg-background px-3 py-2 shadow-sm ${
        emphasis ? "border-primary/50 ring-2 ring-primary/10" : ""
      }`}
    >
      <p className="truncate text-sm font-medium">{title}</p>
      <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
        {collection}
      </p>
    </div>
  );

  return route ? <Link href={route}>{content}</Link> : content;
}

function Connection({
  edge,
  rootIds
}: {
  edge: RelationshipGraphEdge;
  rootIds: Set<string>;
}) {
  const color = edge.definition.color ?? "#64748b";
  return (
    <div className="relative grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)]">
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden size-full md:block"
        preserveAspectRatio="none"
      >
        <line
          x1="27%"
          y1="50%"
          x2="73%"
          y2="50%"
          stroke={colorWithAlpha(color, "88")}
          strokeWidth="2"
          strokeDasharray="5 5"
        />
      </svg>
      <NodeCard
        title={edge.source.title}
        collection={edge.source.collection}
        route={edge.source.route}
        emphasis={rootIds.has(edge.source.id)}
      />
      <div
        className="relative z-10 flex items-center justify-center gap-1.5 rounded-full border bg-background px-2 py-1 text-center text-[10px] font-semibold"
        style={{
          borderColor: colorWithAlpha(color, "66"),
          color
        }}
      >
        <IconToken token={edge.definition.icon} className="size-3" />
        <span className="truncate">{edge.definition.label}</span>
        <ArrowRight className="size-3 shrink-0" />
      </div>
      <NodeCard
        title={edge.target.title}
        collection={edge.target.collection}
        route={edge.target.route}
        emphasis={rootIds.has(edge.target.id)}
      />
    </div>
  );
}

export function RelationshipGraph({
  model,
  compact
}: {
  model: RelationshipGraphModel;
  compact: boolean;
}) {
  const rootIds = new Set(model.roots.map((node) => node.id));

  if (!model.edges.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No incoming or outgoing relationships are available for this context.
      </div>
    );
  }

  if (compact) {
    const definitions = new Map(
      model.edges.map((edge) => [edge.relationshipType, edge.definition])
    );
    return (
      <div className="flex flex-wrap items-center gap-2">
        {[...definitions.entries()].map(([type, definition]) => {
          const count = model.edges.filter(
            (edge) => edge.relationshipType === type
          ).length;
          const color = definition.color ?? "#64748b";
          return (
            <span
              key={type}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              style={{
                borderColor: colorWithAlpha(color, "66"),
                color
              }}
            >
              <IconToken token={definition.icon} className="size-3.5" />
              {definition.label}
              <strong>{count}</strong>
            </span>
          );
        })}
        <span className="text-xs text-muted-foreground">
          {model.nodes.length} nodes · {model.edges.length} relationships
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {model.edges.map((edge) => (
        <Connection key={edge.id} edge={edge} rootIds={rootIds} />
      ))}
    </div>
  );
}
