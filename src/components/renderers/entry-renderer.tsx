import ReactMarkdown from "react-markdown";
import { getDocument, getTaxonomy } from "@/lib/content/load";
import { resolvePresentation } from "@/lib/metadata/resolve";
import { ValueRenderer } from "@/components/renderers/value-renderer";
import type { Entry, MetadataValue } from "@/types/content";

export function EntryRenderer({ entry }: { entry: Entry }) {
  const presentation = resolvePresentation(entry, getTaxonomy());

  return (
    <article className="space-y-8">
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          {presentation.icon ? (
            <span className="text-3xl" aria-hidden>
              {presentation.icon}
            </span>
          ) : null}
          <h1 className="text-4xl font-bold tracking-tight">{entry.title}</h1>
        </div>
        {entry.summary ? (
          <p className="max-w-3xl text-lg text-muted-foreground">
            {entry.summary}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {presentation.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: presentation.color,
                color: presentation.color
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </header>

      {entry.attributes && Object.keys(entry.attributes).length ? (
        <section className="rounded-lg border p-6">
          <h2 className="mb-4 text-xl font-semibold">Metadata</h2>
          <ValueRenderer value={entry.attributes as MetadataValue} />
        </section>
      ) : null}

      {entry.content?.map((block, index) => (
        <section key={index} className="rounded-lg border p-6">
          {"title" in block && typeof block.title === "string" ? (
            <h2 className="mb-4 text-xl font-semibold">{block.title}</h2>
          ) : null}
          <ValueRenderer value={block} />
        </section>
      ))}

      {entry.documents?.map((reference) => {
        const document = getDocument(reference.path);
        if (!document) return null;

        return (
          <section key={reference.path} className="document-content max-w-none">
            {reference.label ? <h2>{reference.label}</h2> : null}
            <ReactMarkdown>{document}</ReactMarkdown>
          </section>
        );
      })}
    </article>
  );
}
