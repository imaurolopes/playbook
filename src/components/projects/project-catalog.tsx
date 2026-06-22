import Link from "next/link";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import { IconToken } from "@/components/metadata/icon-token";
import { GovernanceBadges } from "@/components/governance/governance-badges";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  BreadcrumbDefinition,
  GovernanceDefinition,
  ProjectWorkspace,
  TaxonomyDefinition
} from "@/types/content";

export function ProjectCatalog({
  projects,
  taxonomy,
  breadcrumbs,
  governance
}: {
  projects: ProjectWorkspace[];
  taxonomy: TaxonomyDefinition;
  breadcrumbs?: BreadcrumbDefinition;
  governance: GovernanceDefinition;
}) {
  const statusDimension = resolveTaxonomyDimension(taxonomy, "projectStatus");

  return (
    <div className="space-y-8">
      <ContextBreadcrumbs
        config={breadcrumbs}
        context="local"
        items={[{ label: "Projects" }]}
      />
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Workspaces
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Concrete initiatives that apply reusable knowledge and produce
          project-specific evidence, decisions, and outputs.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const status = resolveTaxonomyOption(statusDimension, project.status);
          return (
            <Link
              key={project.id}
              href={project.route}
              className="group rounded-2xl border bg-card p-5 transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className="grid size-10 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: status.color }}
                >
                  <IconToken token={status.icon ?? "folder-kanban"} className="size-5" />
                </span>
                <span
                  className="rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ color: status.color, borderColor: `${status.color}55` }}
                >
                  {status.label}
                </span>
              </div>
              <h2 className="mt-5 text-xl font-semibold group-hover:text-primary">
                {project.title}
              </h2>
              {project.summary ? (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {project.summary}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{project.stages?.length ?? 0} stages</span>
                <span>·</span>
                <span>{project.outputs?.length ?? 0} outputs</span>
              </div>
              <div className="mt-4">
                <GovernanceBadges
                  governance={project.governance}
                  lifecycle={project.lifecycle}
                  taxonomy={taxonomy}
                  definition={governance}
                  compact
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
