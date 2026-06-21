import { resolveTaxonomyDimension } from "@/lib/metadata/taxonomy";
import type {
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition
} from "@/types/content";

export function isRelationshipGraphEnabled(
  layout: ResolvedViewLayout,
  config: RelationshipGraphPanelDefinition | undefined,
  taxonomy: TaxonomyDefinition,
  levelDimensionId?: string
) {
  if (!layout.enabledPanels?.includes("relationshipGraph") || !config) {
    return false;
  }

  if (!config.enabledFromLevel) return true;
  if (!layout.level) return false;

  const levelDimension = resolveTaxonomyDimension(
    taxonomy,
    levelDimensionId ?? ""
  );
  const current = levelDimension?.options.find(
    (option) => option.value === layout.level
  );
  const threshold = levelDimension?.options.find(
    (option) => option.value === config.enabledFromLevel
  );

  if (!current || !threshold) return false;
  return (
    (current.order ?? Number.MAX_SAFE_INTEGER) >=
    (threshold.order ?? Number.MAX_SAFE_INTEGER)
  );
}
