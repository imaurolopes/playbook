import type {
  GovernanceDefinition,
  GovernanceFilterDefinition,
  GovernanceIndexItem,
  KnowledgeNode
} from "@/types/content";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function dateValue(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function fieldValue(item: GovernanceIndexItem, path: string | undefined) {
  if (!path) return undefined;
  let current: unknown = item;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function buildGovernanceIndex(
  registry: KnowledgeNode[],
  definition: GovernanceDefinition
): GovernanceIndexItem[] {
  const asOf = dateValue(definition.asOf) ?? new Date();
  const recentDays = definition.recentlyApprovedDays ?? 90;
  const recentThreshold = new Date(
    asOf.getTime() - recentDays * 24 * 60 * 60 * 1000
  );

  return registry
    .filter((node): node is KnowledgeNode & { route: string } => Boolean(node.route))
    .map((node) => {
      const lifecycle = stringValue(node.attributes?.lifecycle);
      const nextReview = dateValue(node.governance?.nextReviewAt);
      const lastReview = dateValue(node.governance?.lastReviewedAt);
      return {
        id: node.id,
        title: node.title,
        summary: node.summary,
        route: node.route,
        collection: node.collection,
        lifecycle,
        governance: node.governance,
        reviewOverdue: Boolean(nextReview && nextReview < asOf),
        missingOwner: !node.governance?.owner?.trim(),
        recentlyApproved: Boolean(
          lifecycle === "approved" &&
            lastReview &&
            lastReview >= recentThreshold &&
            lastReview <= asOf
        )
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function governanceDerivedState(
  governance: KnowledgeNode["governance"],
  definition: GovernanceDefinition
) {
  const asOf = dateValue(definition.asOf) ?? new Date();
  const nextReview = dateValue(governance?.nextReviewAt);
  return {
    reviewOverdue: Boolean(nextReview && nextReview < asOf),
    missingOwner: !governance?.owner?.trim()
  };
}

export function applyGovernanceFilter(
  items: GovernanceIndexItem[],
  filter: GovernanceFilterDefinition | undefined
) {
  if (!filter) return items;
  if (filter.derived === "reviewOverdue") {
    return items.filter((item) => item.reviewOverdue);
  }
  if (filter.derived === "missingOwner") {
    return items.filter((item) => item.missingOwner);
  }
  if (filter.field && filter.equals != null) {
    return items.filter(
      (item) => String(fieldValue(item, filter.field)) === filter.equals
    );
  }
  return items;
}
