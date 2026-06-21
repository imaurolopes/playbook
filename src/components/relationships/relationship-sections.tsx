"use client";

import Link from "next/link";
import { IconToken } from "@/components/metadata/icon-token";
import {
  groupRelationships,
  type ResolvedRelationship
} from "@/lib/relationships/resolve";

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function RelationshipSections({
  relationships,
  perspective = "outgoing",
  onNavigate
}: {
  relationships: ResolvedRelationship[];
  perspective?: "outgoing" | "incoming";
  onNavigate?: () => void;
}) {
  const groups = groupRelationships(relationships);

  if (!groups.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No relationships defined.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const color = group.color ?? "#64748b";

        return (
          <section key={group.id}>
            <div className="mb-2 flex items-center gap-2">
              <span style={{ color }}>
                <IconToken token={group.icon} className="size-4" />
              </span>
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </h4>
              <span className="text-[10px] text-muted-foreground">
                {group.items.length}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map((item, index) => {
                const node =
                  perspective === "incoming" ? item.source : item.target;
                const label = node?.title ?? item.relationship.target;
                const href = node?.route;
                const body = (
                  <div
                    className="rounded-lg border p-3 transition hover:bg-muted/50"
                    style={{ borderColor: colorWithAlpha(color, "55") }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        {node ? (
                          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {node.collection}
                          </p>
                        ) : null}
                      </div>
                      <IconToken
                        token="arrow-up-right"
                        className="size-3.5 text-muted-foreground"
                      />
                    </div>
                  </div>
                );

                return href ? (
                  <Link
                    key={`${group.id}-${node?.id ?? index}`}
                    href={href}
                    onClick={onNavigate}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={`${group.id}-${index}`}>{body}</div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
