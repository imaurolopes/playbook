"use client";

import { Download, FileText, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { stringify } from "yaml";
import { ReferenceEditor } from "@/components/authoring/reference-editor";
import { RelationshipEditor } from "@/components/authoring/relationship-editor";
import { YamlFragmentField } from "@/components/authoring/yaml-fragment-field";
import {
  createAuthoringDocument,
  slugify,
  type AuthoringDocument
} from "@/lib/authoring/model";
import {
  authorableSchemas,
  resolveAuthoringSchema
} from "@/lib/authoring/schema-resolver";
import { validateAuthoringDocument } from "@/lib/authoring/validation";
import type {
  MetadataValue,
  SchemasDefinition,
  TaxonomyDefinition
} from "@/types/content";

const coreOrder = [
  "id",
  "title",
  "summary",
  "schema",
  "route",
  "attributes",
  "relationships",
  "references"
];

function labelFor(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanDocument(document: AuthoringDocument) {
  return Object.fromEntries(
    Object.entries(document).filter(([, value]) => value !== undefined)
  );
}

export function AuthoringEditor({
  mode,
  schemas,
  taxonomy,
  knownNodeIds,
  initialDocument
}: {
  mode: "new" | "edit";
  schemas: SchemasDefinition;
  taxonomy: TaxonomyDefinition;
  knownNodeIds: string[];
  initialDocument?: AuthoringDocument;
}) {
  const options = useMemo(() => authorableSchemas(schemas), [schemas]);
  const initialSchemaId =
    typeof initialDocument?.schema === "string"
      ? initialDocument.schema
      : options[0]?.id ?? "";
  const [schemaId, setSchemaId] = useState(initialSchemaId);
  const [document, setDocument] = useState<AuthoringDocument>(() => {
    const schema = options.find((candidate) => candidate.id === initialSchemaId);
    return initialDocument ?? (schema ? createAuthoringDocument(schema) : {});
  });
  const [showIssues, setShowIssues] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const resolved = useMemo(
    () => resolveAuthoringSchema(schemas, schemaId),
    [schemaId, schemas]
  );
  const draftKey = `playbook:authoring:${mode}:${
    mode === "edit" ? String(initialDocument?.id ?? "entry") : schemaId
  }`;

  useEffect(() => {
    const stored = window.localStorage.getItem(draftKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AuthoringDocument;
        setDocument(parsed);
        if (typeof parsed.schema === "string") setSchemaId(parsed.schema);
      } catch {
        window.localStorage.removeItem(draftKey);
      }
    }
    setDraftLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    window.localStorage.setItem(draftKey, JSON.stringify(document));
  }, [document, draftKey, draftLoaded]);

  if (!resolved) {
    return (
      <div className="rounded-2xl border border-destructive/40 p-6">
        Unable to resolve the selected schema.
      </div>
    );
  }

  const issues = validateAuthoringDocument(
    document,
    resolved,
    taxonomy,
    knownNodeIds
  );
  const errors = issues.filter((issue) => issue.level === "error");
  const yaml = stringify(cleanDocument(document), {
    lineWidth: 100,
    sortMapEntries: false
  });
  const fields = [
    ...coreOrder,
    ...Object.keys(resolved.fields).filter(
      (field) => field !== "schemaVersion" && !coreOrder.includes(field)
    )
  ].filter(
    (field, index, all) =>
      all.indexOf(field) === index &&
      (resolved.fields[field] || resolved.required.includes(field))
  );

  const setField = (field: string, value: MetadataValue | undefined) => {
    setDocument((current) => ({ ...current, [field]: value }));
  };

  const selectSchema = (nextSchemaId: string) => {
    const nextSchema = options.find((candidate) => candidate.id === nextSchemaId);
    if (!nextSchema) return;
    setSchemaId(nextSchemaId);
    setDocument((current) => ({
      ...createAuthoringDocument(nextSchema),
      ...(mode === "edit" ? current : {}),
      schema: nextSchemaId
    }));
  };

  const updateTitle = (title: string) => {
    setDocument((current) => {
      const previousTitle =
        typeof current.title === "string" ? current.title : "";
      const previousSlug = slugify(previousTitle);
      const nextSlug = slugify(title);
      const currentId = typeof current.id === "string" ? current.id : "";
      const currentRoute =
        typeof current.route === "string" ? current.route : "";
      return {
        ...current,
        title,
        id: !currentId || currentId === previousSlug ? nextSlug : currentId,
        route:
          !currentRoute || currentRoute === `/knowledge/${previousSlug}`
            ? `/knowledge/${nextSlug}`
            : currentRoute
      };
    });
  };

  const download = () => {
    setShowIssues(true);
    if (errors.length) return;
    const filename = `${
      typeof document.id === "string" && document.id
        ? document.id
        : "playbook-item"
    }.yaml`;
    const url = URL.createObjectURL(
      new Blob([yaml], { type: "application/yaml;charset=utf-8" })
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Static YAML authoring
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {mode === "edit" ? "Edit item" : "New item"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Forms are generated from schema metadata. Exported YAML must be
            placed in content/entries and committed manually.
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          <Download className="size-4" />
          Download YAML
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <section className="space-y-6 rounded-2xl border bg-background p-5 sm:p-6">
          {fields.map((field) => {
            const definition = resolved.fields[field] ?? { type: "string" };
            const required = resolved.required.includes(field);
            const label = `${labelFor(field)}${required ? " *" : ""}`;
            const value = document[field];

            if (field === "schema") {
              return (
                <div key={field}>
                  <label htmlFor="authoring-schema" className="text-sm font-medium">
                    {label}
                  </label>
                  <select
                    id="authoring-schema"
                    value={schemaId}
                    onChange={(event) => selectSchema(event.target.value)}
                    className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
                  >
                    {options.map((schema) => (
                      <option key={schema.id} value={schema.id}>
                        {schema.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            if (field === "relationships") {
              return (
                <RelationshipEditor
                  key={field}
                  value={value}
                  taxonomy={taxonomy}
                  knownNodeIds={knownNodeIds}
                  onChange={(next) => setField(field, next)}
                />
              );
            }

            if (field === "references") {
              return (
                <ReferenceEditor
                  key={field}
                  value={value}
                  knownNodeIds={knownNodeIds}
                  onChange={(next) => setField(field, next)}
                />
              );
            }

            if (
              field === "attributes" ||
              definition.type === "list" ||
              definition.type === "object"
            ) {
              return (
                <YamlFragmentField
                  key={`${schemaId}-${field}`}
                  id={`authoring-${field}`}
                  label={label}
                  value={value}
                  onChange={(next) => setField(field, next)}
                />
              );
            }

            const stringValue = typeof value === "string" ? value : "";
            const multiline =
              field === "summary" ||
              field === "objective" ||
              field === "purpose" ||
              field === "decision";
            return (
              <div key={field}>
                <label
                  htmlFor={`authoring-${field}`}
                  className="text-sm font-medium"
                >
                  {label}
                </label>
                {multiline ? (
                  <textarea
                    id={`authoring-${field}`}
                    value={stringValue}
                    onChange={(event) => setField(field, event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                ) : (
                  <input
                    id={`authoring-${field}`}
                    value={stringValue}
                    onChange={(event) =>
                      field === "title"
                        ? updateTitle(event.target.value)
                        : setField(field, event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
            );
          })}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border bg-background p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4" />
                YAML preview
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {schemaId}
              </span>
            </div>
            <pre className="mt-3 max-h-[34rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
              {yaml}
            </pre>
          </section>

          <section className="rounded-2xl border bg-background p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Save className="size-4" />
              Validation
            </h2>
            {!issues.length ? (
              <p className="mt-3 text-sm text-emerald-600">
                Ready to export.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.field}-${index}`}
                    className={
                      issue.level === "error"
                        ? "text-destructive"
                        : "text-amber-600"
                    }
                  >
                    <strong>{issue.field}:</strong> {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {showIssues && errors.length ? (
              <p className="mt-3 text-xs font-medium text-destructive">
                Resolve validation errors before downloading.
              </p>
            ) : null}
            <p className="mt-4 text-[11px] text-muted-foreground">
              Draft changes are saved locally in this browser.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
