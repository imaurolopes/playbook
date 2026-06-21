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

export interface EntryAction {
  label: string;
  icon?: string;
  href: string;
  appearance?: string;
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
  actions?: EntryAction[];
}

export interface NavigationNode {
  label: string;
  icon?: string;
  entry?: string;
  route?: string;
  source?: string;
  taxonomy?: string;
  hierarchy?: string;
  routeTemplate?: string;
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
  group?: string;
  order?: number;
}

export interface TaxonomyGroup {
  id: string;
  label: string;
  order?: number;
}

export interface TaxonomyDimension {
  id: string;
  label: string;
  cardinality?: string;
  groups?: TaxonomyGroup[];
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
  allowMultiplePlacement?: boolean;
  presentation?: {
    groupDimension?: string;
    colorDimension?: string;
    iconDimension?: string;
    badgeDimensions?: string[];
    tagsAttribute?: string;
    showEmptyGroups?: boolean;
    density?: string;
  };
  detailPanel?: {
    sections?: string[];
    showAllAttributes?: boolean;
  };
}

export interface ViewsDefinition {
  defaultView: string;
  views: ViewDefinition[];
}
