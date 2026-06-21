"use client";

import { useCallback, useMemo, useState } from "react";
import { IconToken } from "@/components/metadata/icon-token";
import { DetailPanel } from "@/components/home/detail-panel";
import { MetadataCard } from "@/components/home/metadata-card";
import type {
  Entry,
  MetadataValue,
  TaxonomyDimension,
  TaxonomyOption,
  ViewDefinition
} from "@/types/content";

function asValues(value: MetadataValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string");
}

function getPath(entry: Entry, path: string): MetadataValue | undefined {
  const parts = path.split(".");
  let current: unknown = entry;

  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current as MetadataValue | undefined;
}

function matchesFilters(entry: Entry, filters?: Record<string, MetadataValue>) {
  if (!filters) return true;

  return Object.entries(filters).every(([path, expected]) => {
    const actualValues = asValues(getPath(entry, path));
    const expectedValues = asValues(expected);
    return expectedValues.every((value) => actualValues.includes(value));
  });
}

function orderedOptions(dimension?: TaxonomyDimension) {
  return [...(dimension?.options ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
}

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

interface CategoryGroup {
  id: string;
  label: string;
  order: number;
  options: TaxonomyOption[];
}

export function VisualHome({
  entries,
  taxonomy,
  view
}: {
  entries: Entry[];
  taxonomy: {
    schemaVersion?: string;
    dimensions: TaxonomyDimension[];
  };
  view: ViewDefinition;
}) {
  const [selectedEntry, setSelectedEntry] = useState<Entry>();
  const closePanel = useCallback(() => setSelectedEntry(undefined), []);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, view.filters)),
    [entries, view.filters]
  );
  const groupDimensionId =
    view.presentation?.groupDimension ??
    view.groupBy?.replace(/^attributes\./, "");
  const groupDimension = taxonomy.dimensions.find(
    (dimension) => dimension.id === groupDimensionId
  );
  const showEmptyGroups = view.presentation?.showEmptyGroups ?? false;

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    if (!groupDimension) return [];

    const groups = groupDimension.groups?.length
      ? [...groupDimension.groups]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((group) => ({
            id: group.id,
            label: group.label,
            order: group.order ?? 0,
            options: orderedOptions(groupDimension).filter(
              (option) => option.group === group.id
            )
          }))
      : [
          {
            id: groupDimension.id,
            label: groupDimension.label,
            order: 0,
            options: orderedOptions(groupDimension)
          }
        ];

    return groups.filter(
      (group) =>
        showEmptyGroups ||
        group.options.some((option) =>
          filteredEntries.some((entry) =>
            asValues(entry.attributes?.[groupDimension.id]).includes(
              option.value
            )
          )
        )
    );
  }, [filteredEntries, groupDimension, showEmptyGroups]);

  return (
    <div className="space-y-10">
      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-background via-background to-muted/60 px-6 py-9 shadow-sm sm:px-10">
        <div className="absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            {view.label}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Playbook
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Explore reusable knowledge as a living system. Every group, card,
            color, icon, badge, and relationship is assembled from metadata.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-background/70 px-3 py-1.5">
              {filteredEntries.length} entries
            </span>
            <span className="rounded-full border bg-background/70 px-3 py-1.5">
              {groupDimension?.options.length ?? 0}{" "}
              {(groupDimension?.label ?? "classifications").toLowerCase()}
            </span>
            <span className="rounded-full border bg-background/70 px-3 py-1.5">
              {categoryGroups.length} groups
            </span>
          </div>
        </div>
      </header>

      {categoryGroups.map((group) => (
        <section key={group.id} className="space-y-4">
          <div className="flex items-end justify-between gap-4 border-b pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {groupDimension?.label}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {group.label}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {group.options.length} classifications
            </p>
          </div>

          <div className="periodic-grid">
            {group.options.map((category) => {
              const categoryEntries = filteredEntries.filter((entry) =>
                asValues(entry.attributes?.[groupDimension!.id]).includes(
                  category.value
                )
              );
              const color = category.color ?? "#64748b";

              if (!categoryEntries.length) {
                return (
                  <div
                    key={category.value}
                    className="flex min-h-52 flex-col rounded-xl border border-dashed bg-muted/20 p-4 opacity-70"
                    style={{ borderColor: colorWithAlpha(color, "55") }}
                  >
                    <div className="flex items-center gap-2">
                      <IconToken
                        token={category.icon}
                        className="size-4"
                      />
                      <h3 className="text-sm font-medium">{category.label}</h3>
                    </div>
                    <p className="m-auto text-xs text-muted-foreground">
                      No entries yet
                    </p>
                  </div>
                );
              }

              return categoryEntries.map((entry) => (
                <MetadataCard
                  key={`${category.value}-${entry.id}`}
                  entry={entry}
                  category={category}
                  dimensions={taxonomy.dimensions}
                  view={view}
                  onSelect={setSelectedEntry}
                />
              ));
            })}
          </div>
        </section>
      ))}

      <DetailPanel
        entry={selectedEntry}
        entries={entries}
        taxonomy={taxonomy}
        view={view}
        onClose={closePanel}
      />
    </div>
  );
}
