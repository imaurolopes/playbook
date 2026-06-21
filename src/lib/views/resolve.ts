import type {
  Entry,
  MetadataValue,
  TaxonomyDefinition,
  TaxonomyOption,
  ViewDefinition,
  ViewsDefinition
} from "@/types/content";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";

interface RouteMatch {
  option: TaxonomyOption;
  parameter: string;
  sourceView: ViewDefinition;
  localView: ViewDefinition;
}

function normalizeRoute(route: string) {
  return `/${route.replace(/^\/|\/$/g, "")}`;
}

function templatePattern(template: string) {
  const parameters: string[] = [];
  const escaped = normalizeRoute(template)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{([^}]+)\\\}/g, (_, parameter: string) => {
      parameters.push(parameter);
      return "([^/]+)";
    });

  return {
    parameters,
    pattern: new RegExp(`^${escaped}$`)
  };
}

function asValues(value: MetadataValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

function getPath(entry: Entry, path: string): MetadataValue | undefined {
  const parts = path.split(".");
  let current: unknown = entry;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current as MetadataValue | undefined;
}

export function getTaxonomyViewRoutes(
  views: ViewsDefinition,
  taxonomy: TaxonomyDefinition
): string[] {
  return views.views.flatMap((view) => {
    if (view.source !== "taxonomy" || !view.taxonomy || !view.routeTemplate) {
      return [];
    }

    const dimension = resolveTaxonomyDimension(taxonomy, view.taxonomy);

    return (dimension?.options ?? []).map((option) =>
      normalizeRoute(
        view.routeTemplate!.replace(`{value}`, encodeURIComponent(option.value))
      )
    );
  });
}

export function resolveTaxonomyViewRoute(
  route: string,
  views: ViewsDefinition,
  taxonomy: TaxonomyDefinition
): RouteMatch | undefined {
  const normalized = normalizeRoute(route);

  for (const sourceView of views.views) {
    if (
      sourceView.source !== "taxonomy" ||
      !sourceView.taxonomy ||
      !sourceView.routeTemplate ||
      !sourceView.localView
    ) {
      continue;
    }

    const { parameters, pattern } = templatePattern(sourceView.routeTemplate);
    const match = normalized.match(pattern);
    if (!match) continue;

    const valueIndex = parameters.indexOf("value");
    if (valueIndex < 0) continue;

    const parameter = decodeURIComponent(match[valueIndex + 1]);
    const dimension = resolveTaxonomyDimension(taxonomy, sourceView.taxonomy);
    const option = dimension
      ? resolveTaxonomyOption(dimension, parameter)
      : undefined;
    const localView = views.views.find(
      (candidate) => candidate.id === sourceView.localView
    );

    if (option && localView) {
      return { option, parameter, sourceView, localView };
    }
  }

  return undefined;
}

export function filterEntriesForRoute(
  entries: Entry[],
  view: ViewDefinition,
  parameters: Record<string, string>
) {
  if (!view.routeFilter) return entries;

  const expected = parameters[view.routeFilter.parameter];
  if (!expected) return entries;

  return entries.filter((entry) =>
    asValues(getPath(entry, view.routeFilter!.path)).includes(expected)
  );
}
