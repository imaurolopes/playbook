import { TaxonomyViewRenderer } from "@/components/views/taxonomy-view-renderer";
import { getEntries, getTaxonomy, getViews } from "@/lib/content/load";
import { resolveViewLayout } from "@/lib/views/engine";

export default function HomePage() {
  const entries = getEntries();
  const taxonomy = getTaxonomy();
  const views = getViews();
  const activeView =
    views.views.find((view) => view.id === views.defaultView) ?? views.views[0];
  const layout = resolveViewLayout(views, {
    level: activeView?.displayLevel
  });

  return activeView ? (
    <TaxonomyViewRenderer
      entries={entries}
      taxonomy={taxonomy}
      view={activeView}
      layout={layout}
    />
  ) : null;
}
