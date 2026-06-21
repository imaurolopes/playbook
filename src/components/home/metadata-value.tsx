"use client";

import type { MetadataValue } from "@/types/content";

export function MetadataValueView({ value }: { value: MetadataValue }) {
  if (value === null) {
    return <span className="text-muted-foreground">Not set</span>;
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <span
            key={index}
            className="rounded-md border bg-muted/60 px-2 py-1 text-xs"
          >
            <MetadataValueView value={item} />
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <dt className="text-xs font-medium text-muted-foreground">{key}</dt>
            <dd className="text-sm">
              <MetadataValueView value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <span>{String(value)}</span>;
}
