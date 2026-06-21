"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SidebarToggle({
  expanded,
  onClick
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  const label = expanded ? "Collapse sidebar" : "Expand sidebar";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {expanded ? (
        <PanelLeftClose className="size-4" />
      ) : (
        <PanelLeftOpen className="size-4" />
      )}
    </button>
  );
}
