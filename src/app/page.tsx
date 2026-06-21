import { VisualHome } from "@/components/home/visual-home";
import { getEntries, getTaxonomy, getViews } from "@/lib/content/load";

export default function HomePage() {
  const entries = getEntries();
  const taxonomy = getTaxonomy();
  const views = getViews();
  const activeView =
    views.views.find((view) => view.id === views.defaultView) ?? views.views[0];

  return activeView ? (
    <VisualHome entries={entries} taxonomy={taxonomy} view={activeView} />
  ) : null;
}
