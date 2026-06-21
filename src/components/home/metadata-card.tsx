"use client";

import { IconToken } from "@/components/metadata/icon-token";
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

function resolveOptions(
  entry: Entry,
  dimensions: TaxonomyDimension[],
  dimensionIds: string[]
) {
  return dimensionIds.flatMap((dimensionId) => {
    const dimension = dimensions.find((item) => item.id === dimensionId);
    if (!dimension) return [];

    return asValues(entry.attributes?.[dimensionId]).flatMap((value) => {
      const option = dimension.options.find((item) => item.value === value);
      return option ? [{ dimension, option }] : [];
    });
  });
}

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function MetadataCard({
  entry,
  category,
  dimensions,
  view,
  onSelect
}: {
  entry: Entry;
  category: TaxonomyOption;
  dimensions: TaxonomyDimension[];
  view: ViewDefinition;
  onSelect: (entry: Entry) => void;
}) {
  const badgeDimensions = view.presentation?.badgeDimensions ?? [];
  const badges = resolveOptions(entry, dimensions, badgeDimensions);
  const tagsAttribute = view.presentation?.tagsAttribute;
  const tags = tagsAttribute
    ? asValues(entry.attributes?.[tagsAttribute])
    : [];
  const taxonomyKeys = new Set([
    ...dimensions.map((dimension) => dimension.id),
    ...(tagsAttribute ? [tagsAttribute] : [])
  ]);
  const extraAttributes = Object.entries(entry.attributes ?? {}).filter(
    ([key]) => !taxonomyKeys.has(key)
  );
  const color = category.color ?? "#64748b";

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="group relative flex min-h-52 w-full flex-col overflow-hidden rounded-xl border bg-background/90 p-4 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        borderColor: colorWithAlpha(color, "55"),
        backgroundImage: `linear-gradient(145deg, ${colorWithAlpha(
          color,
          "16"
        )}, transparent 45%)`
      }}
      aria-label={`View details for ${entry.title}`}
    >
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: color }}
      />

      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg border"
          style={{
            borderColor: colorWithAlpha(color, "55"),
            backgroundColor: colorWithAlpha(color, "18"),
            color
          }}
        >
          <IconToken token={category.icon} className="size-5" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {entry.id}
        </span>
      </div>

      <h3 className="text-base font-semibold leading-tight tracking-tight">
        {entry.title}
      </h3>
      {entry.summary ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
          {entry.summary}
        </p>
      ) : null}

      <div className="mt-auto space-y-3 pt-4">
        {extraAttributes[0] ? (
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {extraAttributes[0][0]}:
            </span>{" "}
            {String(extraAttributes[0][1])}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {badges.slice(0, 3).map(({ dimension, option }) => (
            <span
              key={`${dimension.id}-${option.value}`}
              className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                borderColor: colorWithAlpha(option.color ?? color, "55"),
                color: option.color ?? color
              }}
            >
              {option.label}
            </span>
          ))}
        </div>

        {tags.length ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
