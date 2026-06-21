"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconToken } from "@/components/metadata/icon-token";
import type { NavigationNode } from "@/types/content";

function isActiveRoute(pathname: string, route?: string) {
  if (!route) return false;
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

function NavigationItems({
  items,
  expanded,
  depth = 0,
  onNavigate
}: {
  items: NavigationNode[];
  expanded: boolean;
  depth?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <ul className={depth === 0 ? "space-y-1.5" : "space-y-1"}>
      {items.map((item, index) => {
        const active = isActiveRoute(pathname, item.route);
        const hasChildren = Boolean(item.children?.length);
        const isSection = !item.route;

        if (!expanded && isSection) {
          if (!item.icon) return null;

          return (
            <li key={`${item.label}-${index}`} className="pt-1">
              <div
                className="group relative flex justify-center"
                title={item.label}
              >
                <span className="grid size-10 place-items-center rounded-lg text-muted-foreground">
                  <IconToken token={item.icon} className="size-5" />
                </span>
                <span className="sidebar-tooltip">{item.label}</span>
              </div>
            </li>
          );
        }

        return (
          <li key={`${item.label}-${index}`}>
            {item.route ? (
              <div className="group relative">
                <Link
                  href={item.route}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={!expanded ? item.label : undefined}
                  className={`flex min-h-10 items-center rounded-lg text-sm transition ${
                    expanded
                      ? "gap-3 px-3"
                      : "justify-center px-0"
                  } ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <IconToken
                    token={item.icon}
                    className="size-4 shrink-0"
                  />
                  {expanded ? (
                    <span className="min-w-0 truncate">{item.label}</span>
                  ) : null}
                </Link>
                {!expanded ? (
                  <span className="sidebar-tooltip">{item.label}</span>
                ) : null}
              </div>
            ) : (
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="flex items-center gap-2">
                  {item.icon ? (
                    <IconToken token={item.icon} className="size-3.5" />
                  ) : null}
                  {item.label}
                </span>
              </div>
            )}

            {expanded && hasChildren ? (
              <div className="ml-4 border-l pl-2">
                <NavigationItems
                  items={item.children!}
                  expanded={expanded}
                  depth={depth + 1}
                  onNavigate={onNavigate}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function SidebarNavigation({
  items,
  expanded,
  onNavigate
}: {
  items: NavigationNode[];
  expanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary navigation">
      <NavigationItems
        items={items}
        expanded={expanded}
        onNavigate={onNavigate}
      />
    </nav>
  );
}
