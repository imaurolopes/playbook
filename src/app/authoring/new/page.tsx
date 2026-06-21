import type { Metadata } from "next";
import { AuthoringEditor } from "@/components/authoring/authoring-editor";
import { getSchemas, getTaxonomy } from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";

export const metadata: Metadata = {
  title: "New Item",
  description: "Create a Playbook YAML entry from schema metadata."
};

export default function NewAuthoringPage() {
  return (
    <AuthoringEditor
      mode="new"
      schemas={getSchemas()}
      taxonomy={getTaxonomy()}
      knownNodeIds={getKnowledgeRegistry().map((node) => node.id)}
    />
  );
}
