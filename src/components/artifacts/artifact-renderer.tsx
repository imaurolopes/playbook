import Link from "next/link";
import type { ReactNode } from "react";
import { RelationshipSections } from "@/components/relationships/relationship-sections";
import { GovernanceSection } from "@/components/governance/governance-section";
import { ValueRenderer } from "@/components/renderers/value-renderer";
import {
  resolveIncomingRelationships,
  resolveOutgoingRelationships
} from "@/lib/relationships/resolve";
import type {
  Entry,
  GovernanceDefinition,
  KnowledgeNode,
  MetadataValue,
  TaxonomyDefinition
} from "@/types/content";

const labels: Record<string, string> = {
  overview: "Overview",
  inputs: "Required Inputs",
  sections: "Template Sections",
  completionCriteria: "Completion Criteria",
  prerequisites: "Prerequisites",
  items: "Checklist Items",
  evidenceRequirements: "Evidence Requirements",
  principles: "Principles",
  recommendations: "Recommendations",
  antiPatterns: "Anti-patterns",
  examples: "Examples",
  options: "Options",
  criteria: "Decision Criteria",
  rules: "Decision Rules",
  references: "References",
  relationships: "Relationships",
  governance: "Governance"
};

function ArtifactSection({
  id,
  children
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-background p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">{labels[id] ?? id}</h2>
      {children}
    </section>
  );
}

function ListValue({ value }: { value?: MetadataValue[] }) {
  return value?.length ? (
    <ValueRenderer value={value} />
  ) : (
    <p className="text-sm text-muted-foreground">Not specified.</p>
  );
}

function ReferenceList({
  references,
  registry
}: {
  references?: MetadataValue[];
  registry: KnowledgeNode[];
}) {
  const items = (references ?? []).flatMap((reference) => {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
      return [];
    }
    const target =
      typeof reference.target === "string" ? reference.target : undefined;
    if (!target) return [];
    const node = registry.find((candidate) => candidate.id === target);
    const label =
      typeof reference.label === "string"
        ? reference.label
        : node?.title ?? target;
    return [{ target, label, node }];
  });

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No references.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(({ target, label, node }) => {
        const content = (
          <div className="rounded-xl border bg-muted/20 p-3 transition hover:bg-muted/50">
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {node?.collection ?? target}
            </p>
          </div>
        );
        return node?.route ? (
          <Link key={target} href={node.route}>
            {content}
          </Link>
        ) : (
          <div key={target}>{content}</div>
        );
      })}
    </div>
  );
}

export function ArtifactRenderer({
  entry,
  registry,
  taxonomy,
  sections,
  governance
}: {
  entry: Entry;
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  sections?: string[];
  governance: GovernanceDefinition;
}) {
  const orderedSections = sections ?? [
    "overview",
    "governance",
    "references",
    "relationships"
  ];
  const node = registry.find((candidate) => candidate.id === entry.id);
  const outgoing = node
    ? resolveOutgoingRelationships(node, registry, taxonomy)
    : [];
  const incoming = node
    ? resolveIncomingRelationships(node, registry, taxonomy)
    : [];
  const overview = entry.purpose ?? entry.decision ?? entry.summary;

  const content: Record<string, ReactNode> = {
    overview: (
      <div className="space-y-4">
        <p className="leading-7">{overview}</p>
        {entry.decision && entry.purpose ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Decision
            </h3>
            <p className="mt-2 leading-7">{entry.decision}</p>
          </div>
        ) : null}
      </div>
    ),
    inputs: <ListValue value={entry.requiredInputs} />,
    sections: <ListValue value={entry.sections} />,
    completionCriteria: <ListValue value={entry.completionCriteria} />,
    prerequisites: <ListValue value={entry.prerequisites} />,
    items: <ListValue value={entry.items} />,
    evidenceRequirements: <ListValue value={entry.evidenceRequirements} />,
    principles: <ListValue value={entry.principles} />,
    recommendations: <ListValue value={entry.recommendations} />,
    antiPatterns: <ListValue value={entry.antiPatterns} />,
    examples: <ListValue value={entry.examples} />,
    options: <ListValue value={entry.options} />,
    criteria: <ListValue value={entry.criteria} />,
    rules: <ListValue value={entry.rules} />,
    references: (
      <ReferenceList references={entry.references} registry={registry} />
    ),
    governance: (
      <GovernanceSection
        governance={entry.governance}
        lifecycle={
          typeof entry.attributes?.lifecycle === "string"
            ? entry.attributes.lifecycle
            : undefined
        }
        taxonomy={taxonomy}
        definition={governance}
      />
    ),
    relationships: (
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Outgoing
          </h3>
          <RelationshipSections relationships={outgoing} />
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Incoming
          </h3>
          <RelationshipSections
            relationships={incoming}
            perspective="incoming"
          />
        </div>
      </div>
    )
  };

  return (
    <article className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Reusable operational artifact
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">{entry.title}</h1>
        {entry.summary ? (
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
            {entry.summary}
          </p>
        ) : null}
      </header>

      <div className="space-y-5">
        {orderedSections.map((section) =>
          content[section] ? (
            <ArtifactSection key={section} id={section}>
              {content[section]}
            </ArtifactSection>
          ) : null
        )}
      </div>
    </article>
  );
}
