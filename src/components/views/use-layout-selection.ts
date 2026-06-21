"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ResolvedViewLayout,
  ViewLayoutSettings,
  ViewSelectorDefinition
} from "@/types/content";

const storageKey = "playbook:selected-layout";

export function useLayoutSelection(
  resolved: ResolvedViewLayout,
  selector: ViewSelectorDefinition | undefined,
  layouts: Record<string, Partial<ViewLayoutSettings> & { enabled?: boolean }>
) {
  const available = useMemo(
    () =>
      (selector?.availableLayouts ?? []).filter(
        (key) => layouts[key] && layouts[key].enabled !== false
      ),
    [layouts, selector?.availableLayouts]
  );
  const [selected, setSelected] = useState(resolved.layout);

  useEffect(() => {
    setSelected(resolved.layout);
    if (!selector?.enabled && !resolved.selectorEnabled) return;

    let candidate: string | null = null;
    if (selector?.persistence === "localStorage") {
      candidate = window.localStorage.getItem(storageKey);
    } else {
      const parameter = selector?.parameter ?? "view";
      candidate = new URL(window.location.href).searchParams.get(parameter);
    }

    if (candidate && available.includes(candidate)) setSelected(candidate);
  }, [
    available,
    resolved.layout,
    resolved.selectorEnabled,
    selector?.enabled,
    selector?.parameter,
    selector?.persistence
  ]);

  const select = (layout: string) => {
    if (!available.includes(layout)) return;
    setSelected(layout);

    if (selector?.persistence === "localStorage") {
      window.localStorage.setItem(storageKey, layout);
      return;
    }

    const parameter = selector?.parameter ?? "view";
    const url = new URL(window.location.href);
    if (layout === resolved.layout) {
      url.searchParams.delete(parameter);
    } else {
      url.searchParams.set(parameter, layout);
    }
    window.history.replaceState(null, "", url);
  };

  const definition = layouts[selected] ?? {};
  const layout: ResolvedViewLayout = {
    ...resolved,
    ...definition,
    source: resolved.source,
    matchedCategory: resolved.matchedCategory,
    level: resolved.level,
    layout: selected
  };

  return { available, layout, select };
}
