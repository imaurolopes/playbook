"use client";

import Link from "next/link";
import { Download, FileText, PackageOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import type {
  AgentPackageDefinition,
  BreadcrumbDefinition,
  GeneratedPackageFile,
  KnowledgeNode,
  MetadataValue,
  ProjectWorkspace
} from "@/types/content";
import type { AgentPackageSummary } from "@/lib/projects/agent-package";

function ItemLinks({
  items
}: {
  items: KnowledgeNode[];
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">None selected.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) =>
        item.route ? (
          <Link
            key={item.id}
            href={item.route}
            className="rounded-full border bg-background px-3 py-1.5 text-xs transition hover:bg-muted"
          >
            {item.title}
          </Link>
        ) : (
          <span key={item.id} className="rounded-full border px-3 py-1.5 text-xs">
            {item.title}
          </span>
        )
      )}
    </div>
  );
}

function ValueCount({ values }: { values: MetadataValue[] }) {
  return (
    <p className="text-sm text-muted-foreground">
      {values.length} {values.length === 1 ? "item" : "items"}
    </p>
  );
}

export function AgentPackageView({
  project,
  files,
  summary,
  definition,
  breadcrumbs
}: {
  project: ProjectWorkspace;
  files: GeneratedPackageFile[];
  summary: AgentPackageSummary;
  definition: AgentPackageDefinition;
  breadcrumbs?: BreadcrumbDefinition;
}) {
  const initial =
    files.find((file) => file.id === definition.defaultFile) ?? files[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const selected = useMemo(
    () => files.find((file) => file.id === selectedId) ?? files[0],
    [files, selectedId]
  );

  const download = (file: GeneratedPackageFile) => {
    const mime =
      file.format === "markdown"
        ? "text/markdown;charset=utf-8"
        : "application/yaml;charset=utf-8";
    const url = URL.createObjectURL(new Blob([file.content], { type: mime }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const groups = [
    ["Selected skills", summary.selectedSkills],
    ["Selected templates", summary.selectedTemplates],
    ["Selected checklists", summary.selectedChecklists],
    ["Selected decision matrices", summary.selectedDecisionMatrices],
    ["Selected artifacts", summary.selectedArtifacts],
    ["Sources and references", summary.sourcesAndReferences],
    ["Outputs", summary.outputs]
  ] as const;

  return (
    <div className="space-y-8">
      <ContextBreadcrumbs
        config={breadcrumbs}
        context="detail"
        items={[
          { label: "Projects", href: "/projects/" },
          { label: project.title, href: project.route },
          { label: "Agent Package" }
        ]}
      />

      <header className="rounded-3xl border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Structured context package
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              {project.title} Agent Package
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              {project.summary}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border bg-background p-4">
            <PackageOpen className="size-6 text-primary" />
            <div>
              <p className="text-sm font-semibold">{files.length} context files</p>
              <p className="text-xs text-muted-foreground">
                Package version {definition.packageVersion ?? "1"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(([label, items]) => (
          <section key={label} className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">{label}</h2>
            <div className="mt-3">
              <ItemLinks items={items} />
            </div>
          </section>
        ))}
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Risks</h2>
          <div className="mt-3"><ValueCount values={summary.risks} /></div>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Open questions</h2>
          <div className="mt-3"><ValueCount values={summary.openQuestions} /></div>
        </section>
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Relationship summary</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {summary.relationshipCount} relationships included
          </p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-2">
          <h2 className="mb-3 text-sm font-semibold">Generated files</h2>
          {files.map((file) => (
            <div
              key={file.id}
              className={`rounded-xl border p-3 ${
                selected?.id === file.id ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(file.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.filename}</span>
                  <span className="text-xs text-muted-foreground">{file.format}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => download(file)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium transition hover:bg-muted"
              >
                <Download className="size-3.5" />
                Download
              </button>
            </div>
          ))}
        </aside>

        <section className="min-w-0 rounded-2xl border bg-card">
          <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">{selected?.label}</h2>
              <p className="text-xs text-muted-foreground">{selected?.filename}</p>
            </div>
            {selected ? (
              <button
                type="button"
                onClick={() => download(selected)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
              >
                <Download className="size-3.5" />
                Download file
              </button>
            ) : null}
          </header>
          <pre className="max-h-[48rem] overflow-auto p-5 text-xs leading-5">
            {selected?.content}
          </pre>
        </section>
      </div>

      <p className="rounded-2xl border border-dashed p-4 text-xs text-muted-foreground">
        These files contain structured context only. They do not contain
        executable code, agent execution instructions, or external API actions.
      </p>
    </div>
  );
}
