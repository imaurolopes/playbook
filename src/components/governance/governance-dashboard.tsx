"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GovernanceBadges } from "@/components/governance/governance-badges";
import { ContextBreadcrumbs } from "@/components/navigation/context-breadcrumbs";
import { applyGovernanceFilter } from "@/lib/governance/index";
import {
  resolveTaxonomyDimension
} from "@/lib/metadata/taxonomy";
import type {
  BreadcrumbDefinition,
  GovernanceDashboardSectionDefinition,
  GovernanceDefinition,
  GovernanceIndexItem,
  TaxonomyDefinition
} from "@/types/content";

function sections(definition: GovernanceDefinition) {
  return Array.isArray(definition.dashboard)
    ? definition.dashboard
    : definition.dashboard.sections;
}

function GovernanceList({
  items,
  taxonomy,
  definition,
  emptyMessage = "No items match this section."
}: {
  items: GovernanceIndexItem[];
  taxonomy: TaxonomyDefinition;
  definition: GovernanceDefinition;
  emptyMessage?: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="divide-y rounded-xl border">
      {items.slice(0, 12).map((item) => (
        <Link
          key={item.id}
          href={item.route}
          className="block p-4 transition hover:bg-muted/40"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              {item.summary ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {item.summary}
                </p>
              ) : null}
              <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {item.collection}
              </p>
            </div>
            <GovernanceBadges
              governance={item.governance}
              lifecycle={item.lifecycle}
              taxonomy={taxonomy}
              definition={definition}
              compact
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

function SectionContent({
  section,
  items,
  definition,
  taxonomy
}: {
  section: GovernanceDashboardSectionDefinition;
  items: GovernanceIndexItem[];
  definition: GovernanceDefinition;
  taxonomy: TaxonomyDefinition;
}) {
  if (section.groupBy) {
    const dimension = resolveTaxonomyDimension(taxonomy, section.groupBy);
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(dimension?.options ?? []).map((option) => (
          <div key={option.value} className="rounded-xl border bg-muted/20 p-4">
            <p className="text-sm font-medium" style={{ color: option.color }}>
              {option.label}
            </p>
            <p className="mt-2 text-3xl font-semibold">
              {items.filter(
                (item) =>
                  String(item[section.groupBy as keyof GovernanceIndexItem]) ===
                  option.value
              ).length}
            </p>
          </div>
        ))}
      </div>
    );
  }

  const filter = section.filter
    ? definition.filters.find((candidate) => candidate.id === section.filter)
    : undefined;
  const filtered =
    section.derived === "recentlyApproved"
      ? items.filter((item) => item.recentlyApproved)
      : applyGovernanceFilter(items, filter);

  return (
    <GovernanceList
      items={filtered}
      taxonomy={taxonomy}
      definition={definition}
    />
  );
}

export function GovernanceDashboard({
  items,
  definition,
  taxonomy,
  breadcrumbs
}: {
  items: GovernanceIndexItem[];
  definition: GovernanceDefinition;
  taxonomy: TaxonomyDefinition;
  breadcrumbs?: BreadcrumbDefinition;
}) {
  const [activeFilter, setActiveFilter] = useState<string>();
  const filtered = useMemo(
    () =>
      applyGovernanceFilter(
        items,
        definition.filters.find((filter) => filter.id === activeFilter)
      ),
    [activeFilter, definition.filters, items]
  );

  return (
    <div className="space-y-10">
      <ContextBreadcrumbs
        config={breadcrumbs}
        context="local"
        items={[{ label: "Governance" }]}
      />
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Content governance
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Review dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Lifecycle, ownership, confidence, evidence, and review health across
          all registered Playbook content.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Filters</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter(undefined)}
            className={`rounded-full border px-3 py-1.5 text-xs ${
              !activeFilter ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            All
          </button>
          {definition.filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                activeFilter === filter.id
                  ? "bg-primary text-primary-foreground"
                  : ""
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {filtered.length} items
        </p>
        <div className="mt-4">
          <GovernanceList
            items={filtered}
            taxonomy={taxonomy}
            definition={definition}
          />
        </div>
      </section>

      {sections(definition).map((section) => (
        <section key={section.id} className="rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="mb-4 text-xl font-semibold">{section.label}</h2>
          <SectionContent
            section={section}
            items={items}
            definition={definition}
            taxonomy={taxonomy}
          />
        </section>
      ))}
    </div>
  );
}
