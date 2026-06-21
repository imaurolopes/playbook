"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "playbook.sidebar.expanded";

function readStoredState() {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === null ? null : saved === "true";
  } catch {
    return null;
  }
}

function persistState(expanded: boolean) {
  try {
    window.localStorage.setItem(storageKey, String(expanded));
  } catch {
    // The sidebar remains usable when storage is unavailable.
  }
}

export function useSidebarState() {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readStoredState();
    if (saved !== null) setExpanded(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) persistState(expanded);
  }, [expanded, ready]);

  useEffect(() => {
    const syncStoredState = (event: StorageEvent) => {
      if (event.key !== storageKey || event.newValue === null) return;
      setExpanded(event.newValue === "true");
    };

    window.addEventListener("storage", syncStoredState);
    return () => window.removeEventListener("storage", syncStoredState);
  }, []);

  const toggle = useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return {
    closeMobile,
    expanded,
    mobileOpen,
    openMobile,
    ready,
    toggle
  };
}
