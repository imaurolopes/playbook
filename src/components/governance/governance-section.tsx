import { GovernanceBadges } from "@/components/governance/governance-badges";
import type {
  GovernanceDefinition,
  GovernanceMetadata,
  TaxonomyDefinition
} from "@/types/content";

function Score({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {value == null ? "Not scored" : `${value}/100`}
      </p>
    </div>
  );
}

export function GovernanceSection({
  governance,
  lifecycle,
  taxonomy,
  definition
}: {
  governance?: GovernanceMetadata;
  lifecycle?: string;
  taxonomy: TaxonomyDefinition;
  definition: GovernanceDefinition;
}) {
  return (
    <div className="space-y-5">
      <GovernanceBadges
        governance={governance}
        lifecycle={lifecycle}
        taxonomy={taxonomy}
        definition={definition}
      />

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Owner</dt>
          <dd className="mt-1">{governance?.owner ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Reviewers</dt>
          <dd className="mt-1">
            {governance?.reviewers?.join(", ") || "Not assigned"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Last reviewed
          </dt>
          <dd className="mt-1">{governance?.lastReviewedAt ?? "Not reviewed"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Next review
          </dt>
          <dd className="mt-1">{governance?.nextReviewAt ?? "Not scheduled"}</dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <Score label="Quality" value={governance?.qualityScore} />
        <Score label="Completeness" value={governance?.completenessScore} />
      </div>

      {governance?.reviewNotes?.length ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Review notes
          </h3>
          <div className="mt-3 space-y-2">
            {governance.reviewNotes.map((note, index) => (
              <article key={`${note.date}-${note.reviewer}-${index}`} className="rounded-xl border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{note.reviewer}</span>
                  <time>{note.date}</time>
                </div>
                <p className="mt-2 text-sm">{note.note}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
