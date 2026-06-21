import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalView } from "@/components/home/local-view";
import { NodeViewRenderer } from "@/components/views/node-view-renderer";
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
import { resolveViewLayout } from "@/lib/views/engine";

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
  const views = getViews();
  const taxonomy = getTaxonomy();
  const registry = getKnowledgeRegistry();

  if (entry) {
    const layout = resolveViewLayout(views, {
      nodeId: entry.id,
      attributes: entry.attributes
    });
    const view =
      views.views.find((candidate) => candidate.source === "entries") ??
      views.views[0];

    return view ? (
      <NodeViewRenderer
        entry={entry}
        registry={registry}
        taxonomy={taxonomy}
        view={view}
        layout={layout}
        categoryAttribute={views.viewEngine.selectors?.categoryAttribute}
      />
    ) : null;
  }

  const relatedId =
    slug[0] === "related" && slug.length === 2
      ? decodeURIComponent(slug[1])
      : undefined;
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

  const viewMatch = resolveTaxonomyViewRoute(route, views, taxonomy);
  if (!viewMatch) notFound();

  const entries = filterEntriesForRoute(getEntries(), viewMatch.localView, {
    value: viewMatch.parameter
  });
  const layout = resolveViewLayout(views, {
    level: viewMatch.localView.displayLevel,
    categories: [viewMatch.parameter]
  });

  return (
    <LocalView
      option={viewMatch.option}
      entries={entries}
      taxonomy={taxonomy}
      view={viewMatch.localView}
      registry={registry}
      layout={layout}
    />
  );
}
