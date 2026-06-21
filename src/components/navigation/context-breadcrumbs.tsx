import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbDefinition } from "@/types/content";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function ContextBreadcrumbs({
  config,
  context,
  items
}: {
  config?: BreadcrumbDefinition;
  context: string;
  items: BreadcrumbItem[];
}) {
  if (
    config?.enabled === false ||
    (config?.showOn?.length && !config.showOn.includes(context))
  ) {
    return null;
  }

  const trail: BreadcrumbItem[] = [
    {
      label: config?.rootLabel ?? "Home",
      href: config?.rootRoute ?? "/"
    },
    ...items
  ];

  return (
    <nav aria-label="Breadcrumb" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1.5 text-xs text-muted-foreground">
        {trail.map((item, index) => {
          const current = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index ? <ChevronRight className="size-3" /> : null}
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="transition hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={current ? "font-medium text-foreground" : ""}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
