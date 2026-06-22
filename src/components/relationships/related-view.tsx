import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { IconToken } from "@/components/metadata/icon-token";
import { MetadataValueView } from "@/components/home/metadata-value";
import { GovernanceSection } from "@/components/governance/governance-section";
import { RelationshipSections } from "@/components/relationships/relationship-sections";
import {
  resolveIncomingRelationships,
  resolveOutgoingRelationships
} from "@/lib/relationships/resolve";
import type {
  GovernanceDefinition,
  KnowledgeNode,
  TaxonomyDefinition
} from "@/types/content";

export function RelatedView({
  node,
  registry,
  taxonomy,
  governance
}: {
  node: KnowledgeNode;
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  governance: GovernanceDefinition;
}) {
  const outgoing = resolveOutgoingRelationships(node, registry, taxonomy);
  const incoming = resolveIncomingRelationships(node, registry, taxonomy);
  const primaryRoute =
    node.route && !node.route.startsWith("/related/") ? node.route : undefined;

  return (
    <div className="space-y-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Playbook
      </Link>

      <header className="rounded-3xl border bg-gradient-to-br from-background to-muted/40 p-7 sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {node.collection} · {node.id}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {node.title}
            </h1>
            {node.summary ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                {node.summary}
              </p>
            ) : null}
          </div>
          {primaryRoute ? (
            <Link href={primaryRoute} className="panel-action-primary">
              Open primary view
              <IconToken token="arrow-up-right" className="size-4" />
            </Link>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Outgoing relationships</h2>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {outgoing.length}
            </span>
          </div>
          <RelationshipSections relationships={outgoing} />
        </section>

        <section className="rounded-2xl border p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Incoming relationships</h2>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              {incoming.length}
            </span>
          </div>
          <RelationshipSections
            relationships={incoming}
            perspective="incoming"
          />
        </section>
      </div>

      {node.attributes && Object.keys(node.attributes).length ? (
        <section className="rounded-2xl border p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold">Node metadata</h2>
          <MetadataValueView value={node.attributes} />
        </section>
      ) : null}

      <section className="rounded-2xl border p-5 sm:p-6">
        <h2 className="mb-5 text-lg font-semibold">Governance</h2>
        <GovernanceSection
          governance={node.governance}
          lifecycle={
            typeof node.attributes?.lifecycle === "string"
              ? node.attributes.lifecycle
              : undefined
          }
          taxonomy={taxonomy}
          definition={governance}
        />
      </section>
    </div>
  );
}
