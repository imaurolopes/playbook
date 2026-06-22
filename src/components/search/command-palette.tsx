"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { IconToken } from "@/components/metadata/icon-token";
import { searchIndex } from "@/lib/search/rank";
import type {
  SearchDefinition,
  SearchIndexItem
} from "@/types/content";

function Badge({
  label,
  color
}: {
  label: string;
  color?: string;
}) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={
        color
          ? { color, borderColor: `${color}55`, backgroundColor: `${color}0d` }
          : undefined
      }
    >
      {label}
    </span>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
  index,
  definition
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: SearchIndexItem[];
  definition: SearchDefinition;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = useMemo(
    () => searchIndex(index, query, definition),
    [definition, index, query]
  );

  useEffect(() => {
    const shortcut = (definition.shortcut ?? "k").toLowerCase();
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === shortcut
      ) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [definition.shortcut, onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = "";
      previousFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  const close = () => {
    setQuery("");
    setSelected(0);
    onOpenChange(false);
  };

  const navigate = (item: SearchIndexItem) => {
    close();
    router.push(item.route);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((current) =>
        results.length ? (current + 1) % results.length : 0
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0
      );
    } else if (event.key === "Enter" && results[selected]) {
      event.preventDefault();
      navigate(results[selected]);
    } else if (event.key === "Tab" && dialogRef.current) {
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        aria-label="Close search"
        onClick={close}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search Playbook"
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[76vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={definition.placeholder ?? "Search Playbook..."}
            aria-label="Search Playbook"
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={close}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close search"
          >
            <X className="size-4" />
          </button>
        </div>

        <div
          role="listbox"
          aria-label="Search results"
          className="min-h-0 overflow-y-auto p-2"
        >
          {!results.length ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {definition.emptyMessage ?? "No matching items."}
            </p>
          ) : (
            results.map((item, indexValue) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={indexValue === selected}
                onMouseEnter={() => setSelected(indexValue)}
                onClick={() => navigate(item)}
                className={`w-full rounded-xl p-3 text-left transition ${
                  indexValue === selected
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border"
                    style={{ color: item.typeColor }}
                  >
                    <IconToken token={item.typeIcon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <Badge label={item.typeLabel} color={item.typeColor} />
                      {item.lifecycle ? (
                        <Badge
                          label={item.lifecycle.label}
                          color={item.lifecycle.color}
                        />
                      ) : null}
                    </div>
                    {item.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.summary}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.categories.slice(0, 4).map((category) => (
                        <Badge
                          key={category.value}
                          label={category.label}
                          color={category.color}
                        />
                      ))}
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">
                        {item.route}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-4 border-t px-4 py-2 text-[10px] text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>Enter Open</span>
          <span>Esc Close</span>
          <span className="ml-auto">
            {results.length} {results.length === 1 ? "result" : "results"}
          </span>
        </footer>
      </div>
    </div>
  );
}
