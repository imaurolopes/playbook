import type { ReactNode } from "react";
import {
  getEntries,
  getNavigation,
  getSearch,
  getTaxonomy
} from "@/lib/content/load";
import { getKnowledgeRegistry } from "@/lib/content/registry";
import { resolveNavigation } from "@/lib/navigation/resolve";
import { buildSearchIndex } from "@/lib/search/index";
import { SidebarShell } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const definition = getNavigation();
  const taxonomy = getTaxonomy();
  const search = getSearch();
  const items = resolveNavigation(
    definition.items,
    getEntries(),
    taxonomy
  );
  const searchIndex = buildSearchIndex(
    getKnowledgeRegistry(),
    taxonomy,
    search
  );

  return (
    <SidebarShell
      title={definition.title}
      items={items}
      searchIndex={searchIndex}
      search={search}
    >
      {children}
    </SidebarShell>
  );
}
