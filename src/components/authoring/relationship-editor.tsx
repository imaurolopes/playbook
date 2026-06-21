"use client";

import { Plus, Trash2 } from "lucide-react";
import type { MetadataValue, TaxonomyDefinition } from "@/types/content";

interface RelationshipRow {
  type: string;
  target: string;
}

function rows(value: MetadataValue | undefined): RelationshipRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? [
          {
            type: typeof item.type === "string" ? item.type : "",
            target: typeof item.target === "string" ? item.target : ""
          }
        ]
      : []
  );
}

export function RelationshipEditor({
  value,
  taxonomy,
  knownNodeIds,
  onChange
}: {
  value: MetadataValue | undefined;
  taxonomy: TaxonomyDefinition;
  knownNodeIds: string[];
  onChange: (value: MetadataValue[]) => void;
}) {
  const items = rows(value);
  const types =
    taxonomy.dimensions.find((dimension) => dimension.id === "relationshipKind")
      ?.options ?? [];
  const update = (next: RelationshipRow[]) =>
    onChange(next as unknown as MetadataValue[]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Relationships</h3>
        <button
          type="button"
          onClick={() => update([...items, { type: "", target: "" }])}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <select
              aria-label={`Relationship ${index + 1} type`}
              value={item.type}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, type: event.target.value };
                update(next);
              }}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select type</option>
              {types.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <input
              aria-label={`Relationship ${index + 1} target`}
              list="authoring-node-ids"
              value={item.target}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, target: event.target.value };
                update(next);
              }}
              placeholder="target-node-id"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => update(items.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`Remove relationship ${index + 1}`}
              className="rounded-lg border p-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <datalist id="authoring-node-ids">
        {knownNodeIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </div>
  );
}
