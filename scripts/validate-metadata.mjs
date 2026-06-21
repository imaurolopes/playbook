import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const taxonomyPath = path.join(contentRoot, "system", "taxonomy.yaml");
const taxonomy = parse(fs.readFileSync(taxonomyPath, "utf8"));
const dimensions = new Map(
  (taxonomy.dimensions ?? []).map((dimension) => [
    dimension.id,
    {
      ...dimension,
      values: new Set((dimension.options ?? []).map((option) => option.value))
    }
  ])
);
const errors = [];

function listFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const itemPath = path.join(directory, item.name);
    return item.isDirectory()
      ? listFiles(itemPath, pattern)
      : pattern.test(item.name)
        ? [itemPath]
        : [];
  });
}

function relative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function valuesOf(value) {
  return Array.isArray(value) ? value : [value];
}

function report(filePath, field, value, dimensionId) {
  errors.push(
    `${relative(filePath)}: ${field} references unknown ${dimensionId} value "${value}"`
  );
}

function validateAttributes(filePath, attributes) {
  if (!attributes || typeof attributes !== "object") return;

  for (const [dimensionId, value] of Object.entries(attributes)) {
    const dimension = dimensions.get(dimensionId);
    if (!dimension) continue;

    for (const candidate of valuesOf(value)) {
      if (
        typeof candidate === "string" &&
        !dimension.values.has(candidate)
      ) {
        report(
          filePath,
          `attributes.${dimensionId}`,
          candidate,
          dimensionId
        );
      }
    }
  }
}

function validateRelationships(filePath, relationships) {
  const dimension = dimensions.get("relationshipKind");
  if (!dimension) return;

  for (const [index, relationship] of (relationships ?? []).entries()) {
    if (
      typeof relationship?.type === "string" &&
      !dimension.values.has(relationship.type)
    ) {
      report(
        filePath,
        `relationships[${index}].type`,
        relationship.type,
        "relationshipKind"
      );
    }
  }
}

for (const filePath of listFiles(contentRoot, /\.ya?ml$/i)) {
  if (filePath === taxonomyPath) continue;
  const document = parse(fs.readFileSync(filePath, "utf8")) ?? {};
  validateAttributes(filePath, document.attributes);
  validateRelationships(filePath, document.relationships);
}

const navigationPath = path.join(contentRoot, "system", "navigation.yaml");
const navigation = parse(fs.readFileSync(navigationPath, "utf8"));

function validateNavigation(items) {
  for (const item of items ?? []) {
    if (item.taxonomy && !dimensions.has(item.taxonomy)) {
      errors.push(
        `${relative(navigationPath)}: navigation item "${item.label}" references unknown taxonomy dimension "${item.taxonomy}"`
      );
    }
    validateNavigation(item.children);
  }
}

validateNavigation(navigation.items);

const viewsPath = path.join(contentRoot, "system", "views.yaml");
const views = parse(fs.readFileSync(viewsPath, "utf8"));
const engine = views.viewEngine;

if (!engine?.fallback?.layout) {
  errors.push(
    `${relative(viewsPath)}: viewEngine.fallback.layout is required`
  );
}

const supportedLayouts = new Set([
  "periodic",
  "catalog",
  "kanban",
  "detail",
  "timeline",
  "table",
  "graph-placeholder"
]);
const configuredLayouts = new Set(Object.keys(engine?.layouts ?? {}));

function validateLayoutReference(field, settings) {
  if (!settings?.layout) return;
  if (!supportedLayouts.has(settings.layout)) {
    errors.push(
      `${relative(viewsPath)}: ${field} references unsupported layout "${settings.layout}"`
    );
  } else if (!configuredLayouts.has(settings.layout)) {
    errors.push(
      `${relative(viewsPath)}: ${field} references layout "${settings.layout}" which is not configured in viewEngine.layouts`
    );
  }
}

for (const layout of configuredLayouts) {
  if (!supportedLayouts.has(layout)) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.layouts contains unsupported layout "${layout}"`
    );
  }
}

validateLayoutReference("viewEngine.fallback", engine?.fallback);

const levelDimensionId = engine?.selectors?.levelAttribute;
const levelDimension = levelDimensionId
  ? dimensions.get(levelDimensionId)
  : undefined;
if (levelDimensionId && !levelDimension) {
  errors.push(
    `${relative(viewsPath)}: viewEngine.selectors.levelAttribute references unknown taxonomy dimension "${levelDimensionId}"`
  );
}

const configuredPanels = new Set([
  "detail",
  ...Object.keys(engine?.panels ?? {})
]);

function validatePanels(field, settings) {
  for (const panel of settings?.enabledPanels ?? []) {
    if (!configuredPanels.has(panel)) {
      errors.push(
        `${relative(viewsPath)}: ${field}.enabledPanels references unknown panel "${panel}"`
      );
    }
  }
}

validatePanels("viewEngine.fallback", engine?.fallback);

const relationshipGraph = engine?.panels?.relationshipGraph;
if (relationshipGraph) {
  if (
    relationshipGraph.enabledFromLevel &&
    levelDimension &&
    !levelDimension.values.has(relationshipGraph.enabledFromLevel)
  ) {
    report(
      viewsPath,
      "viewEngine.panels.relationshipGraph.enabledFromLevel",
      relationshipGraph.enabledFromLevel,
      levelDimensionId
    );
  }
  if (
    relationshipGraph.defaultState &&
    !["collapsed", "compact", "expanded"].includes(
      relationshipGraph.defaultState
    )
  ) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.panels.relationshipGraph.defaultState must be collapsed, compact, or expanded`
    );
  }
  if (
    relationshipGraph.depth != null &&
    (!Number.isInteger(relationshipGraph.depth) ||
      relationshipGraph.depth < 1)
  ) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.panels.relationshipGraph.depth must be a positive integer`
    );
  }
}

for (const [level, settings] of Object.entries(
  engine?.defaults?.level ?? {}
)) {
  if (levelDimension && !levelDimension.values.has(level)) {
    report(
      viewsPath,
      `viewEngine.defaults.level.${level}`,
      level,
      levelDimensionId
    );
  }
  validateLayoutReference(`viewEngine.defaults.level.${level}`, settings);
  validatePanels(`viewEngine.defaults.level.${level}`, settings);
}

const categoryDimensionId = engine?.selectors?.categoryAttribute;
const categoryDimension = categoryDimensionId
  ? dimensions.get(categoryDimensionId)
  : undefined;
if (categoryDimensionId && !categoryDimension) {
  errors.push(
    `${relative(viewsPath)}: viewEngine.selectors.categoryAttribute references unknown taxonomy dimension "${categoryDimensionId}"`
  );
}

const contentCollections = new Set(
  fs
    .readdirSync(contentRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name !== "system")
    .map((item) => item.name)
);
const knownCategoryContexts = new Set([
  ...(categoryDimension?.values ?? []),
  ...contentCollections
]);

for (const [category, levels] of Object.entries(
  engine?.overrides?.categories ?? {}
)) {
  if (!knownCategoryContexts.has(category)) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.overrides.categories references unknown category or collection context "${category}"`
    );
  }
  for (const [level, settings] of Object.entries(levels ?? {})) {
    if (levelDimension && !levelDimension.values.has(level)) {
      report(
        viewsPath,
        `viewEngine.overrides.categories.${category}.${level}`,
        level,
        levelDimensionId
      );
    }
    validateLayoutReference(
      `viewEngine.overrides.categories.${category}.${level}`,
      settings
    );
    validatePanels(
      `viewEngine.overrides.categories.${category}.${level}`,
      settings
    );
  }
}

const nodeIds = new Set();
for (const directory of ["entries", "sources"]) {
  for (const filePath of listFiles(path.join(contentRoot, directory), /\.ya?ml$/i)) {
    const document = parse(fs.readFileSync(filePath, "utf8"));
    if (typeof document?.id === "string") nodeIds.add(document.id);
  }
}

for (const [nodeId, settings] of Object.entries(
  engine?.overrides?.nodes ?? {}
)) {
  if (!nodeIds.has(nodeId)) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.overrides.nodes references unknown node "${nodeId}"`
    );
  }
  validateLayoutReference(`viewEngine.overrides.nodes.${nodeId}`, settings);
  validatePanels(`viewEngine.overrides.nodes.${nodeId}`, settings);
}

for (const view of views.views ?? []) {
  for (const field of [
    ["taxonomy", view.taxonomy],
    ["presentation.groupDimension", view.presentation?.groupDimension],
    ["presentation.colorDimension", view.presentation?.colorDimension],
    ["presentation.iconDimension", view.presentation?.iconDimension]
  ]) {
    if (field[1] && !dimensions.has(field[1])) {
      errors.push(
        `${relative(viewsPath)}: view "${view.id}" ${field[0]} references unknown taxonomy dimension "${field[1]}"`
      );
    }
  }

  if (
    view.displayLevel &&
    levelDimension &&
    !levelDimension.values.has(view.displayLevel)
  ) {
    report(
      viewsPath,
      `view "${view.id}" displayLevel`,
      view.displayLevel,
      levelDimensionId
    );
  }

  for (const dimensionId of view.presentation?.badgeDimensions ?? []) {
    if (!dimensions.has(dimensionId)) {
      errors.push(
        `${relative(viewsPath)}: view "${view.id}" references unknown badge dimension "${dimensionId}"`
      );
    }
  }

  for (const [filterPath, expected] of Object.entries(view.filters ?? {})) {
    const match = filterPath.match(/^attributes\.(.+)$/);
    if (!match) continue;
    const dimension = dimensions.get(match[1]);
    if (!dimension) continue;
    for (const candidate of valuesOf(expected)) {
      if (typeof candidate === "string" && !dimension.values.has(candidate)) {
        report(viewsPath, `view "${view.id}" filter ${filterPath}`, candidate, match[1]);
      }
    }
  }
}

if (errors.length) {
  console.error(`Metadata validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Metadata validation passed: ${dimensions.size} taxonomy dimensions checked.`
);
