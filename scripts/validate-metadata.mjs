import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const contentRoot = path.join(root, "content");
const taxonomyPath = path.join(contentRoot, "system", "taxonomy.yaml");
const taxonomy = parse(fs.readFileSync(taxonomyPath, "utf8"));
const schemasPath = path.join(contentRoot, "system", "schemas.yaml");
const schemasDocument = parse(fs.readFileSync(schemasPath, "utf8"));
const schemas = new Map(
  (schemasDocument.schemas ?? []).map((schema) => [schema.id, schema])
);
const definitions = new Map(
  Object.entries(schemasDocument.definitions ?? {})
);
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

function resolvedSchema(schema) {
  if (!schema?.extends) return schema;
  const parent = resolvedSchema(schemas.get(schema.extends));
  return {
    ...parent,
    ...schema,
    fields: {
      ...(parent?.fields ?? {}),
      ...(schema.fields ?? {})
    }
  };
}

function validateDefinedFields(filePath, value, definition, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  for (const [fieldName, field] of Object.entries(definition?.fields ?? {})) {
    const fieldValue = value[fieldName];
    if (fieldValue == null) continue;
    const fieldPath = prefix ? `${prefix}.${fieldName}` : fieldName;

    if (field.taxonomy) {
      const dimension = dimensions.get(field.taxonomy);
      if (!dimension) {
        errors.push(
          `${relative(schemasPath)}: ${definition.id ?? "definition"}.${fieldName} references unknown taxonomy dimension "${field.taxonomy}"`
        );
      } else {
        for (const candidate of valuesOf(fieldValue)) {
          if (
            typeof candidate === "string" &&
            !dimension.values.has(candidate)
          ) {
            report(filePath, fieldPath, candidate, field.taxonomy);
          }
        }
      }
    }

    if (field.itemSchema) {
      const itemDefinition = definitions.get(field.itemSchema);
      if (!itemDefinition) continue;
      const items = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      items.forEach((item, index) =>
        validateDefinedFields(
          filePath,
          item,
          itemDefinition,
          `${fieldPath}[${index}]`
        )
      );
    }
  }
}

for (const filePath of listFiles(contentRoot, /\.ya?ml$/i)) {
  if (filePath === taxonomyPath) continue;
  const document = parse(fs.readFileSync(filePath, "utf8")) ?? {};
  validateAttributes(filePath, document.attributes);
  validateRelationships(filePath, document.relationships);
  if (typeof document.schema === "string") {
    const schema = schemas.get(document.schema);
    if (schema) validateDefinedFields(filePath, document, resolvedSchema(schema));
  }
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

const searchPath = path.join(contentRoot, "system", "search.yaml");
const search = parse(fs.readFileSync(searchPath, "utf8"));
const requiredSearchFields = [
  "title",
  "summary",
  "tags",
  "categories",
  "artifactKind",
  "lifecycle",
  "relationships"
];

for (const field of requiredSearchFields) {
  const weight = search.fields?.[field];
  if (typeof weight !== "number" || weight < 0) {
    errors.push(
      `${relative(searchPath)}: fields.${field} must be a non-negative number`
    );
  }
}
if (
  search.maxResults != null &&
  (!Number.isInteger(search.maxResults) || search.maxResults < 1)
) {
  errors.push(
    `${relative(searchPath)}: maxResults must be a positive integer`
  );
}
if (
  search.shortcut != null &&
  (typeof search.shortcut !== "string" || search.shortcut.length !== 1)
) {
  errors.push(
    `${relative(searchPath)}: shortcut must be a single character`
  );
}
for (const [collection, presentation] of Object.entries(
  search.collections ?? {}
)) {
  if (
    !presentation ||
    typeof presentation !== "object" ||
    typeof presentation.label !== "string" ||
    !presentation.label.trim()
  ) {
    errors.push(
      `${relative(searchPath)}: collections.${collection}.label must be a non-empty string`
    );
  }
}

const viewsPath = path.join(contentRoot, "system", "views.yaml");
const views = parse(fs.readFileSync(viewsPath, "utf8"));
const engine = views.viewEngine;
const agentPackage = views.agentPackage;

if (!engine?.fallback?.layout) {
  errors.push(
    `${relative(viewsPath)}: viewEngine.fallback.layout is required`
  );
}

if (agentPackage) {
  if (!schemas.has(agentPackage.schema)) {
    errors.push(
      `${relative(viewsPath)}: agentPackage.schema references unknown schema "${agentPackage.schema}"`
    );
  }
  const supportedPackageFiles = new Set([
    "context",
    "project",
    "skills",
    "selected-artifacts",
    "risks",
    "open-questions",
    "outputs",
    "relationships"
  ]);
  const packageFileIds = new Set();
  for (const [index, file] of (agentPackage.files ?? []).entries()) {
    if (!supportedPackageFiles.has(file.id)) {
      errors.push(
        `${relative(viewsPath)}: agentPackage.files[${index}] references unsupported generator "${file.id}"`
      );
    }
    if (packageFileIds.has(file.id)) {
      errors.push(
        `${relative(viewsPath)}: agentPackage.files contains duplicate id "${file.id}"`
      );
    }
    packageFileIds.add(file.id);
    if (!["yaml", "markdown"].includes(file.format)) {
      errors.push(
        `${relative(viewsPath)}: agentPackage.files[${index}].format must be yaml or markdown`
      );
    }
  }
  if (
    agentPackage.defaultFile &&
    !packageFileIds.has(agentPackage.defaultFile)
  ) {
    errors.push(
      `${relative(viewsPath)}: agentPackage.defaultFile references unknown file "${agentPackage.defaultFile}"`
    );
  }
}

const supportedLayouts = new Set([
  "periodic",
  "catalog",
  "kanban",
  "detail",
  "timeline",
  "table",
  "graph-placeholder",
  "skill",
  "artifact",
  "workspace"
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

const selector = engine?.selector;
if (selector) {
  if (
    selector.persistence &&
    !["query", "localStorage"].includes(selector.persistence)
  ) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.selector.persistence must be query or localStorage`
    );
  }
  if (
    selector.parameter != null &&
    (typeof selector.parameter !== "string" || !selector.parameter.trim())
  ) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.selector.parameter must be a non-empty string`
    );
  }
  for (const layout of selector.availableLayouts ?? []) {
    if (!configuredLayouts.has(layout)) {
      errors.push(
        `${relative(viewsPath)}: viewEngine.selector.availableLayouts references unconfigured layout "${layout}"`
      );
    }
  }
}

const breadcrumbs = engine?.breadcrumbs;
if (breadcrumbs?.showOn) {
  for (const context of breadcrumbs.showOn) {
    if (!["local", "detail"].includes(context)) {
      errors.push(
        `${relative(viewsPath)}: viewEngine.breadcrumbs.showOn references unsupported context "${context}"`
      );
    }
  }
}

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

const artifactKindDimensionId = engine?.selectors?.artifactKindAttribute;
const artifactKindDimension = artifactKindDimensionId
  ? dimensions.get(artifactKindDimensionId)
  : undefined;
if (artifactKindDimensionId && !artifactKindDimension) {
  errors.push(
    `${relative(viewsPath)}: viewEngine.selectors.artifactKindAttribute references unknown taxonomy dimension "${artifactKindDimensionId}"`
  );
}

for (const [artifactKind, settings] of Object.entries(
  engine?.defaults?.artifactKind ?? {}
)) {
  if (
    artifactKindDimension &&
    !artifactKindDimension.values.has(artifactKind)
  ) {
    report(
      viewsPath,
      `viewEngine.defaults.artifactKind.${artifactKind}`,
      artifactKind,
      artifactKindDimensionId
    );
  }
  validateLayoutReference(
    `viewEngine.defaults.artifactKind.${artifactKind}`,
    settings
  );
  validatePanels(
    `viewEngine.defaults.artifactKind.${artifactKind}`,
    settings
  );
}

for (const [schemaId, settings] of Object.entries(
  engine?.defaults?.schema ?? {}
)) {
  if (!schemas.has(schemaId)) {
    errors.push(
      `${relative(viewsPath)}: viewEngine.defaults.schema references unknown schema "${schemaId}"`
    );
  }
  validateLayoutReference(`viewEngine.defaults.schema.${schemaId}`, settings);
  validatePanels(`viewEngine.defaults.schema.${schemaId}`, settings);
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
for (const directory of ["entries", "sources", "projects"]) {
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
