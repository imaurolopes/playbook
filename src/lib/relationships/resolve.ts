import type {
  KnowledgeNode,
  Relationship,
  TaxonomyDefinition,
  TaxonomyOption
} from "@/types/content";
import { resolveTaxonomyOption } from "@/lib/metadata/taxonomy";

export interface ResolvedRelationship {
  relationship: Relationship;
  target?: KnowledgeNode;
  source?: KnowledgeNode;
  definition?: TaxonomyOption;
}

export function getRelationshipDimension(taxonomy: TaxonomyDefinition) {
  return taxonomy.dimensions.find(
    (dimension) => dimension.id === "relationshipKind"
  );
}

export function resolveOutgoingRelationships(
  node: KnowledgeNode,
  registry: KnowledgeNode[],
  taxonomy: TaxonomyDefinition
): ResolvedRelationship[] {
  const dimension = getRelationshipDimension(taxonomy);

  return (node.relationships ?? []).map((relationship) => ({
    relationship,
    target: registry.find((candidate) => candidate.id === relationship.target),
    source: node,
    definition: resolveTaxonomyOption(dimension, relationship.type)
  }));
}

export function resolveIncomingRelationships(
  node: KnowledgeNode,
  registry: KnowledgeNode[],
  taxonomy: TaxonomyDefinition
): ResolvedRelationship[] {
  const dimension = getRelationshipDimension(taxonomy);

  return registry.flatMap((source) =>
    (source.relationships ?? [])
      .filter((relationship) => relationship.target === node.id)
      .map((relationship) => ({
        relationship,
        target: node,
        source,
        definition: resolveTaxonomyOption(dimension, relationship.type)
      }))
  );
}

export function groupRelationships(
  relationships: ResolvedRelationship[]
): Array<{
  id: string;
  label: string;
  icon?: string;
  color?: string;
  order: number;
  items: ResolvedRelationship[];
}> {
  const groups = new Map<
    string,
    {
      id: string;
      label: string;
      icon?: string;
      color?: string;
      order: number;
      items: ResolvedRelationship[];
    }
  >();

  for (const item of relationships) {
    if (item.definition?.showInDetail === false) continue;
    const id = item.relationship.type;
    const existing = groups.get(id);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(id, {
      id,
      label: item.definition?.label ?? id,
      icon: item.definition?.icon,
      color: item.definition?.color,
      order: item.definition?.order ?? Number.MAX_SAFE_INTEGER,
      items: [item]
    });
  }

  return [...groups.values()].sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label)
  );
}
