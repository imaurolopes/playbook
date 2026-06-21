export type Scalar = string | number | boolean | null;
export type MetadataValue =
  | Scalar
  | MetadataValue[]
  | { [key: string]: MetadataValue };

export interface ContentBlock {
  kind: string;
  [key: string]: MetadataValue;
}

export interface Relationship {
  type: string;
  target: string;
  [key: string]: MetadataValue;
}

export interface DocumentReference {
  path: string;
  label?: string;
}

export interface Entry {
  schemaVersion: string;
  id: string;
  schema: string;
  title: string;
  summary?: string;
  route: string;
  attributes?: Record<string, MetadataValue>;
  relationships?: Relationship[];
  content?: ContentBlock[];
  documents?: DocumentReference[];
}

export interface NavigationNode {
  label: string;
  icon?: string;
  entry?: string;
  route?: string;
  children?: NavigationNode[];
}

export interface NavigationDefinition {
  title: string;
  items: NavigationNode[];
}

export interface TaxonomyOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
  parent?: string;
  order?: number;
}

export interface TaxonomyDimension {
  id: string;
  label: string;
  options: TaxonomyOption[];
}

export interface TaxonomyDefinition {
  dimensions: TaxonomyDimension[];
}

export interface ThemeDefinition {
  defaultTheme?: string;
  tokens: Record<string, Record<string, string>>;
}

export interface ViewDefinition {
  id: string;
  label: string;
  layout: string;
  fields?: string[];
  groupBy?: string;
  sortBy?: string;
  filters?: Record<string, MetadataValue>;
}

export interface ViewsDefinition {
  defaultView: string;
  views: ViewDefinition[];
}
