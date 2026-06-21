import { RelationshipGraphPanel } from "@/components/relationships/relationship-graph-panel";
import { isRelationshipGraphEnabled } from "@/lib/views/panels";
import type {
  KnowledgeNode,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition
} from "@/types/content";

export function ContextualPanels({
  roots,
  registry,
  taxonomy,
  layout,
  relationshipGraph,
  levelDimension,
  contextTitle
}: {
  roots: KnowledgeNode[];
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  layout: ResolvedViewLayout;
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
  contextTitle?: string;
}) {
  if (
    !roots.length ||
    !isRelationshipGraphEnabled(
      layout,
      relationshipGraph,
      taxonomy,
      levelDimension
    )
  ) {
    return null;
  }

  return (
    <RelationshipGraphPanel
      roots={roots}
      registry={registry}
      taxonomy={taxonomy}
      config={relationshipGraph!}
      contextTitle={contextTitle}
    />
  );
}
