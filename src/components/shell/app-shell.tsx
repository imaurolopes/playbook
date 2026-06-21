import Link from "next/link";
import type { ReactNode } from "react";
import { getEntries, getNavigation, getTaxonomy } from "@/lib/content/load";
import { resolveNavigation } from "@/lib/navigation/resolve";
import { Navigation } from "@/components/shell/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const definition = getNavigation();
  const items = resolveNavigation(
    definition.items,
    getEntries(),
    getTaxonomy()
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="font-semibold">
            {definition.title}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="container grid gap-8 py-8 md:grid-cols-[240px_1fr]">
        <aside>
          <Navigation items={items} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
