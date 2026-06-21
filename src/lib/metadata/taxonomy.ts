import type {
  TaxonomyDefinition,
  TaxonomyDimension,
  TaxonomyOption
} from "@/types/content";

export const neutralTaxonomyColor = "#64748b";
export const neutralTaxonomyIcon = "circle-help";

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function unknownTaxonomyOption(value: string): TaxonomyOption {
  return {
    value,
    label: humanize(value),
    icon: neutralTaxonomyIcon,
    color: neutralTaxonomyColor,
    order: Number.MAX_SAFE_INTEGER
  };
}

export function resolveTaxonomyDimension(
  taxonomy: TaxonomyDefinition,
  dimensionId: string
): TaxonomyDimension | undefined {
  return taxonomy.dimensions.find(
    (dimension) => dimension.id === dimensionId
  );
}

export function resolveTaxonomyOption(
  dimension: TaxonomyDimension | undefined,
  value: string
): TaxonomyOption {
  return (
    dimension?.options.find((option) => option.value === value) ??
    unknownTaxonomyOption(value)
  );
}
