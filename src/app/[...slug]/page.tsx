import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntryRenderer } from "@/components/renderers/entry-renderer";
import { getEntries, getEntryByRoute } from "@/lib/content/load";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

interface StaticParam {
  slug: string[];
}

export const dynamicParams = false;

export function generateStaticParams(): StaticParam[] {
  return getEntries().map(({ route }) => {
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
  const entry = getEntryByRoute(slug.join("/"));

  return entry
    ? { title: entry.title, description: entry.summary }
    : { title: "Not found" };
}

export default async function EntryPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = getEntryByRoute(slug.join("/"));

  if (!entry) notFound();

  return <EntryRenderer entry={entry} />;
}
