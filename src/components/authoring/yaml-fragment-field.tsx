"use client";

import { useState } from "react";
import { parse, stringify } from "yaml";
import type { MetadataValue } from "@/types/content";

export function YamlFragmentField({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: MetadataValue | undefined;
  onChange: (value: MetadataValue | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : stringify(value).trim());
  const [error, setError] = useState<string>();

  const update = (next: string) => {
    setText(next);
    if (!next.trim()) {
      setError(undefined);
      onChange(undefined);
      return;
    }
    try {
      onChange(parse(next) as MetadataValue);
      setError(undefined);
    } catch {
      setError("Enter a valid YAML fragment.");
    }
  };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => update(event.target.value)}
        rows={8}
        spellCheck={false}
        className="mt-2 w-full rounded-xl border bg-background px-3 py-2 font-mono text-xs outline-none transition focus:ring-2 focus:ring-primary"
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
