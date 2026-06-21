"use client";

import { useEffect, useState } from "react";

export type GraphPanelState = "collapsed" | "compact" | "expanded";

const storageKey = "playbook:relationship-graph-state";

function validState(
  value: string | null | undefined
): value is GraphPanelState {
  return value === "collapsed" || value === "compact" || value === "expanded";
}

export function useGraphPanelState(
  defaultState: string | undefined,
  collapsible: boolean
) {
  const fallback: GraphPanelState = validState(defaultState)
    ? defaultState
    : "compact";
  const [state, setState] = useState<GraphPanelState>(
    !collapsible && fallback === "collapsed" ? "compact" : fallback
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (validState(stored) && (collapsible || stored !== "collapsed")) {
      setState(stored);
    }
  }, [collapsible]);

  const update = (next: GraphPanelState) => {
    const safeState = !collapsible && next === "collapsed" ? "compact" : next;
    setState(safeState);
    window.localStorage.setItem(storageKey, safeState);
  };

  return [state, update] as const;
}
