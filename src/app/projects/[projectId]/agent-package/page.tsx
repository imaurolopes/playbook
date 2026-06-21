import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentPackageView } from "@/components/projects/agent-package-view";
import {
  getEntries,
  getProjectById,
  getProjectOutputs,
  getProjects,
  getTaxonomy,
  getViews
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { generateAgentPackage } from "@/lib/projects/agent-package";

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
    ? {
        title: `${project.title} Agent Package`,
        description: `Structured context package generated from ${project.title}.`
      }
    : { title: "Agent package not found" };
}

export default async function AgentPackagePage({ params }: PageProps) {
  const project = getProjectById((await params).projectId);
  if (!project) notFound();

  const views = getViews();
  if (!views.agentPackage) notFound();

  const generated = generateAgentPackage({
    project,
    outputs: getProjectOutputs(project.id),
    entries: getEntries(),
    registry: getKnowledgeRegistry(),
    taxonomy: getTaxonomy(),
    definition: views.agentPackage
  });

  return (
    <AgentPackageView
      project={project}
      files={generated.files}
      summary={generated.summary}
      definition={views.agentPackage}
      breadcrumbs={views.viewEngine.breadcrumbs}
    />
  );
}
