"use client";

import { Plus, Trash2 } from "lucide-react";
import type { MetadataValue } from "@/types/content";

interface ReferenceRow {
  target: string;
  label: string;
}

function rows(value: MetadataValue | undefined): ReferenceRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? [
          {
            target: typeof item.target === "string" ? item.target : "",
            label: typeof item.label === "string" ? item.label : ""
          }
        ]
      : []
  );
}

export function ReferenceEditor({
  value,
  knownNodeIds,
  onChange
}: {
  value: MetadataValue | undefined;
  knownNodeIds: string[];
  onChange: (value: MetadataValue[]) => void;
}) {
  const items = rows(value);
  const update = (next: ReferenceRow[]) =>
    onChange(next as unknown as MetadataValue[]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">References</h3>
        <button
          type="button"
          onClick={() => update([...items, { target: "", label: "" }])}
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
            <input
              aria-label={`Reference ${index + 1} target`}
              list="authoring-reference-node-ids"
              value={item.target}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, target: event.target.value };
                update(next);
              }}
              placeholder="target-node-id"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <input
              aria-label={`Reference ${index + 1} label`}
              value={item.label}
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, label: event.target.value };
                update(next);
              }}
              placeholder="Optional label"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => update(items.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`Remove reference ${index + 1}`}
              className="rounded-lg border p-2 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <datalist id="authoring-reference-node-ids">
        {knownNodeIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </div>
  );
}
