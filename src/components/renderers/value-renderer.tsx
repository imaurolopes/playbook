import type { MetadataValue } from "@/types/content";

export function ValueRenderer({ value }: { value: MetadataValue }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;

  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, index) => (
          <li key={index}>
            <ValueRenderer value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt className="font-medium">{key}</dt>
            <dd className="text-muted-foreground">
              <ValueRenderer value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <>{String(value)}</>;
}
