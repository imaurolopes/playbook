import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntryRenderer } from "@/components/renderers/entry-renderer";
import { LocalView } from "@/components/home/local-view";
import { RelatedView } from "@/components/relationships/related-view";
import {
  getEntries,
  getEntryByRoute,
  getTaxonomy,
  getViews
} from "@/lib/content/load";
import {
  getKnowledgeNode,
  getKnowledgeRegistry,
  getRelatedRoute
} from "@/lib/content/registry";
import {
  filterEntriesForRoute,
  getTaxonomyViewRoutes,
  resolveTaxonomyViewRoute
} from "@/lib/views/resolve";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

interface StaticParam {
  slug: string[];
}

export const dynamicParams = false;

export function generateStaticParams(): StaticParam[] {
  const routes = [
    ...getEntries().map((entry) => entry.route),
    ...getTaxonomyViewRoutes(getViews(), getTaxonomy()),
    ...getKnowledgeRegistry().map((node) => getRelatedRoute(node.id))
  ];

  return [...new Set(routes)].map((route) => {
    const slug = route
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    return { slug };
  });
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = slug.join("/");
  const entry = getEntryByRoute(route);
  const relatedId =
    slug[0] === "related" && slug.length === 2
      ? decodeURIComponent(slug[1])
      : undefined;
  const relatedNode = relatedId ? getKnowledgeNode(relatedId) : undefined;
  const viewMatch = resolveTaxonomyViewRoute(route, getViews(), getTaxonomy());

  if (entry) return { title: entry.title, description: entry.summary };
  if (relatedNode) {
    return {
      title: `Related: ${relatedNode.title}`,
      description: relatedNode.summary
    };
  }
  if (viewMatch) {
    return {
      title: viewMatch.option.label,
      description: viewMatch.option.summary
    };
  }

  return { title: "Not found" };
}

export default async function EntryPage({ params }: PageProps) {
  const { slug } = await params;
  const route = slug.join("/");
  const entry = getEntryByRoute(route);

  if (entry) return <EntryRenderer entry={entry} />;

  const taxonomy = getTaxonomy();
  const relatedId =
    slug[0] === "related" && slug.length === 2
      ? decodeURIComponent(slug[1])
      : undefined;
  const registry = getKnowledgeRegistry();
  const relatedNode = relatedId
    ? registry.find((node) => node.id === relatedId)
    : undefined;

  if (relatedNode) {
    return (
      <RelatedView
        node={relatedNode}
        registry={registry}
        taxonomy={taxonomy}
      />
    );
  }

  const viewMatch = resolveTaxonomyViewRoute(route, getViews(), taxonomy);
  if (!viewMatch) notFound();

  const entries = filterEntriesForRoute(getEntries(), viewMatch.localView, {
    value: viewMatch.parameter
  });

  return (
    <LocalView
      option={viewMatch.option}
      entries={entries}
      taxonomy={taxonomy}
      view={viewMatch.localView}
      registry={registry}
    />
  );
}
