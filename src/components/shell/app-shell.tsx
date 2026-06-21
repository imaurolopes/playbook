import type { ReactNode } from "react";
import { getEntries, getNavigation, getTaxonomy } from "@/lib/content/load";
import { resolveNavigation } from "@/lib/navigation/resolve";
import { SidebarShell } from "@/components/shell/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const definition = getNavigation();
  const items = resolveNavigation(
    definition.items,
    getEntries(),
    getTaxonomy()
  );

  return (
    <SidebarShell title={definition.title} items={items}>
      {children}
    </SidebarShell>
  );
}
