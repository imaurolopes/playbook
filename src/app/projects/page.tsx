import type { Metadata } from "next";
import { ProjectCatalog } from "@/components/projects/project-catalog";
import { getProjects, getTaxonomy, getViews } from "@/lib/content/load";

export const metadata: Metadata = {
  title: "Projects",
  description: "Project workspaces that operationalize reusable Playbook knowledge."
};

export default function ProjectsPage() {
  return (
    <ProjectCatalog
      projects={getProjects()}
      taxonomy={getTaxonomy()}
      breadcrumbs={getViews().viewEngine.breadcrumbs}
    />
  );
}
