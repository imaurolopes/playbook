import type {
  Entry,
  TaxonomyDefinition,
  TaxonomyOption
} from "@/types/content";
import { resolveTaxonomyOption } from "@/lib/metadata/taxonomy";

export interface Presentation {
  labels: string[];
  color?: string;
  icon?: string;
}

export function resolvePresentation(
  entry: Entry,
  taxonomy: TaxonomyDefinition
): Presentation {
  const labels: string[] = [];
  let selected: TaxonomyOption | undefined;

  for (const dimension of taxonomy.dimensions) {
    const rawValue = entry.attributes?.[dimension.id];
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      if (typeof value !== "string") continue;
      const option = resolveTaxonomyOption(dimension, value);
      labels.push(option.label);
      selected ??= option;
    }
  }

  return {
    labels,
    color: selected?.color,
    icon: selected?.icon
  };
}
