"use client";

import { useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Network
} from "lucide-react";
import { RelationshipGraph } from "@/components/relationships/relationship-graph";
import { useGraphPanelState } from "@/components/relationships/use-graph-panel-state";
import { buildRelationshipGraph } from "@/lib/relationships/graph";
import type {
  KnowledgeNode,
  RelationshipGraphPanelDefinition,
  TaxonomyDefinition
} from "@/types/content";

export function RelationshipGraphPanel({
  roots,
  registry,
  taxonomy,
  config
}: {
  roots: KnowledgeNode[];
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  config: RelationshipGraphPanelDefinition;
}) {
  const collapsible = config.collapsible !== false;
  const [state, setState] = useGraphPanelState(
    config.defaultState,
    collapsible
  );
  const model = useMemo(
    () =>
      buildRelationshipGraph(
        roots,
        registry,
        taxonomy,
        Math.max(1, config.depth ?? 1)
      ),
    [config.depth, registry, roots, taxonomy]
  );

  return (
    <section
      data-panel="relationshipGraph"
      data-panel-state={state}
      className="overflow-hidden rounded-2xl border bg-muted/10"
    >
      <header className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
            <Network className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Relationship graph</h2>
            <p className="truncate text-xs text-muted-foreground">
              Incoming and outgoing context · depth {config.depth ?? 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {state !== "compact" ? (
            <button
              type="button"
              onClick={() => setState("compact")}
              className="rounded-lg border bg-background p-2 text-muted-foreground transition hover:text-foreground"
              aria-label="Show compact relationship graph"
              title="Compact"
            >
              <Minimize2 className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setState("expanded")}
              className="rounded-lg border bg-background p-2 text-muted-foreground transition hover:text-foreground"
              aria-label="Expand relationship graph"
              title="Expand"
            >
              <Maximize2 className="size-4" />
            </button>
          )}
          {collapsible ? (
            <button
              type="button"
              onClick={() =>
                setState(state === "collapsed" ? "compact" : "collapsed")
              }
              className="rounded-lg border bg-background p-2 text-muted-foreground transition hover:text-foreground"
              aria-label={
                state === "collapsed"
                  ? "Open relationship graph"
                  : "Collapse relationship graph"
              }
              title={state === "collapsed" ? "Open" : "Collapse"}
            >
              {state === "collapsed" ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
            </button>
          ) : null}
        </div>
      </header>

      {state !== "collapsed" ? (
        <div className="border-t px-4 py-4">
          <RelationshipGraph model={model} compact={state === "compact"} />
        </div>
      ) : null}
    </section>
  );
}
