"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SidebarToggle({
  expanded,
  onClick,
  controls
}: {
  expanded: boolean;
  onClick: () => void;
  controls?: string;
}) {
  const label = expanded ? "Collapse sidebar" : "Expand sidebar";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-controls={controls}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {expanded ? (
        <PanelLeftClose className="size-4" />
      ) : (
        <PanelLeftOpen className="size-4" />
      )}
    </button>
  );
}
