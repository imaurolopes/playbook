import { EntryRenderer } from "@/components/renderers/entry-renderer";
import { ViewLayout } from "@/components/views/view-layout";
import { ContextualPanels } from "@/components/views/contextual-panels";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption,
  unknownTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  Entry,
  KnowledgeNode,
  MetadataValue,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition,
  ViewDefinition
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
  relationshipGraph,
  levelDimension
}: {
  entry: Entry;
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  layout: ResolvedViewLayout;
  categoryAttribute?: string;
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
}) {
  const root = registry.find((node) => node.id === entry.id);

  if (layout.layout === "detail") {
    return (
      <div
        data-layout={layout.layout}
        data-view-source={layout.source}
        className="space-y-8"
      >
        <ContextualPanels
          roots={root ? [root] : []}
          registry={registry}
          taxonomy={taxonomy}
          layout={layout}
          relationshipGraph={relationshipGraph}
          levelDimension={levelDimension}
        />
        <EntryRenderer entry={entry} sections={layout.detailSections} />
      </div>
    );
  }

  const categoryValue = categoryAttribute
    ? values(entry.attributes?.[categoryAttribute])[0]
    : undefined;
  const categoryDimension = categoryAttribute
    ? resolveTaxonomyDimension(taxonomy, categoryAttribute)
    : undefined;
  const category = categoryValue
    ? resolveTaxonomyOption(categoryDimension, categoryValue)
    : unknownTaxonomyOption(entry.id);

  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {layout.layout} · {layout.source}
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">{entry.title}</h1>
        {entry.summary ? (
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
            {entry.summary}
          </p>
        ) : null}
      </header>
      <ViewLayout
        entries={[entry]}
        category={category}
        taxonomy={taxonomy}
        view={view}
        registry={registry}
        layout={layout}
        relationshipGraph={relationshipGraph}
        levelDimension={levelDimension}
      />
    </div>
  );
}
