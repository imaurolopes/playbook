import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type {
  Entry,
  KnowledgeNode,
  MetadataValue,
  Relationship
} from "@/types/content";
import { getEntries } from "@/lib/content/load";

const contentRoot = path.join(process.cwd(), "content");
const documentsRoot = path.join(contentRoot, "documents");

interface GenericRecord {
  id: string;
  title: string;
  summary?: string;
  attributes?: Record<string, MetadataValue>;
  relationships?: Relationship[];
  supportingMaterials?: Array<{
    locator: string;
    label?: string;
    kind?: string;
  }>;
}

interface DocumentMetadata {
  id?: string;
  title?: string;
  summary?: string;
  attributes?: Record<string, MetadataValue>;
  relationships?: Relationship[];
}

function listFiles(directory: string, pattern: RegExp): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const itemPath = path.join(directory, item.name);
    if (item.isDirectory()) return listFiles(itemPath, pattern);
    return pattern.test(item.name) ? [itemPath] : [];
  });
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function documentId(relativePath: string) {
  return `document-${normalizePath(relativePath)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
}

function parseFrontMatter(contents: string): {
  metadata: DocumentMetadata;
  body: string;
} {
  if (!contents.startsWith("---\n") && !contents.startsWith("---\r\n")) {
    return { metadata: {}, body: contents };
  }

  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: contents };

  return {
    metadata: (parse(match[1]) ?? {}) as DocumentMetadata,
    body: contents.slice(match[0].length)
  };
}

function markdownTitle(body: string, fallback: string) {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || fallback;
}

function getSources(): GenericRecord[] {
  return listFiles(path.join(contentRoot, "sources"), /\.ya?ml$/i).map(
    (filePath) => parse(fs.readFileSync(filePath, "utf8")) as GenericRecord
  );
}

function referencedDocumentPaths(entries: Entry[], sources: GenericRecord[]) {
  const referenced = new Set<string>();

  for (const entry of entries) {
    for (const document of entry.documents ?? []) {
      referenced.add(normalizePath(document.path));
    }
  }

  for (const source of sources) {
    for (const material of source.supportingMaterials ?? []) {
      const locator = normalizePath(material.locator);
      const candidate = path.join(documentsRoot, locator);
      if (fs.existsSync(candidate)) referenced.add(locator);
    }
  }

  return referenced;
}

function getDocumentNodes(
  entries: Entry[],
  sources: GenericRecord[]
): KnowledgeNode[] {
  const referenced = referencedDocumentPaths(entries, sources);

  return listFiles(documentsRoot, /\.mdx?$/i).flatMap((filePath) => {
    const relativePath = normalizePath(path.relative(documentsRoot, filePath));
    const contents = fs.readFileSync(filePath, "utf8");
    const { metadata, body } = parseFrontMatter(contents);

    if (!metadata.id && !referenced.has(relativePath)) return [];

    const fallbackTitle = path
      .basename(relativePath, path.extname(relativePath))
      .replace(/[-_]/g, " ");

    return [
      {
        id: metadata.id ?? documentId(relativePath),
        title: metadata.title ?? markdownTitle(body, fallbackTitle),
        summary: metadata.summary,
        collection: "documents",
        route: `/related/${encodeURIComponent(
          metadata.id ?? documentId(relativePath)
        )}`,
        attributes: {
          ...(metadata.attributes ?? {}),
          path: relativePath
        },
        relationships: metadata.relationships ?? []
      }
    ];
  });
}

function entryNode(entry: Entry): KnowledgeNode {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    collection: "entries",
    route: entry.route,
    attributes: entry.attributes,
    relationships: entry.relationships
  };
}

function sourceNode(source: GenericRecord): KnowledgeNode {
  return {
    id: source.id,
    title: source.title,
    summary: source.summary,
    collection: "sources",
    route: `/related/${encodeURIComponent(source.id)}`,
    attributes: source.attributes,
    relationships: source.relationships
  };
}

export function getKnowledgeRegistry(): KnowledgeNode[] {
  const entries = getEntries();
  const sources = getSources();
  const nodes = [
    ...entries.map(entryNode),
    ...sources.map(sourceNode),
    ...getDocumentNodes(entries, sources)
  ];
  const unique = new Map<string, KnowledgeNode>();

  for (const node of nodes) {
    if (!unique.has(node.id)) unique.set(node.id, node);
  }

  return [...unique.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function getKnowledgeNode(id: string) {
  return getKnowledgeRegistry().find((node) => node.id === id);
}

export function getRelatedRoute(id: string) {
  return `/related/${encodeURIComponent(id)}`;
}
