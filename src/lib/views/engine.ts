import type {
  MetadataValue,
  ResolvedViewLayout,
  ViewEngineDefinition,
  ViewLayoutSettings,
  ViewsDefinition
} from "@/types/content";

export interface ViewResolutionContext {
  nodeId?: string;
  level?: string;
  categories?: string[];
  attributes?: Record<string, MetadataValue>;
}

function stringValues(value: MetadataValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

function contextLevel(
  engine: ViewEngineDefinition,
  context: ViewResolutionContext
) {
  if (context.level) return context.level;
  const attribute = engine.selectors?.levelAttribute;
  if (!attribute) return undefined;
  const values = stringValues(context.attributes?.[attribute]);
  return values[0];
}

function contextCategories(
  engine: ViewEngineDefinition,
  context: ViewResolutionContext
) {
  if (context.categories?.length) return context.categories;
  const attribute = engine.selectors?.categoryAttribute;
  return attribute ? stringValues(context.attributes?.[attribute]) : [];
}

function enabledLayout(
  engine: ViewEngineDefinition,
  settings: ViewLayoutSettings
) {
  const definition = engine.layouts?.[settings.layout];
  return definition && definition.enabled !== false;
}

function withLayoutDefinition(
  engine: ViewEngineDefinition,
  settings: ViewLayoutSettings
): ViewLayoutSettings {
  return {
    ...engine.layouts?.[settings.layout],
    ...settings
  };
}

export function resolveViewLayout(
  views: ViewsDefinition,
  context: ViewResolutionContext
): ResolvedViewLayout {
  const engine = views.viewEngine;
  const level = contextLevel(engine, context);
  const categories = contextCategories(engine, context);
  const levelDefault = level ? engine.defaults?.level?.[level] : undefined;
  const categoryMatch = categories
    .map((category) => ({
      category,
      settings: level
        ? engine.overrides?.categories?.[category]?.[level]
        : undefined
    }))
    .find((candidate) => candidate.settings);
  const nodeOverride = context.nodeId
    ? engine.overrides?.nodes?.[context.nodeId]
    : undefined;

  const merged: ViewLayoutSettings = {
    ...engine.fallback,
    ...levelDefault,
    ...categoryMatch?.settings,
    ...nodeOverride
  };
  const source: ResolvedViewLayout["source"] = nodeOverride
    ? "node"
    : categoryMatch
      ? "category"
      : levelDefault
        ? "level"
        : "fallback";
  const resolved = withLayoutDefinition(engine, merged);

  if (!enabledLayout(engine, resolved)) {
    const fallback = withLayoutDefinition(engine, engine.fallback);
    return {
      ...fallback,
      source: "fallback",
      level
    };
  }

  return {
    ...resolved,
    source,
    matchedCategory: categoryMatch?.category,
    level
  };
}
