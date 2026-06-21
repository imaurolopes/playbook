import type {
  ContentSchemaDefinition,
  SchemaFieldDefinition,
  SchemasDefinition
} from "@/types/content";

export interface ResolvedAuthoringSchema extends ContentSchemaDefinition {
  required: string[];
  fields: Record<string, SchemaFieldDefinition>;
}

const coreFields: Record<string, SchemaFieldDefinition> = {
  schemaVersion: { type: "string" },
  id: { type: "string" },
  schema: { type: "string" },
  title: { type: "string" },
  summary: { type: "string" },
  route: { type: "string" }
};

export function resolveAuthoringSchema(
  definition: SchemasDefinition,
  schemaId: string
): ResolvedAuthoringSchema | undefined {
  const visiting = new Set<string>();

  function resolve(id: string): ResolvedAuthoringSchema | undefined {
    if (visiting.has(id)) return undefined;
    const schema = definition.schemas.find((candidate) => candidate.id === id);
    if (!schema) return undefined;

    visiting.add(id);
    const parent = schema.extends ? resolve(schema.extends) : undefined;
    visiting.delete(id);

    return {
      ...parent,
      ...schema,
      required: [
        ...new Set([...(parent?.required ?? []), ...(schema.required ?? [])])
      ],
      constraints: {
        ...(parent?.constraints ?? {}),
        ...(schema.constraints ?? {})
      },
      fields: {
        ...coreFields,
        ...(parent?.fields ?? {}),
        ...(schema.fields ?? {})
      }
    };
  }

  return resolve(schemaId);
}

export function authorableSchemas(definition: SchemasDefinition) {
  return definition.schemas.filter((schema) => schema.storage === "entries");
}
