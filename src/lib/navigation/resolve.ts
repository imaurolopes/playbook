import type {
  Entry,
  NavigationNode,
  TaxonomyDefinition,
  TaxonomyDimension
} from "@/types/content";
import { resolveTaxonomyDimension } from "@/lib/metadata/taxonomy";

function taxonomyChildren(
  node: NavigationNode,
  dimension: TaxonomyDimension
): NavigationNode[] {
  const optionNode = (value: string, label: string, icon?: string) => ({
    label,
    icon,
    route: node.routeTemplate?.replace("{value}", value)
  });

  if (node.hierarchy === "groups" && dimension.groups?.length) {
    return [...dimension.groups]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((group) => ({
        label: group.label,
        children: dimension.options
          .filter((option) => option.group === group.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((option) =>
            optionNode(option.value, option.label, option.icon)
          )
      }));
  }

  return [...dimension.options]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((option) => optionNode(option.value, option.label, option.icon));
}

export function resolveNavigation(
  nodes: NavigationNode[],
  entries: Entry[],
  taxonomy?: TaxonomyDefinition
): NavigationNode[] {
  return nodes.map((node) => {
    const entry = node.entry
      ? entries.find((candidate) => candidate.id === node.entry)
      : undefined;
    const dimension = node.taxonomy
      ? taxonomy && resolveTaxonomyDimension(taxonomy, node.taxonomy)
      : undefined;
    const generatedChildren = dimension
      ? taxonomyChildren(node, dimension)
      : undefined;

    return {
      ...node,
      label: entry?.title ?? node.label,
      route: entry?.route ?? node.route,
      children: generatedChildren
        ? resolveNavigation(generatedChildren, entries, taxonomy)
        : node.children
          ? resolveNavigation(node.children, entries, taxonomy)
          : undefined
    };
  });
}
