import { IconToken } from "@/components/metadata/icon-token";
import { governanceDerivedState } from "@/lib/governance/index";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  GovernanceDefinition,
  GovernanceMetadata,
  TaxonomyDefinition
} from "@/types/content";

function badgeStyle(color?: string) {
  return color
    ? { color, borderColor: `${color}55`, backgroundColor: `${color}0d` }
    : undefined;
}

export function GovernanceBadges({
  governance,
  lifecycle,
  taxonomy,
  definition,
  compact = false
}: {
  governance?: GovernanceMetadata;
  lifecycle?: string;
  taxonomy: TaxonomyDefinition;
  definition: GovernanceDefinition;
  compact?: boolean;
}) {
  const configured = new Set(
    definition.badges ?? ["lifecycle", "confidence", "owner", "reviewOverdue"]
  );
  const lifecycleOption = lifecycle
    ? resolveTaxonomyOption(
        resolveTaxonomyDimension(taxonomy, "lifecycle"),
        lifecycle
      )
    : undefined;
  const confidenceOption = governance?.confidence
    ? resolveTaxonomyOption(
        resolveTaxonomyDimension(taxonomy, "confidence"),
        governance.confidence
      )
    : undefined;
  const derived = governanceDerivedState(governance, definition);
  const className = `inline-flex items-center gap-1 rounded-full border font-medium ${
    compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-xs"
  }`;

  return (
    <div className="flex flex-wrap gap-1.5">
      {configured.has("lifecycle") && lifecycleOption ? (
        <span className={className} style={badgeStyle(lifecycleOption.color)}>
          <IconToken token={lifecycleOption.icon} className="size-3" />
          {lifecycleOption.label}
        </span>
      ) : null}
      {configured.has("confidence") && confidenceOption ? (
        <span className={className} style={badgeStyle(confidenceOption.color)}>
          <IconToken token={confidenceOption.icon} className="size-3" />
          {confidenceOption.label}
        </span>
      ) : null}
      {configured.has("owner") && governance?.owner ? (
        <span className={className}>
          <IconToken token="user-round" className="size-3" />
          {governance.owner}
        </span>
      ) : null}
      {configured.has("reviewOverdue") && derived.reviewOverdue ? (
        <span className={className} style={badgeStyle("#dc2626")}>
          <IconToken token="calendar-alert" className="size-3" />
          Review overdue
        </span>
      ) : null}
      {configured.has("missingOwner") && derived.missingOwner ? (
        <span className={className} style={badgeStyle("#d97706")}>
          <IconToken token="user-round-x" className="size-3" />
          Missing owner
        </span>
      ) : null}
    </div>
  );
}
