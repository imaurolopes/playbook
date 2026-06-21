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
  objective?: string;
  whenToUse?: MetadataValue[];
  requiredInputs?: MetadataValue[];
  questions?: MetadataValue[];
  decisionRules?: MetadataValue[];
  expectedOutputs?: MetadataValue[];
  guidance?: MetadataValue[];
  risks?: MetadataValue[];
  checklist?: MetadataValue[];
  references?: MetadataValue[];
  purpose?: string;
  sections?: MetadataValue[];
  completionCriteria?: MetadataValue[];
  prerequisites?: MetadataValue[];
  items?: MetadataValue[];
  evidenceRequirements?: MetadataValue[];
  principles?: MetadataValue[];
  recommendations?: MetadataValue[];
  antiPatterns?: MetadataValue[];
  examples?: MetadataValue[];
  decision?: string;
  options?: MetadataValue[];
  criteria?: MetadataValue[];
  rules?: MetadataValue[];
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
  code?: string;
  summary?: string;
  color?: string;
  icon?: string;
  parent?: string;
  group?: string;
  order?: number;
  inverse?: string;
  showOnCard?: boolean;
  showInDetail?: boolean;
  navigable?: boolean;
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

export interface KnowledgeNode {
  id: string;
  title: string;
  summary?: string;
  collection: string;
  route?: string;
  attributes?: Record<string, MetadataValue>;
  relationships?: Relationship[];
}

export interface ThemeDefinition {
  defaultTheme?: string;
  tokens: Record<string, Record<string, string>>;
}

export interface ViewDefinition {
  id: string;
  label: string;
  layout: string;
  source?: string;
  taxonomy?: string;
  routeTemplate?: string;
  localView?: string;
  displayLevel?: string;
  selectorEnabled?: boolean;
  countBy?: string;
  routeFilter?: {
    path: string;
    parameter: string;
  };
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

export interface ViewLayoutSettings {
  layout: string;
  label?: string;
  selectorEnabled?: boolean;
  cardDensity?: string;
  enabledPanels?: string[];
  detailSections?: string[];
  groupBy?: string;
  dateField?: string;
  columns?: string[];
}

export interface ResolvedViewLayout extends ViewLayoutSettings {
  source: "node" | "category" | "artifact" | "level" | "fallback";
  matchedCategory?: string;
  level?: string;
}

export interface RelationshipGraphPanelDefinition {
  enabledFromLevel?: string;
  defaultState?: string;
  collapsible?: boolean;
  depth?: number;
}

export interface ViewSelectorDefinition {
  enabled?: boolean;
  persistence?: string;
  parameter?: string;
  availableLayouts?: string[];
}

export interface BreadcrumbDefinition {
  enabled?: boolean;
  rootLabel?: string;
  rootRoute?: string;
  showOn?: string[];
}

export interface ViewEngineDefinition {
  selectors?: {
    levelAttribute?: string;
    categoryAttribute?: string;
    artifactKindAttribute?: string;
  };
  fallback: ViewLayoutSettings;
  defaults?: {
    level?: Record<string, Partial<ViewLayoutSettings>>;
    [dimension: string]:
      | Record<string, Partial<ViewLayoutSettings>>
      | undefined;
  };
  overrides?: {
    categories?: Record<
      string,
      Record<string, Partial<ViewLayoutSettings>>
    >;
    nodes?: Record<string, Partial<ViewLayoutSettings>>;
  };
  panels?: {
    relationshipGraph?: RelationshipGraphPanelDefinition;
    [panel: string]: RelationshipGraphPanelDefinition | undefined;
  };
  selector?: ViewSelectorDefinition;
  breadcrumbs?: BreadcrumbDefinition;
  layouts?: Record<string, Partial<ViewLayoutSettings> & { enabled?: boolean }>;
}

export interface ViewsDefinition {
  defaultView: string;
  viewEngine: ViewEngineDefinition;
  views: ViewDefinition[];
}
