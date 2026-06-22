import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  KnowledgeNode,
  MetadataValue,
  SearchDefinition,
  SearchIndexItem,
  TaxonomyDefinition
} from "@/types/content";

function strings(value: MetadataValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function readable(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function staticRoute(route: string) {
  return route === "/" || route.endsWith("/") ? route : `${route}/`;
}

export function buildSearchIndex(
  registry: KnowledgeNode[],
  taxonomy: TaxonomyDefinition,
  definition: SearchDefinition
): SearchIndexItem[] {
  const categoryDimension = resolveTaxonomyDimension(taxonomy, "categories");
  const lifecycleDimension = resolveTaxonomyDimension(taxonomy, "lifecycle");
  const artifactDimension = resolveTaxonomyDimension(taxonomy, "artifactKind");
  const relationshipDimension = resolveTaxonomyDimension(
    taxonomy,
    "relationshipKind"
  );
  const nodes = new Map(registry.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();

  for (const source of registry) {
    for (const relationship of source.relationships ?? []) {
      const kind = resolveTaxonomyOption(
        relationshipDimension,
        relationship.type
      );
      incoming.set(relationship.target, [
        ...(incoming.get(relationship.target) ?? []),
        relationship.type,
        kind.label,
        source.id,
        source.title
      ]);
    }
  }

  return registry
    .filter((node): node is KnowledgeNode & { route: string } => Boolean(node.route))
    .map((node) => {
      const categoryValues = strings(node.attributes?.categories);
      const lifecycleValue = strings(node.attributes?.lifecycle)[0];
      const artifactValue = strings(node.attributes?.artifactKind)[0];
      const artifact = artifactValue
        ? resolveTaxonomyOption(artifactDimension, artifactValue)
        : undefined;
      const collection = definition.collections?.[node.collection];
      const relationships = [
        ...(node.relationships ?? []).flatMap((relationship) => {
          const kind = resolveTaxonomyOption(
            relationshipDimension,
            relationship.type
          );
          const target = nodes.get(relationship.target);
          return [
            relationship.type,
            kind.label,
            relationship.target,
            target?.title ?? ""
          ];
        }),
        ...(incoming.get(node.id) ?? [])
      ];
      const categories = categoryValues.map((value) => {
        const option = resolveTaxonomyOption(categoryDimension, value);
        return {
          value,
          label: option.label,
          color: option.color,
          icon: option.icon
        };
      });
      const lifecycle = lifecycleValue
        ? resolveTaxonomyOption(lifecycleDimension, lifecycleValue)
        : undefined;

      return {
        id: node.id,
        title: node.title,
        summary: node.summary,
        route: staticRoute(node.route),
        collection: node.collection,
        typeLabel:
          artifact?.label ??
          collection?.label ??
          readable(node.collection),
        typeIcon: artifact?.icon ?? collection?.icon,
        typeColor: artifact?.color ?? collection?.color,
        categories,
        lifecycle: lifecycleValue
          ? {
              value: lifecycleValue,
              label: lifecycle?.label ?? readable(lifecycleValue),
              color: lifecycle?.color,
              icon: lifecycle?.icon
            }
          : undefined,
        search: {
          title: normalize(node.title),
          summary: normalize(node.summary),
          tags: normalize(strings(node.attributes?.tags).join(" ")),
          categories: normalize(
            categories.map((category) => category.label).join(" ")
          ),
          artifactKind: normalize(
            [artifactValue, artifact?.label].filter(Boolean).join(" ")
          ),
          lifecycle: normalize(
            [lifecycleValue, lifecycle?.label].filter(Boolean).join(" ")
          ),
          relationships: normalize(relationships.join(" "))
        }
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
