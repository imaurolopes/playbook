import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  Entry,
  NavigationDefinition,
  ProjectOutput,
  ProjectWorkspace,
  SchemasDefinition,
  TaxonomyDefinition,
  ThemeDefinition,
  ViewsDefinition
} from "@/types/content";

const contentRoot = path.join(process.cwd(), "content");

function readYaml<T>(relativePath: string): T {
  const filePath = path.join(contentRoot, relativePath);
  return parse(fs.readFileSync(filePath, "utf8")) as T;
}

function listYamlFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const itemPath = path.join(directory, item.name);
    if (item.isDirectory()) return listYamlFiles(itemPath);
    return /\.ya?ml$/i.test(item.name) ? [itemPath] : [];
  });
}

export function getEntries(): Entry[] {
  return listYamlFiles(path.join(contentRoot, "entries"))
    .map((filePath) => parse(fs.readFileSync(filePath, "utf8")) as Entry)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getEntryByRoute(route: string): Entry | undefined {
  const normalized = route.replace(/^\/|\/$/g, "");
  return getEntries().find(
    (entry) => entry.route.replace(/^\/|\/$/g, "") === normalized
  );
}

export function getEntryById(id: string): Entry | undefined {
  return getEntries().find((entry) => entry.id === id);
}

export function getProjects(): ProjectWorkspace[] {
  return listYamlFiles(path.join(contentRoot, "projects"))
    .filter((filePath) => path.basename(filePath).toLowerCase() === "project.yaml")
    .map(
      (filePath) =>
        parse(fs.readFileSync(filePath, "utf8")) as ProjectWorkspace
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getProjectById(id: string): ProjectWorkspace | undefined {
  return getProjects().find((project) => project.id === id);
}

export function getProjectOutputs(projectId?: string): ProjectOutput[] {
  return listYamlFiles(path.join(contentRoot, "projects"))
    .filter((filePath) => path.basename(filePath).toLowerCase() !== "project.yaml")
    .map((filePath) => parse(fs.readFileSync(filePath, "utf8")) as ProjectOutput)
    .filter(
      (output) =>
        output.schema === "project-output" &&
        (!projectId || output.project === projectId)
    )
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getNavigation(): NavigationDefinition {
  return readYaml<NavigationDefinition>("system/navigation.yaml");
}

export function getTaxonomy(): TaxonomyDefinition {
  return readYaml<TaxonomyDefinition>("system/taxonomy.yaml");
}

export function getViews(): ViewsDefinition {
  return readYaml<ViewsDefinition>("system/views.yaml");
}

export function getSchemas(): SchemasDefinition {
  return readYaml<SchemasDefinition>("system/schemas.yaml");
}

export function getTheme(): ThemeDefinition {
  return readYaml<ThemeDefinition>("system/themes.yaml");
}

export function getDocument(relativePath: string): string | undefined {
  const documentsRoot = path.resolve(contentRoot, "documents");
  const requestedPath = path.resolve(documentsRoot, relativePath);

  if (
    !requestedPath.startsWith(`${documentsRoot}${path.sep}`) ||
    !fs.existsSync(requestedPath)
  ) {
    return undefined;
  }

  return fs.readFileSync(requestedPath, "utf8");
}
