import Link from "next/link";
import { IconToken } from "@/components/metadata/icon-token";
import type { NavigationNode } from "@/types/content";

function NavigationItems({ items }: { items: NavigationNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          {item.route ? (
            <Link
              href={item.route}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              {item.icon ? (
                <IconToken token={item.icon} className="size-4 shrink-0" />
              ) : null}
              <span>{item.label}</span>
            </Link>
          ) : (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.label}
            </div>
          )}
          {item.children?.length ? (
            <div className="ml-4 border-l pl-2">
              <NavigationItems items={item.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function Navigation({ items }: { items: NavigationNode[] }) {
  return <NavigationItems items={items} />;
}
