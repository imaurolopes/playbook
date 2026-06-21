"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { DetailPanel } from "@/components/home/detail-panel";
import { MetadataCard } from "@/components/home/metadata-card";
import { IconToken } from "@/components/metadata/icon-token";
import type {
  Entry,
  KnowledgeNode,
  TaxonomyDefinition,
  TaxonomyOption,
  ViewDefinition
} from "@/types/content";

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function LocalView({
  option,
  entries,
  taxonomy,
  view,
  registry
}: {
  option: TaxonomyOption;
  entries: Entry[];
  taxonomy: TaxonomyDefinition;
  view: ViewDefinition;
  registry: KnowledgeNode[];
}) {
  const [selectedEntry, setSelectedEntry] = useState<Entry>();
  const closePanel = useCallback(() => setSelectedEntry(undefined), []);
  const color = option.color ?? "#64748b";

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to concept map
      </Link>

      <header
        className="relative overflow-hidden rounded-3xl border p-7 sm:p-9"
        style={{
          borderColor: colorWithAlpha(color, "66"),
          backgroundImage: `linear-gradient(145deg, ${colorWithAlpha(
            color,
            "25"
          )}, transparent 60%)`
        }}
      >
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <span
                className="font-mono text-4xl font-black tracking-[-0.08em]"
                style={{ color }}
              >
                {option.code ?? option.value.slice(0, 4).toUpperCase()}
              </span>
              <span
                className="grid size-12 place-items-center rounded-xl border bg-background/70"
                style={{ borderColor: colorWithAlpha(color, "55"), color }}
              >
                <IconToken token={option.icon} className="size-6" />
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              {option.label}
            </h1>
            {option.summary ? (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {option.summary}
              </p>
            ) : null}
          </div>
          <span className="w-fit rounded-full border bg-background/70 px-3 py-1.5 text-xs font-semibold backdrop-blur">
            {entries.length} children
          </span>
        </div>
      </header>

      {entries.length ? (
        <div className="local-periodic-grid">
          {entries.map((entry) => (
            <MetadataCard
              key={entry.id}
              entry={entry}
              category={option}
              dimensions={taxonomy.dimensions}
              view={view}
              onSelect={setSelectedEntry}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No child entries are assigned yet.
        </div>
      )}

      <DetailPanel
        entry={selectedEntry}
        registry={registry}
        taxonomy={taxonomy}
        view={view}
        onClose={closePanel}
      />
    </div>
  );
}
