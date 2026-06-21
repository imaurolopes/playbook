import { PeriodicElement } from "@/components/home/periodic-element";
import type {
  Entry,
  MetadataValue,
  TaxonomyDefinition,
  TaxonomyDimension,
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

function getGroups(dimension: TaxonomyDimension) {
  if (!dimension.groups?.length) {
    return [
      {
        id: dimension.id,
        label: dimension.label,
        options: [...dimension.options].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        )
      }
    ];
  }

  return [...dimension.groups]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((group) => ({
      id: group.id,
      label: group.label,
      options: dimension.options
        .filter((option) => option.group === group.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }));
}

export function VisualHome({
  entries,
  taxonomy,
  view
}: {
  entries: Entry[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
}) {
  const dimension = taxonomy.dimensions.find(
    (item) => item.id === view.taxonomy
  );

  if (!dimension) return null;

  const countBy = view.countBy;
  const groups = getGroups(dimension);

  return (
    <div className="space-y-12">
      <header className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-background via-background to-muted/50 px-6 py-10 shadow-sm sm:px-10">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            {view.label}
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
            Playbook
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            A periodic system of high-level concepts. Open any element to
            explore the reusable knowledge organized beneath it.
          </p>
        </div>
      </header>

      {groups.map((group) => (
        <section key={group.id} className="space-y-5">
          <div className="flex items-end justify-between gap-4 border-b pb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {dimension.label}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {group.label}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {group.options.length} elements
            </span>
          </div>

          <div className="concept-periodic-grid">
            {group.options.map((option) => {
              const count = countBy
                ? entries.filter((entry) =>
                    asValues(getPath(entry, countBy)).includes(option.value)
                  ).length
                : 0;
              const href = (view.routeTemplate ?? "/{value}").replace(
                "{value}",
                option.value
              );

              return (
                <PeriodicElement
                  key={option.value}
                  option={option}
                  count={count}
                  href={href}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
