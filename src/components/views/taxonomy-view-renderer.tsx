import { VisualHome } from "@/components/home/visual-home";
import type {
  Entry,
  ResolvedViewLayout,
  TaxonomyDefinition,
  ViewDefinition
} from "@/types/content";

export function TaxonomyViewRenderer({
  entries,
  taxonomy,
  view,
  layout
}: {
  entries: Entry[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  layout: ResolvedViewLayout;
}) {
  if (layout.layout === "periodic") {
    return (
      <div data-layout={layout.layout} data-view-source={layout.source}>
        <VisualHome entries={entries} taxonomy={taxonomy} view={view} />
      </div>
    );
  }

  return (
    <div
      data-layout={layout.layout}
      data-view-source={layout.source}
      className="rounded-3xl border border-dashed p-12 text-center"
    >
      <h1 className="text-2xl font-semibold">{view.label}</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The metadata-driven view engine selected the “{layout.layout}” layout.
        This taxonomy surface currently provides its complete renderer for the
        periodic layout.
      </p>
    </div>
  );
}
