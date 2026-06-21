"use client";

import Link from "next/link";
import { useEffect } from "react";
import { X } from "lucide-react";
import { IconToken } from "@/components/metadata/icon-token";
import { MetadataValueView } from "@/components/home/metadata-value";
import type {
  Entry,
  TaxonomyDefinition,
  ViewDefinition
} from "@/types/content";

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DetailPanel({
  entry,
  entries,
  taxonomy,
  view,
  onClose
}: {
  entry?: Entry;
  entries: Entry[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!entry) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  const sections = new Set(
    view.detailPanel?.sections ?? [
      "attributes",
      "relationships",
      "documents",
      "actions"
    ]
  );

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close detail panel"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-panel-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l bg-background shadow-2xl"
      >
        <header className="border-b px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {entry.id}
              </p>
              <h2
                id="detail-panel-title"
                className="text-2xl font-semibold tracking-tight"
              >
                {entry.title}
              </h2>
              {entry.summary ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {entry.summary}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close detail panel"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
          {sections.has("attributes") && entry.attributes ? (
            <section>
              <h3 className="detail-heading">Attributes</h3>
              <dl className="space-y-4">
                {Object.entries(entry.attributes).map(([key, value]) => {
                  const dimension = taxonomy.dimensions.find(
                    (item) => item.id === key
                  );
                  return (
                    <div
                      key={key}
                      className="grid gap-1 border-b pb-4 sm:grid-cols-[9rem_1fr]"
                    >
                      <dt className="text-xs font-medium text-muted-foreground">
                        {dimension?.label ?? humanize(key)}
                      </dt>
                      <dd className="text-sm">
                        <MetadataValueView value={value} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ) : null}

          {sections.has("relationships") ? (
            <section>
              <h3 className="detail-heading">Relationships</h3>
              {entry.relationships?.length ? (
                <div className="space-y-2">
                  {entry.relationships.map((relationship, index) => {
                    const target = entries.find(
                      (candidate) => candidate.id === relationship.target
                    );
                    const body = (
                      <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {humanize(relationship.type)}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {target?.title ?? relationship.target}
                        </p>
                      </div>
                    );

                    return target ? (
                      <Link key={index} href={target.route} onClick={onClose}>
                        {body}
                      </Link>
                    ) : (
                      <div key={index}>{body}</div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No relationships defined.
                </p>
              )}
            </section>
          ) : null}

          {sections.has("documents") ? (
            <section>
              <h3 className="detail-heading">Linked documents</h3>
              {entry.documents?.length ? (
                <div className="space-y-2">
                  {entry.documents.map((document) => (
                    <div
                      key={document.path}
                      className="rounded-lg border bg-muted/30 p-3"
                    >
                      <p className="text-sm font-medium">
                        {document.label ?? document.path}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {document.path}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No linked documents.
                </p>
              )}
            </section>
          ) : null}
        </div>

        {sections.has("actions") ? (
          <footer className="border-t bg-muted/20 p-4">
            <div className="flex flex-wrap justify-end gap-2">
              {entry.actions?.map((action) => (
                <Link
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  onClick={onClose}
                  className={
                    action.appearance === "primary"
                      ? "panel-action-primary"
                      : "panel-action-secondary"
                  }
                >
                  {action.label}
                  <IconToken token={action.icon} className="size-4" />
                </Link>
              ))}
              {!entry.actions?.length ? (
                <Link
                  href={entry.route}
                  onClick={onClose}
                  className="panel-action-primary"
                >
                  Open full entry
                  <IconToken token="arrow-up-right" className="size-4" />
                </Link>
              ) : null}
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
