import type { Metadata } from "next";
import { GovernanceDashboard } from "@/components/governance/governance-dashboard";
import {
  getGovernance,
  getTaxonomy,
  getViews
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { buildGovernanceIndex } from "@/lib/governance/index";

export const metadata: Metadata = {
  title: "Governance",
  description: "Content lifecycle, ownership, confidence, and review health."
};

export default function GovernancePage() {
  const definition = getGovernance();
  return (
    <GovernanceDashboard
      items={buildGovernanceIndex(getKnowledgeRegistry(), definition)}
      definition={definition}
      taxonomy={getTaxonomy()}
      breadcrumbs={getViews().viewEngine.breadcrumbs}
    />
  );
}
