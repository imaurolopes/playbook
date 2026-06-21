"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconToken } from "@/components/metadata/icon-token";
import { SidebarNavigation } from "@/components/shell/sidebar-navigation";
import { SidebarToggle } from "@/components/shell/sidebar-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useSidebarState } from "@/components/shell/use-sidebar-state";
import type { NavigationNode } from "@/types/content";

function SidebarBody({
  title,
  items,
  expanded,
  onToggle,
  onNavigate,
  mobile = false
}: {
  title: string;
  items: NavigationNode[];
  expanded: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex h-16 shrink-0 items-center border-b ${
          expanded ? "justify-between gap-3 px-3" : "justify-center px-2"
        }`}
      >
        {expanded || !onToggle ? (
          <Link
            href="/"
            onClick={onNavigate}
            className={`flex min-w-0 items-center ${
              expanded ? "gap-3" : "justify-center"
            }`}
            title={!expanded ? title : undefined}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <IconToken token="book-open" className="size-4" />
            </span>
            {expanded ? (
              <span className="truncate font-semibold tracking-tight">
                {title}
              </span>
            ) : null}
          </Link>
        ) : null}
        {onToggle ? (
          <SidebarToggle
            expanded={expanded}
            onClick={onToggle}
            controls="desktop-sidebar"
          />
        ) : null}
        {mobile ? (
          <button
            type="button"
            onClick={onNavigate}
            className="grid size-9 place-items-center rounded-lg border text-muted-foreground"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <SidebarNavigation
          items={items}
          expanded={expanded}
          onNavigate={onNavigate}
        />
      </div>

      <div
        className={`flex shrink-0 items-center border-t p-2 ${
          expanded ? "justify-between" : "flex-col gap-2"
        }`}
      >
        <ThemeToggle />
      </div>
    </div>
  );
}

export function SidebarShell({
  title,
  items,
  children
}: {
  title: string;
  items: NavigationNode[];
  children: ReactNode;
}) {
  const sidebar = useSidebarState();

  return (
    <div
      className="min-h-screen bg-background"
      data-sidebar-ready={sidebar.ready}
      data-sidebar-expanded={sidebar.expanded}
    >
      <aside
        id="desktop-sidebar"
        className={`fixed inset-y-0 left-0 z-40 hidden border-r bg-background/95 shadow-sm backdrop-blur transition-[width] duration-300 ease-out md:block ${
          sidebar.expanded ? "w-64" : "w-[4.5rem]"
        }`}
      >
        <SidebarBody
          title={title}
          items={items}
          expanded={sidebar.expanded}
          onToggle={sidebar.toggle}
        />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={sidebar.openMobile}
          className="grid size-10 place-items-center rounded-lg border text-muted-foreground"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" className="font-semibold">
          {title}
        </Link>
        <ThemeToggle />
      </header>

      {sidebar.mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={sidebar.closeMobile}
          />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,20rem)] border-r bg-background shadow-2xl">
            <SidebarBody
              title={title}
              items={items}
              expanded
              mobile
              onNavigate={sidebar.closeMobile}
            />
          </aside>
        </div>
      ) : null}

      <div
        className={`transition-[padding] duration-300 ease-out ${
          sidebar.expanded ? "md:pl-64" : "md:pl-[4.5rem]"
        }`}
      >
        <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
