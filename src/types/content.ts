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

export interface GovernanceReviewNote {
  date: string;
  reviewer: string;
  note: string;
}

export interface GovernanceMetadata {
  owner?: string;
  reviewers?: string[];
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewNotes?: GovernanceReviewNote[];
  qualityScore?: number;
  completenessScore?: number;
  confidence?: string;
  evidenceLevel?: string;
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
  governance?: GovernanceMetadata;
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

export interface ProjectWorkspace {
  schemaVersion: string;
  id: string;
  schema: string;
  title: string;
  summary?: string;
  route: string;
  status: string;
  lifecycle: string;
  categories?: string[];
  attributes?: Record<string, MetadataValue>;
  stakeholders?: MetadataValue[];
  constraints?: MetadataValue[];
  stages?: MetadataValue[];
  selectedSkills?: MetadataValue[];
  selectedTemplates?: MetadataValue[];
  selectedChecklists?: MetadataValue[];
  selectedDecisionMatrices?: MetadataValue[];
  selectedArtifacts?: MetadataValue[];
  outputs?: MetadataValue[];
  risks?: MetadataValue[];
  openQuestions?: MetadataValue[];
  relationships?: Relationship[];
  actions?: EntryAction[];
  governance?: GovernanceMetadata;
}

export interface ProjectOutput {
  schemaVersion: string;
  id: string;
  schema: string;
  project: string;
  title: string;
  summary?: string;
  attributes?: Record<string, MetadataValue>;
  sourceEntries?: string[];
  data?: Record<string, MetadataValue>;
  documents?: DocumentReference[];
  relationships?: Relationship[];
  governance?: GovernanceMetadata;
}

export interface NavigationNode {
  label: string;
  icon?: string;
  entry?: string;
  route?: string;
  action?: string;
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
  governance?: GovernanceMetadata;
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
  source:
    | "node"
    | "schema"
    | "category"
    | "artifact"
    | "level"
    | "fallback";
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
  agentPackage?: AgentPackageDefinition;
  views: ViewDefinition[];
}

export interface AgentPackageFileDefinition {
  id: string;
  filename: string;
  label: string;
  format: "yaml" | "markdown";
}

export interface AgentPackageDefinition {
  schema: string;
  packageVersion?: string;
  defaultFile?: string;
  files: AgentPackageFileDefinition[];
}

export interface GeneratedPackageFile extends AgentPackageFileDefinition {
  content: string;
}

export interface SchemaFieldDefinition {
  type?: string;
  itemSchema?: string;
  taxonomy?: string;
  taxonomyDriven?: boolean;
  open?: boolean;
}

export interface ContentSchemaDefinition {
  id: string;
  label: string;
  storage?: string;
  extends?: string;
  required?: string[];
  constraints?: Record<string, { equals?: MetadataValue }>;
  fields?: Record<string, SchemaFieldDefinition>;
}

export interface SchemaDefinition {
  required?: string[];
  open?: boolean;
  fields?: Record<string, SchemaFieldDefinition>;
}

export interface SchemasDefinition {
  schemaVersion: string;
  schemas: ContentSchemaDefinition[];
  definitions?: Record<string, SchemaDefinition>;
}

export interface SearchFieldWeights {
  title: number;
  summary: number;
  tags: number;
  categories: number;
  artifactKind: number;
  lifecycle: number;
  relationships: number;
}

export interface SearchDefinition {
  shortcut?: string;
  maxResults?: number;
  placeholder?: string;
  emptyMessage?: string;
  fields: SearchFieldWeights;
  collections?: Record<
    string,
    {
      label: string;
      icon?: string;
      color?: string;
    }
  >;
}

export interface SearchBadge {
  value: string;
  label: string;
  color?: string;
  icon?: string;
}

export interface SearchIndexItem {
  id: string;
  title: string;
  summary?: string;
  route: string;
  collection: string;
  typeLabel: string;
  typeIcon?: string;
  typeColor?: string;
  categories: SearchBadge[];
  lifecycle?: SearchBadge;
  search: {
    title: string;
    summary: string;
    tags: string;
    categories: string;
    artifactKind: string;
    lifecycle: string;
    relationships: string;
  };
}

export interface GovernanceFilterDefinition {
  id: string;
  label: string;
  field?: string;
  equals?: string;
  derived?: "reviewOverdue" | "missingOwner";
}

export interface GovernanceDashboardSectionDefinition {
  id: string;
  label: string;
  filter?: string;
  recentDays?: number;
  groupBy?: string;
  derived?: "recentlyApproved";
}

export interface GovernanceDefinition {
  asOf?: string;
  recentlyApprovedDays?: number;
  badges?: string[];
  filters: GovernanceFilterDefinition[];
  dashboard:
    | GovernanceDashboardSectionDefinition[]
    | { sections: GovernanceDashboardSectionDefinition[] };
}

export interface GovernanceIndexItem {
  id: string;
  title: string;
  summary?: string;
  route: string;
  collection: string;
  lifecycle?: string;
  governance?: GovernanceMetadata;
  reviewOverdue: boolean;
  missingOwner: boolean;
  recentlyApproved: boolean;
}

export interface RelationshipExplorerFilterDefinition {
  id: string;
  label: string;
}

export interface RelationshipExplorerViewDefinition {
  id: string;
  label: string;
  icon?: string;
}

export interface RelationshipImpactGroupDefinition {
  id: string;
  label: string;
  direction: "incoming" | "outgoing";
  relationshipTypes: string[];
}

export interface RelationshipExplorerDefinition {
  defaultView: string;
  filters: RelationshipExplorerFilterDefinition[];
  views: RelationshipExplorerViewDefinition[];
  impact: {
    groups: RelationshipImpactGroupDefinition[];
  };
  collections?: Record<
    string,
    {
      label: string;
      icon?: string;
      color?: string;
    }
  >;
}

export interface RelationshipEndpointIndex {
  id: string;
  title: string;
  summary?: string;
  route?: string;
  relatedRoute: string;
  collection: string;
  collectionLabel: string;
  collectionIcon?: string;
  collectionColor?: string;
  categories: string[];
  lifecycle?: string;
  artifactKind?: string;
  project?: string;
  confidence?: string;
  evidenceLevel?: string;
}

export interface RelationshipEdgeIndex {
  id: string;
  type: string;
  label: string;
  icon?: string;
  color?: string;
  order: number;
  source: RelationshipEndpointIndex;
  target: RelationshipEndpointIndex;
}
