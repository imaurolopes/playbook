import type { Metadata } from "next";
import { RelationshipExplorer } from "@/components/relationships/relationship-explorer";
import {
  getRelationshipExplorer,
  getTaxonomy,
  getViews
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { buildRelationshipEdgeIndex } from "@/lib/relationships/explorer";

export const metadata: Metadata = {
  title: "Relationship Explorer",
  description: "Explore relationships and impact across Playbook knowledge."
};

export default function RelationshipsPage() {
  const registry = getKnowledgeRegistry();
  const taxonomy = getTaxonomy();
  const definition = getRelationshipExplorer();
  return (
    <RelationshipExplorer
      edges={buildRelationshipEdgeIndex(registry, taxonomy, definition)}
      registry={registry}
      taxonomy={taxonomy}
      definition={definition}
      breadcrumbs={getViews().viewEngine.breadcrumbs}
    />
  );
}
