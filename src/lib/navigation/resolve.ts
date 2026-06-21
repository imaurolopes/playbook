import type { Entry, NavigationNode } from "@/types/content";

export function resolveNavigation(
  nodes: NavigationNode[],
  entries: Entry[]
): NavigationNode[] {
  return nodes.map((node) => {
    const entry = node.entry
      ? entries.find((candidate) => candidate.id === node.entry)
      : undefined;

    return {
      ...node,
      label: entry?.title ?? node.label,
      route: entry?.route ?? node.route,
      children: node.children
        ? resolveNavigation(node.children, entries)
        : undefined
    };
  });
}
