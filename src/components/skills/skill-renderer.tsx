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

const sectionLabels: Record<string, string> = {
  overview: "Overview",
  inputs: "Inputs",
  questions: "Questions",
  decisionRules: "Decision Rules",
  outputs: "Outputs",
  guidance: "Guidance",
  risks: "Risks",
  checklist: "Checklist",
  references: "References",
  relationships: "Relationships",
  governance: "Governance"
};

function SkillSection({
  id,
  children
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-background p-5 sm:p-6">
      <h2 className="mb-4 text-lg font-semibold">
        {sectionLabels[id] ?? id}
      </h2>
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

export function SkillRenderer({
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
    "inputs",
    "questions",
    "decisionRules",
    "outputs",
    "guidance",
    "risks",
    "checklist",
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

  const content: Record<string, ReactNode> = {
    overview: (
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Objective
          </h3>
          <p className="mt-2 leading-7">{entry.objective}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            When to use
          </h3>
          <div className="mt-2">
            <ListValue value={entry.whenToUse} />
          </div>
        </div>
      </div>
    ),
    inputs: <ListValue value={entry.requiredInputs} />,
    questions: <ListValue value={entry.questions} />,
    decisionRules: <ListValue value={entry.decisionRules} />,
    outputs: <ListValue value={entry.expectedOutputs} />,
    guidance: <ListValue value={entry.guidance} />,
    risks: <ListValue value={entry.risks} />,
    checklist: <ListValue value={entry.checklist} />,
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
          Operational knowledge
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
            <SkillSection key={section} id={section}>
              {content[section]}
            </SkillSection>
          ) : null
        )}
      </div>
    </article>
  );
}
