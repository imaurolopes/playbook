import Link from "next/link";
import { IconToken } from "@/components/metadata/icon-token";
import { MetadataValueView } from "@/components/home/metadata-value";
import { GovernanceSection } from "@/components/governance/governance-section";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import { RelationshipSections } from "@/components/relationships/relationship-sections";
import { ContextualPanels } from "@/components/views/contextual-panels";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import {
  resolveIncomingRelationships,
  resolveOutgoingRelationships
} from "@/lib/relationships/resolve";
import type {
  BreadcrumbDefinition,
  GovernanceDefinition,
  KnowledgeNode,
  MetadataValue,
  ProjectOutput,
  ProjectWorkspace,
  RelationshipGraphPanelDefinition,
  ResolvedViewLayout,
  TaxonomyDefinition
} from "@/types/content";

function record(value: MetadataValue): Record<string, MetadataValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function reference(value: MetadataValue) {
  if (typeof value === "string") return { target: value };
  const item = record(value);
  return {
    target: typeof item?.target === "string" ? item.target : undefined,
    label: typeof item?.label === "string" ? item.label : undefined
  };
}

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ReferenceList({
  values,
  registry
}: {
  values?: MetadataValue[];
  registry: KnowledgeNode[];
}) {
  if (!values?.length) {
    return <p className="text-sm text-muted-foreground">None selected.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {values.map((value, index) => {
        const item = reference(value);
        const node = item.target
          ? registry.find((candidate) => candidate.id === item.target)
          : undefined;
        const body = (
          <div className="rounded-xl border p-3 transition hover:bg-muted/50">
            <p className="font-medium">{item.label ?? node?.title ?? item.target ?? `Item ${index + 1}`}</p>
            {node ? (
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {node.collection}
              </p>
            ) : null}
          </div>
        );
        return node?.route ? (
          <Link key={`${item.target}-${index}`} href={node.route}>{body}</Link>
        ) : (
          <div key={`${item.target}-${index}`}>{body}</div>
        );
      })}
    </div>
  );
}

export function ProjectWorkspaceRenderer({
  project,
  outputs,
  registry,
  taxonomy,
  layout,
  relationshipGraph,
  levelDimension,
  breadcrumbs,
  governance
}: {
  project: ProjectWorkspace;
  outputs: ProjectOutput[];
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  layout: ResolvedViewLayout;
  relationshipGraph?: RelationshipGraphPanelDefinition;
  levelDimension?: string;
  breadcrumbs?: BreadcrumbDefinition;
  governance: GovernanceDefinition;
}) {
  const root = registry.find((node) => node.id === project.id);
  const status = resolveTaxonomyOption(
    resolveTaxonomyDimension(taxonomy, "projectStatus"),
    project.status
  );
  const lifecycle = resolveTaxonomyOption(
    resolveTaxonomyDimension(taxonomy, "lifecycle"),
    project.lifecycle
  );
  const stageDimension = resolveTaxonomyDimension(taxonomy, "projectStage");
  const outgoing = root
    ? resolveOutgoingRelationships(root, registry, taxonomy)
    : [];
  const incoming = root
    ? resolveIncomingRelationships(root, registry, taxonomy)
    : [];
  const sections = layout.detailSections ?? [];

  const content: Record<string, React.ReactNode> = {
    overview: (
      <Section title="Overview">
        <p className="text-muted-foreground">{project.summary}</p>
        {project.categories?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.categories.map((category) => (
              <span key={category} className="rounded-full border px-2.5 py-1 text-xs">
                {resolveTaxonomyOption(
                  resolveTaxonomyDimension(taxonomy, "categories"),
                  category
                ).label}
              </span>
            ))}
          </div>
        ) : null}
      </Section>
    ),
    governance: (
      <Section title="Governance">
        <GovernanceSection
          governance={project.governance}
          lifecycle={project.lifecycle}
          taxonomy={taxonomy}
          definition={governance}
        />
      </Section>
    ),
    status: (
      <Section title="Status">
        <div className="flex flex-wrap gap-3">
          {[status, lifecycle].map((item) => (
            <span
              key={item.value}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              style={{ color: item.color, borderColor: `${item.color}55` }}
            >
              <IconToken token={item.icon ?? "circle"} className="size-4" />
              {item.label}
            </span>
          ))}
        </div>
      </Section>
    ),
    stakeholders: <Section title="Stakeholders"><MetadataValueView value={project.stakeholders ?? []} /></Section>,
    constraints: <Section title="Constraints"><MetadataValueView value={project.constraints ?? []} /></Section>,
    stages: (
      <Section title="Stages">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(project.stages ?? []).map((value, index) => {
            const item = record(value);
            const stageValue = typeof item?.stage === "string" ? item.stage : "";
            const stage = resolveTaxonomyOption(stageDimension, stageValue);
            return (
              <article key={`${stageValue}-${index}`} className="rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg text-white" style={{ backgroundColor: stage.color }}>
                    <IconToken token={stage.icon ?? "milestone"} className="size-4" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{stage.label}</h3>
                    {typeof item?.status === "string" ? <p className="text-xs text-muted-foreground">{item.status}</p> : null}
                  </div>
                </div>
                {typeof item?.summary === "string" ? <p className="mt-3 text-sm text-muted-foreground">{item.summary}</p> : null}
              </article>
            );
          })}
        </div>
      </Section>
    ),
    selectedSkills: <Section title="Selected skills"><ReferenceList values={project.selectedSkills} registry={registry} /></Section>,
    selectedTemplates: <Section title="Selected templates"><ReferenceList values={project.selectedTemplates} registry={registry} /></Section>,
    selectedChecklists: <Section title="Selected checklists"><ReferenceList values={project.selectedChecklists} registry={registry} /></Section>,
    selectedDecisionMatrices: <Section title="Selected decision matrices"><ReferenceList values={project.selectedDecisionMatrices} registry={registry} /></Section>,
    selectedArtifacts: <Section title="Selected artifacts"><ReferenceList values={project.selectedArtifacts} registry={registry} /></Section>,
    risks: <Section title="Risks"><MetadataValueView value={project.risks ?? []} /></Section>,
    openQuestions: <Section title="Open questions"><MetadataValueView value={project.openQuestions ?? []} /></Section>,
    outputs: (
      <Section title="Outputs">
        <ReferenceList
          values={[
            ...(project.outputs ?? []),
            ...outputs
              .filter((output) => !(project.outputs ?? []).some((item) => reference(item).target === output.id))
              .map((output) => ({ target: output.id, label: output.title }))
          ]}
          registry={registry}
        />
      </Section>
    ),
    relationships: (
      <Section title="Relationships">
        <div className="grid gap-8 lg:grid-cols-2">
          <div><h3 className="mb-3 text-sm font-semibold">Outgoing</h3><RelationshipSections relationships={outgoing} /></div>
          <div><h3 className="mb-3 text-sm font-semibold">Incoming</h3><RelationshipSections relationships={incoming} perspective="incoming" /></div>
        </div>
      </Section>
    )
  };

  return (
    <div className="space-y-8" data-layout={layout.layout} data-view-source={layout.source}>
      <ContextBreadcrumbs
        config={breadcrumbs}
        context="detail"
        items={[{ label: "Projects", href: "/projects/" }, { label: project.title }]}
      />
      <header>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Project workspace</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">{project.title}</h1>
          </div>
          {project.actions?.length ? (
            <div className="flex flex-wrap gap-2">
              {project.actions.map((action) => (
                <Link
                  key={`${action.label}-${action.href}`}
                  href={action.href}
                  className={
                    action.appearance === "primary"
                      ? "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                      : "inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-medium"
                  }
                >
                  <IconToken token={action.icon} className="size-4" />
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <ContextualPanels
        roots={root ? [root] : []}
        registry={registry}
        taxonomy={taxonomy}
        layout={layout}
        relationshipGraph={relationshipGraph}
        levelDimension={levelDimension}
        contextTitle={project.title}
      />
      <div className="grid gap-5">
        {sections.map((section) => content[section] ? <div key={section}>{content[section]}</div> : null)}
      </div>
    </div>
  );
}
