"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { IconToken } from "@/components/metadata/icon-token";
import type { TaxonomyOption } from "@/types/content";

function colorWithAlpha(color: string, alpha: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

export function PeriodicElement({
  option,
  count,
  href
}: {
  option: TaxonomyOption;
  count: number;
  href: string;
}) {
  const color = option.color ?? "#64748b";

  return (
    <Link
      href={href}
      className="group relative aspect-square min-h-48 overflow-hidden rounded-2xl border bg-background p-5 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        borderColor: colorWithAlpha(color, "66"),
        backgroundImage: `linear-gradient(145deg, ${colorWithAlpha(
          color,
          "28"
        )}, transparent 58%)`
      }}
    >
      <span
        className="absolute inset-x-0 top-0 h-1.5 transition-all duration-300 group-hover:h-2"
        style={{ backgroundColor: color }}
      />
      <span
        className="absolute -bottom-14 -right-14 size-40 rounded-full opacity-20 blur-2xl transition duration-500 group-hover:scale-125 group-hover:opacity-30"
        style={{ backgroundColor: color }}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <span
            className="font-mono text-3xl font-black tracking-[-0.08em]"
            style={{ color }}
          >
            {option.code ?? option.value.slice(0, 4).toUpperCase()}
          </span>
          <span className="inline-flex min-w-8 items-center justify-center rounded-full border bg-background/80 px-2 py-1 text-xs font-semibold shadow-sm backdrop-blur">
            {count}
          </span>
        </div>

        <div className="mt-auto">
          <div className="mb-3 flex items-end justify-between gap-3">
            <span
              className="grid size-11 place-items-center rounded-xl border bg-background/70 backdrop-blur"
              style={{ borderColor: colorWithAlpha(color, "55"), color }}
            >
              <IconToken token={option.icon} className="size-5" />
            </span>
            <ArrowUpRight className="size-4 text-muted-foreground transition duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-foreground" />
          </div>
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            {option.label}
          </h2>
          {option.summary ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {option.summary}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
