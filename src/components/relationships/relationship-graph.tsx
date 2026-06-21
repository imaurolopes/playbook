"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { IconToken } from "@/components/metadata/icon-token";
import type {
  RelationshipGraphEdge,
  RelationshipGraphModel
} from "@/lib/relationships/graph";

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

function classifyEdges(model: RelationshipGraphModel) {
  const roots = new Set(model.roots.map((node) => node.id));
  const incoming: RelationshipGraphEdge[] = [];
  const outgoing: RelationshipGraphEdge[] = [];

  for (const edge of model.edges) {
    if (roots.has(edge.target.id) && !roots.has(edge.source.id)) {
      incoming.push(edge);
    } else {
      outgoing.push(edge);
    }
  }
  return { incoming, outgoing };
}

function RelatedNode({
  edge,
  direction,
  x,
  y
}: {
  edge: RelationshipGraphEdge;
  direction: "incoming" | "outgoing";
  x: number;
  y: number;
}) {
  const node = direction === "incoming" ? edge.source : edge.target;
  const content = (
    <div className="w-56 rounded-xl border bg-background px-3 py-2 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg">
      <p className="truncate text-sm font-semibold">{node.title}</p>
      <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
        {node.collection}
      </p>
    </div>
  );

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={{ left: x, top: y }}
    >
      {node.route ? <Link href={node.route}>{content}</Link> : content}
    </div>
  );
}

function EdgeBadge({
  edge,
  x,
  y
}: {
  edge: RelationshipGraphEdge;
  x: number;
  y: number;
}) {
  const color = edge.definition.color ?? "#64748b";
  return (
    <div
      className="absolute z-20 flex max-w-36 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-background px-2 py-1 text-[9px] font-semibold shadow-sm"
      style={{
        left: x,
        top: y,
        borderColor: colorWithAlpha(color, "77"),
        color
      }}
    >
      <IconToken token={edge.definition.icon} className="size-3 shrink-0" />
      <span className="truncate">{edge.definition.label}</span>
    </div>
  );
}

function ExpandedGraph({
  model,
  contextTitle
}: {
  model: RelationshipGraphModel;
  contextTitle: string;
}) {
  const { incoming, outgoing } = classifyEdges(model);
  const height = Math.max(
    420,
    Math.max(incoming.length, outgoing.length) * 96 + 96
  );
  const center = { x: 500, y: height / 2 };
  const sideY = (index: number, count: number) =>
    ((index + 1) * height) / (count + 1);

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[760px]" style={{ width: 1000, height }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          viewBox={`0 0 1000 ${height}`}
          preserveAspectRatio="none"
        >
          {incoming.map((edge, index) => {
            const y = sideY(index, incoming.length);
            const color = edge.definition.color ?? "#64748b";
            return (
              <path
                key={edge.id}
                d={`M 252 ${y} C 340 ${y}, 365 ${center.y}, 416 ${center.y}`}
                fill="none"
                stroke={colorWithAlpha(color, "99")}
                strokeWidth="2"
              />
            );
          })}
          {outgoing.map((edge, index) => {
            const y = sideY(index, outgoing.length);
            const color = edge.definition.color ?? "#64748b";
            return (
              <path
                key={edge.id}
                d={`M 584 ${center.y} C 635 ${center.y}, 660 ${y}, 748 ${y}`}
                fill="none"
                stroke={colorWithAlpha(color, "99")}
                strokeWidth="2"
              />
            );
          })}
        </svg>

        <div
          className="absolute z-20 flex w-48 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl border-2 border-primary/60 bg-background px-5 py-5 text-center shadow-xl ring-8 ring-primary/5"
          style={{ left: center.x, top: center.y }}
        >
          <span className="mb-2 grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
            <IconToken token="git-branch" className="size-4" />
          </span>
          <strong className="line-clamp-2 text-sm">{contextTitle}</strong>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Current context
          </span>
        </div>

        {incoming.map((edge, index) => {
          const y = sideY(index, incoming.length);
          return (
            <div key={edge.id}>
              <RelatedNode edge={edge} direction="incoming" x={140} y={y} />
              <EdgeBadge edge={edge} x={335} y={(y + center.y) / 2} />
            </div>
          );
        })}
        {outgoing.map((edge, index) => {
          const y = sideY(index, outgoing.length);
          return (
            <div key={edge.id}>
              <RelatedNode edge={edge} direction="outgoing" x={860} y={y} />
              <EdgeBadge edge={edge} x={665} y={(y + center.y) / 2} />
            </div>
          );
        })}

        <div className="absolute left-5 top-4 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ArrowDownLeft className="size-3.5" />
          Incoming
        </div>
        <div className="absolute right-5 top-4 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Outgoing
          <ArrowUpRight className="size-3.5" />
        </div>
      </div>
    </div>
  );
}

function CompactGraph({
  model,
  contextTitle
}: {
  model: RelationshipGraphModel;
  contextTitle: string;
}) {
  const { incoming, outgoing } = classifyEdges(model);
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-xl border bg-background p-3 text-center sm:text-right">
        <p className="text-xl font-semibold">{incoming.length}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Incoming
        </p>
      </div>
      <div className="rounded-2xl border-2 border-primary/50 bg-background px-5 py-3 text-center shadow-md">
        <p className="max-w-48 truncate text-sm font-semibold">{contextTitle}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {model.nodes.length} nodes
        </p>
      </div>
      <div className="rounded-xl border bg-background p-3 text-center sm:text-left">
        <p className="text-xl font-semibold">{outgoing.length}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Outgoing
        </p>
      </div>
    </div>
  );
}

export function RelationshipGraph({
  model,
  compact,
  contextTitle
}: {
  model: RelationshipGraphModel;
  compact: boolean;
  contextTitle: string;
}) {
  if (!model.edges.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No incoming or outgoing relationships are available for this context.
      </div>
    );
  }

  return compact ? (
    <CompactGraph model={model} contextTitle={contextTitle} />
  ) : (
    <ExpandedGraph model={model} contextTitle={contextTitle} />
  );
}
