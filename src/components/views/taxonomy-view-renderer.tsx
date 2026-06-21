"use client";

import { VisualHome } from "@/components/home/visual-home";
import { ContextualPanels } from "@/components/views/contextual-panels";
import { useLayoutSelection } from "@/components/views/use-layout-selection";
import { ViewSelector } from "@/components/views/view-selector";
import type {
  Entry,
  KnowledgeNode,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition,
  ViewDefinition,
  ViewEngineDefinition,
  ViewSelectorDefinition
} from "@/types/content";

export function TaxonomyViewRenderer({
  entries,
  taxonomy,
  view,
  layout,
  registry,
  relationshipGraph,
  levelDimension,
  selector,
  layouts
}: {
  entries: Entry[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  layout: ResolvedViewLayout;
  registry: KnowledgeNode[];
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
  selector?: ViewSelectorDefinition;
  layouts?: ViewEngineDefinition["layouts"];
}) {
  const layoutDefinitions = layouts ?? {};
  const selection = useLayoutSelection(layout, selector, layoutDefinitions);
  const selectorEnabled =
    selection.layout.selectorEnabled ?? selector?.enabled ?? false;
  const graphRoots = entries.flatMap((entry) => {
    const node = registry.find((candidate) => candidate.id === entry.id);
    return node ? [node] : [];
  });

  return (
    <div
      data-layout={selection.layout.layout}
      data-view-source={selection.layout.source}
      className="space-y-8"
    >
      {selectorEnabled ? (
        <div className="flex justify-end">
          <ViewSelector
            available={selection.available}
            selected={selection.layout.layout}
            layouts={layoutDefinitions}
            onSelect={selection.select}
          />
        </div>
      ) : null}
      <ContextualPanels
        roots={graphRoots}
        registry={registry}
        taxonomy={taxonomy}
        layout={selection.layout}
        relationshipGraph={relationshipGraph}
        levelDimension={levelDimension}
        contextTitle={view.label}
      />
      {selection.layout.layout === "periodic" ? (
        <VisualHome entries={entries} taxonomy={taxonomy} view={view} />
      ) : (
        <div className="rounded-3xl border border-dashed p-12 text-center">
          <h1 className="text-2xl font-semibold">{view.label}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            The metadata-driven view engine selected the “
            {selection.layout.layout}” layout. This taxonomy surface currently
            provides its complete renderer for the periodic layout.
          </p>
        </div>
      )}
    </div>
  );
}
