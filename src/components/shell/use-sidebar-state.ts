"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "playbook.sidebar.expanded";

export function useSidebarState() {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved !== null) setExpanded(saved === "true");
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
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
