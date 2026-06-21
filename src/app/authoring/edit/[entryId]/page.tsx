import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthoringEditor } from "@/components/authoring/authoring-editor";
import {
  getEntries,
  getEntryById,
  getSchemas,
  getTaxonomy
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { entryToAuthoringDocument } from "@/lib/authoring/model";

interface PageProps {
  params: Promise<{ entryId: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return getEntries().map((entry) => ({ entryId: entry.id }));
}

export async function generateMetadata({
  params
}: PageProps): Promise<Metadata> {
  const { entryId } = await params;
  const entry = getEntryById(entryId);
  return {
    title: entry ? `Edit ${entry.title}` : "Edit Item"
  };
}

export default async function EditAuthoringPage({ params }: PageProps) {
  const { entryId } = await params;
  const entry = getEntryById(entryId);
  if (!entry) notFound();

  return (
    <AuthoringEditor
      mode="edit"
      schemas={getSchemas()}
      taxonomy={getTaxonomy()}
      knownNodeIds={getKnowledgeRegistry().map((node) => node.id)}
      initialDocument={entryToAuthoringDocument(entry)}
    />
  );
}
