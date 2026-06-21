import Link from "next/link";
import { getEntries, getTaxonomy, getViews } from "@/lib/content/load";
import { resolvePresentation } from "@/lib/metadata/resolve";

export default function HomePage() {
  const entries = getEntries();
  const taxonomy = getTaxonomy();
  const views = getViews();
  const activeView =
    views.views.find((view) => view.id === views.defaultView) ?? views.views[0];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">{activeView?.label}</p>
        <h1 className="text-4xl font-bold tracking-tight">Playbook</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          Knowledge, navigation, and presentation are assembled from content
          metadata.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => {
          const presentation = resolvePresentation(entry, taxonomy);

          return (
            <Link
              key={entry.id}
              href={entry.route}
              className="rounded-lg border p-5 transition hover:bg-muted/50"
              style={{ borderTopColor: presentation.color }}
            >
              <div className="mb-3 flex items-center gap-2">
                {presentation.icon ? (
                  <span aria-hidden>{presentation.icon}</span>
                ) : null}
                <h2 className="font-semibold">{entry.title}</h2>
              </div>
              {entry.summary ? (
                <p className="text-sm text-muted-foreground">{entry.summary}</p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
