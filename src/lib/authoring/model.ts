import type {
  ContentSchemaDefinition,
  Entry,
  MetadataValue,
  TaxonomyDefinition
} from "@/types/content";
import type { ResolvedAuthoringSchema } from "@/lib/authoring/schema-resolver";

export type AuthoringDocument = Record<string, MetadataValue | undefined>;

export interface AuthoringContext {
  schema: ResolvedAuthoringSchema;
  taxonomy: TaxonomyDefinition;
  knownNodeIds: string[];
}

export interface ValidationIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

export function entryToAuthoringDocument(entry: Entry): AuthoringDocument {
  return JSON.parse(JSON.stringify(entry)) as AuthoringDocument;
}

export function createAuthoringDocument(
  schema: ContentSchemaDefinition
): AuthoringDocument {
  const document: AuthoringDocument = {
    schemaVersion: "1",
    id: "",
    schema: schema.id,
    title: "",
    summary: "",
    route: "",
    attributes: {},
    relationships: []
  };

  for (const [path, constraint] of Object.entries(schema.constraints ?? {})) {
    if (constraint.equals === undefined) continue;
    setPath(document, path, constraint.equals);
  }

  return document;
}

export function setPath(
  document: AuthoringDocument,
  path: string,
  value: MetadataValue
) {
  const parts = path.split(".");
  let current: Record<string, MetadataValue | undefined> = document;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, MetadataValue | undefined>;
  }
  current[parts.at(-1)!] = value;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
