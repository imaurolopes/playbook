import type {
  SearchDefinition,
  SearchIndexItem
} from "@/types/content";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fieldScore(value: string, query: string, tokens: string[]) {
  if (!value) return 0;
  if (value === query) return 2.5;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 1.5;
  const matched = tokens.filter((token) => value.includes(token)).length;
  return matched / tokens.length;
}

export function searchIndex(
  index: SearchIndexItem[],
  queryValue: string,
  definition: SearchDefinition
) {
  const query = normalize(queryValue);
  if (!query) return index.slice(0, definition.maxResults ?? 12);
  const tokens = query.split(/\s+/).filter(Boolean);

  return index
    .map((item) => {
      const scores = Object.entries(definition.fields).map(
        ([field, weight]) =>
          fieldScore(
            item.search[field as keyof SearchIndexItem["search"]],
            query,
            tokens
          ) * weight
      );
      const matchedFields = scores.filter((score) => score > 0).length;
      const allTokens = tokens.every((token) =>
        Object.values(item.search).some((value) => value.includes(token))
      );
      const score =
        scores.reduce((total, value) => total + value, 0) +
        (allTokens ? 20 : 0) +
        matchedFields * 2;
      return { item, score };
    })
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.item.title.localeCompare(b.item.title)
    )
    .slice(0, definition.maxResults ?? 12)
    .map((result) => result.item);
}
