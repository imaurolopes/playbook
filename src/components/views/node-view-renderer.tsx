"use client";

import type { ReactNode } from "react";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import { ContextualPanels } from "@/components/views/contextual-panels";
import { useLayoutSelection } from "@/components/views/use-layout-selection";
import { ViewLayout } from "@/components/views/view-layout";
import { ViewSelector } from "@/components/views/view-selector";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption,
  unknownTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  BreadcrumbDefinition,
  Entry,
  KnowledgeNode,
  MetadataValue,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition,
  ViewDefinition,
  ViewEngineDefinition,
  ViewSelectorDefinition
} from "@/types/content";

function values(value: MetadataValue | undefined) {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.filter(
    (candidate): candidate is string => typeof candidate === "string"
  );
}

export function NodeViewRenderer({
  entry,
  registry,
  taxonomy,
  view,
  layout,
  categoryAttribute,
  categoryRouteTemplate,
  relationshipGraph,
  levelDimension,
  selector,
  layouts,
  breadcrumbs,
  detailContent
}: {
  entry: Entry;
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  layout: ResolvedViewLayout;
  categoryAttribute?: string;
  categoryRouteTemplate?: string;
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
  selector?: ViewSelectorDefinition;
  layouts?: ViewEngineDefinition["layouts"];
  breadcrumbs?: BreadcrumbDefinition;
  detailContent: ReactNode;
}) {
  const layoutDefinitions = layouts ?? {};
  const selection = useLayoutSelection(layout, selector, layoutDefinitions);
  const selectorEnabled =
    selection.layout.selectorEnabled ?? selector?.enabled ?? false;
  const root = registry.find((node) => node.id === entry.id);
  const categoryValue = categoryAttribute
    ? values(entry.attributes?.[categoryAttribute])[0]
    : undefined;
  const categoryDimension = categoryAttribute
    ? resolveTaxonomyDimension(taxonomy, categoryAttribute)
    : undefined;
  const category = categoryValue
    ? resolveTaxonomyOption(categoryDimension, categoryValue)
    : unknownTaxonomyOption(entry.id);
  const categoryRoute =
    categoryValue && categoryRouteTemplate
      ? categoryRouteTemplate.replace(
          "{value}",
          encodeURIComponent(categoryValue)
        )
      : undefined;

  return (
    <div className="space-y-8">
      <ContextBreadcrumbs
        config={breadcrumbs}
        context="detail"
        items={[
          ...(categoryValue
            ? [{ label: category.label, href: categoryRoute }]
            : []),
          { label: entry.title }
        ]}
      />

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
        roots={root ? [root] : []}
        registry={registry}
        taxonomy={taxonomy}
        layout={selection.layout}
        relationshipGraph={relationshipGraph}
        levelDimension={levelDimension}
        contextTitle={entry.title}
      />

      <div
        data-layout={selection.layout.layout}
        data-view-source={selection.layout.source}
      >
        {selection.layout.layout === "detail" ? (
          detailContent
        ) : (
          <ViewLayout
            entries={[entry]}
            category={category}
            taxonomy={taxonomy}
            view={view}
            registry={registry}
            layout={selection.layout}
            contextTitle={entry.title}
          />
        )}
      </div>
    </div>
  );
}
