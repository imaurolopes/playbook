import type { MetadataValue, TaxonomyDefinition } from "@/types/content";
import type {
  AuthoringDocument,
  ValidationIssue
} from "@/lib/authoring/model";
import type { ResolvedAuthoringSchema } from "@/lib/authoring/schema-resolver";

function getPath(document: AuthoringDocument, path: string): MetadataValue | undefined {
  let current: unknown = document;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current as MetadataValue | undefined;
}

function isMissing(value: MetadataValue | undefined) {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function validateAuthoringDocument(
  document: AuthoringDocument,
  schema: ResolvedAuthoringSchema,
  taxonomy: TaxonomyDefinition,
  knownNodeIds: string[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const field of schema.required) {
    if (isMissing(getPath(document, field))) {
      issues.push({
        level: "error",
        field,
        message: `${field} is required.`
      });
    }
  }

  for (const [field, definition] of Object.entries(schema.fields)) {
    const value = document[field];
    if (value === undefined) continue;
    const valid =
      !definition.type ||
      (definition.type === "string" && typeof value === "string") ||
      (definition.type === "boolean" && typeof value === "boolean") ||
      (definition.type === "list" && Array.isArray(value)) ||
      (definition.type === "object" &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value));
    if (!valid) {
      issues.push({
        level: "error",
        field,
        message: `${field} must be a ${definition.type}.`
      });
    }
  }

  if (
    typeof document.id === "string" &&
    document.id &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.id)
  ) {
    issues.push({
      level: "error",
      field: "id",
      message: "Use lowercase letters, numbers, and hyphens."
    });
  }

  if (
    typeof document.route === "string" &&
    document.route &&
    !document.route.startsWith("/")
  ) {
    issues.push({
      level: "error",
      field: "route",
      message: "Route must start with /."
    });
  }

  if (document.schema !== schema.id) {
    issues.push({
      level: "error",
      field: "schema",
      message: `Schema must be ${schema.id}.`
    });
  }

  for (const [path, constraint] of Object.entries(schema.constraints ?? {})) {
    if (
      constraint.equals !== undefined &&
      getPath(document, path) !== constraint.equals
    ) {
      issues.push({
        level: "error",
        field: path,
        message: `${path} must equal ${String(constraint.equals)}.`
      });
    }
  }

  const attributes =
    document.attributes &&
    typeof document.attributes === "object" &&
    !Array.isArray(document.attributes)
      ? document.attributes
      : {};
  for (const dimension of taxonomy.dimensions) {
    const raw = attributes[dimension.id];
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (
        typeof value === "string" &&
        !dimension.options.some((option) => option.value === value)
      ) {
        issues.push({
          level: "error",
          field: `attributes.${dimension.id}`,
          message: `Unknown ${dimension.id} value "${value}".`
        });
      }
    }
  }

  const relationshipDimension = taxonomy.dimensions.find(
    (dimension) => dimension.id === "relationshipKind"
  );
  const relationships = Array.isArray(document.relationships)
    ? document.relationships
    : [];
  relationships.forEach((relationship, index) => {
    if (
      !relationship ||
      typeof relationship !== "object" ||
      Array.isArray(relationship)
    ) {
      issues.push({
        level: "error",
        field: `relationships.${index}`,
        message: "Relationship must be an object."
      });
      return;
    }
    const type = relationship.type;
    const target = relationship.target;
    if (
      typeof type !== "string" ||
      !relationshipDimension?.options.some((option) => option.value === type)
    ) {
      issues.push({
        level: "error",
        field: `relationships.${index}.type`,
        message: "Select a known relationship type."
      });
    }
    if (typeof target !== "string" || !target) {
      issues.push({
        level: "error",
        field: `relationships.${index}.target`,
        message: "Relationship target is required."
      });
    } else if (!knownNodeIds.includes(target)) {
      issues.push({
        level: "warning",
        field: `relationships.${index}.target`,
        message: `Target "${target}" is not currently in the registry.`
      });
    }
  });

  const references = Array.isArray(document.references)
    ? document.references
    : [];
  references.forEach((reference, index) => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
      issues.push({
        level: "error",
        field: `references.${index}`,
        message: "Reference must be an object."
      });
      return;
    }
    const target = reference.target;
    if (typeof target !== "string" || !target) {
      issues.push({
        level: "error",
        field: `references.${index}.target`,
        message: "Reference target is required."
      });
    } else if (!knownNodeIds.includes(target)) {
      issues.push({
        level: "warning",
        field: `references.${index}.target`,
        message: `Target "${target}" is not currently in the registry.`
      });
    }
  });

  return issues;
}
