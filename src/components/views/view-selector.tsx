"use client";

import { LayoutGrid } from "lucide-react";
import type { ViewLayoutSettings } from "@/types/content";

export function ViewSelector({
  available,
  selected,
  layouts,
  onSelect
}: {
  available: string[];
  selected: string;
  layouts: Record<string, Partial<ViewLayoutSettings> & { enabled?: boolean }>;
  onSelect: (layout: string) => void;
}) {
  if (available.length < 2) return null;

  return (
    <div
      data-view-selector
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-background p-1 shadow-sm"
    >
      <span className="px-2 text-muted-foreground">
        <LayoutGrid className="size-4" />
      </span>
      {available.map((layout) => (
        <button
          key={layout}
          type="button"
          onClick={() => onSelect(layout)}
          aria-pressed={selected === layout}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            selected === layout
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {layouts[layout]?.label ?? layout}
        </button>
      ))}
    </div>
  );
}
