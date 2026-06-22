import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  KnowledgeNode,
  MetadataValue,
  RelationshipEdgeIndex,
  RelationshipEndpointIndex,
  RelationshipExplorerDefinition,
  TaxonomyDefinition
} from "@/types/content";

function strings(value: MetadataValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

function endpoint(
  node: KnowledgeNode,
  definition: RelationshipExplorerDefinition
): RelationshipEndpointIndex {
  const collection = definition.collections?.[node.collection];
  return {
    id: node.id,
    title: node.title,
    summary: node.summary,
    route: node.route,
    relatedRoute: `/related/${encodeURIComponent(node.id)}/`,
    collection: node.collection,
    collectionLabel: collection?.label ?? node.collection,
    collectionIcon: collection?.icon,
    collectionColor: collection?.color,
    categories: strings(node.attributes?.categories),
    lifecycle: strings(node.attributes?.lifecycle)[0],
    artifactKind: strings(node.attributes?.artifactKind)[0],
    project: strings(node.attributes?.project)[0],
    confidence: node.governance?.confidence,
    evidenceLevel: node.governance?.evidenceLevel
  };
}

export function buildRelationshipEdgeIndex(
  registry: KnowledgeNode[],
  taxonomy: TaxonomyDefinition,
  definition: RelationshipExplorerDefinition
): RelationshipEdgeIndex[] {
  const nodes = new Map(registry.map((node) => [node.id, node]));
  const relationshipDimension = resolveTaxonomyDimension(
    taxonomy,
    "relationshipKind"
  );

  return registry
    .flatMap((source) =>
      (source.relationships ?? []).flatMap((relationship) => {
        const target = nodes.get(relationship.target);
        if (!target) return [];
        const kind = resolveTaxonomyOption(
          relationshipDimension,
          relationship.type
        );
        return [
          {
            id: `${source.id}:${relationship.type}:${target.id}`,
            type: relationship.type,
            label: kind.label,
            icon: kind.icon,
            color: kind.color,
            order: kind.order ?? Number.MAX_SAFE_INTEGER,
            source: endpoint(source, definition),
            target: endpoint(target, definition)
          }
        ];
      })
    )
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.source.title.localeCompare(b.source.title) ||
        a.target.title.localeCompare(b.target.title)
    );
}
