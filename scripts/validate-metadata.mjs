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
