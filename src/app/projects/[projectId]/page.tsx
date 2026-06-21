import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectWorkspaceRenderer } from "@/components/projects/project-workspace-renderer";
import {
  getProjectById,
  getProjectOutputs,
  getProjects,
  getTaxonomy,
  getViews
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { resolveViewLayout } from "@/lib/views/engine";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getProjects().map((project) => ({ projectId: project.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const project = getProjectById((await params).projectId);
  return project
    ? { title: project.title, description: project.summary }
    : { title: "Project not found" };
}

export default async function ProjectPage({ params }: PageProps) {
  const project = getProjectById((await params).projectId);
  if (!project) notFound();

  const views = getViews();
  const taxonomy = getTaxonomy();
  const layout = resolveViewLayout(views, {
    nodeId: project.id,
    schema: project.schema,
    attributes: {
      ...(project.attributes ?? {}),
      lifecycle: project.lifecycle,
      categories: project.categories ?? []
    }
  });

  return (
    <ProjectWorkspaceRenderer
      project={project}
      outputs={getProjectOutputs(project.id)}
      registry={getKnowledgeRegistry()}
      taxonomy={taxonomy}
      layout={layout}
      relationshipGraph={views.viewEngine.panels?.relationshipGraph}
      levelDimension={views.viewEngine.selectors?.levelAttribute}
      breadcrumbs={views.viewEngine.breadcrumbs}
    />
  );
}
