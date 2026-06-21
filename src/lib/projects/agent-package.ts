import { stringify } from "yaml";
import {
  resolveTaxonomyDimension,
  resolveTaxonomyOption
} from "@/lib/metadata/taxonomy";
import type {
  AgentPackageDefinition,
  Entry,
  GeneratedPackageFile,
  KnowledgeNode,
  MetadataValue,
  ProjectOutput,
  ProjectWorkspace,
  TaxonomyDefinition
} from "@/types/content";

function asRecord(value: MetadataValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function targets(values?: MetadataValue[]) {
  return (values ?? []).flatMap((value) => {
    if (typeof value === "string") return [value];
    const target = asRecord(value)?.target;
    return typeof target === "string" ? [target] : [];
  });
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function yaml(value: unknown) {
  return stringify(clean(value), {
    lineWidth: 100,
    sortMapEntries: false
  });
}

function nodeRecord(node: KnowledgeNode | undefined) {
  return node
    ? {
        id: node.id,
        title: node.title,
        summary: node.summary,
        collection: node.collection,
        route: node.route,
        attributes: node.attributes
      }
    : undefined;
}

function resolvedRecords(
  ids: string[],
  entries: Map<string, Entry>,
  registry: Map<string, KnowledgeNode>
) {
  return ids.map((id) => entries.get(id) ?? nodeRecord(registry.get(id)) ?? { id });
}

function referenceTargets(entry: Entry | undefined) {
  return targets(entry?.references);
}

export interface AgentPackageSummary {
  selectedSkills: KnowledgeNode[];
  selectedTemplates: KnowledgeNode[];
  selectedChecklists: KnowledgeNode[];
  selectedDecisionMatrices: KnowledgeNode[];
  selectedArtifacts: KnowledgeNode[];
  sourcesAndReferences: KnowledgeNode[];
  outputs: KnowledgeNode[];
  risks: MetadataValue[];
  openQuestions: MetadataValue[];
  relationshipCount: number;
}

export function generateAgentPackage({
  project,
  outputs,
  entries,
  registry,
  taxonomy,
  definition
}: {
  project: ProjectWorkspace;
  outputs: ProjectOutput[];
  entries: Entry[];
  registry: KnowledgeNode[];
  taxonomy: TaxonomyDefinition;
  definition: AgentPackageDefinition;
}): {
  files: GeneratedPackageFile[];
  summary: AgentPackageSummary;
} {
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const nodeMap = new Map(registry.map((node) => [node.id, node]));
  const skillIds = targets(project.selectedSkills);
  const templateIds = targets(project.selectedTemplates);
  const checklistIds = targets(project.selectedChecklists);
  const matrixIds = targets(project.selectedDecisionMatrices);
  const artifactIds = targets(project.selectedArtifacts);
  const outputIds = [
    ...new Set([...targets(project.outputs), ...outputs.map((output) => output.id)])
  ];
  const selectedIds = [
    ...skillIds,
    ...templateIds,
    ...checklistIds,
    ...matrixIds,
    ...artifactIds
  ];
  const selectedEntries = selectedIds.map((id) => entryMap.get(id));
  const sourceReferenceIds = new Set<string>();

  for (const id of selectedIds) {
    const node = nodeMap.get(id);
    if (node?.collection === "sources" || node?.collection === "documents") {
      sourceReferenceIds.add(id);
    }
  }
  for (const entry of selectedEntries) {
    for (const id of referenceTargets(entry)) sourceReferenceIds.add(id);
    for (const relationship of entry?.relationships ?? []) {
      const target = nodeMap.get(relationship.target);
      if (
        target?.collection === "sources" ||
        target?.collection === "documents"
      ) {
        sourceReferenceIds.add(target.id);
      }
    }
  }
  for (const relationship of project.relationships ?? []) {
    const target = nodeMap.get(relationship.target);
    if (
      target?.collection === "sources" ||
      target?.collection === "documents"
    ) {
      sourceReferenceIds.add(target.id);
    }
  }

  const relevantIds = new Set([
    project.id,
    ...selectedIds,
    ...outputIds,
    ...sourceReferenceIds
  ]);
  const relationshipDimension = resolveTaxonomyDimension(
    taxonomy,
    "relationshipKind"
  );
  const relationships = registry.flatMap((source) =>
    (source.relationships ?? []).flatMap((relationship) => {
      if (
        !relevantIds.has(source.id) &&
        relationship.target !== project.id
      ) {
        return [];
      }
      if (
        source.id !== project.id &&
        !relevantIds.has(relationship.target) &&
        relationship.target !== project.id
      ) {
        return [];
      }
      const target = nodeMap.get(relationship.target);
      const kind = resolveTaxonomyOption(
        relationshipDimension,
        relationship.type
      );
      return [
        {
          source: source.id,
          sourceLabel: source.title,
          type: relationship.type,
          typeLabel: kind.label,
          target: relationship.target,
          targetLabel: target?.title ?? relationship.target
        }
      ];
    })
  );

  const sourcesAndReferences = [...sourceReferenceIds].map(
    (id) => nodeMap.get(id) ?? { id, title: id, collection: "unknown" }
  );
  const stageDimension = resolveTaxonomyDimension(taxonomy, "projectStage");
  const stageLines = (project.stages ?? []).map((value) => {
    const item = asRecord(value);
    const stageId = typeof item?.stage === "string" ? item.stage : "";
    const stage = resolveTaxonomyOption(stageDimension, stageId);
    const status = typeof item?.status === "string" ? item.status : "unknown";
    return `- ${stage.label}: ${status}`;
  });
  const labelList = (ids: string[]) =>
    ids.map((id) => nodeMap.get(id)?.title ?? id);
  const context = [
    `# ${project.title}`,
    "",
    project.summary ?? "",
    "",
    "## Project state",
    "",
    `- Status: ${project.status}`,
    `- Lifecycle: ${project.lifecycle}`,
    `- Categories: ${(project.categories ?? []).join(", ") || "None"}`,
    "",
    "## Stages",
    "",
    ...(stageLines.length ? stageLines : ["- None configured"]),
    "",
    "## Selected skills",
    "",
    ...(labelList(skillIds).map((label) => `- ${label}`).length
      ? labelList(skillIds).map((label) => `- ${label}`)
      : ["- None"]),
    "",
    "## Selected artifacts",
    "",
    ...labelList([...templateIds, ...checklistIds, ...matrixIds, ...artifactIds]).map(
      (label) => `- ${label}`
    ),
    "",
    "## Risks and open questions",
    "",
    `- Risks: ${project.risks?.length ?? 0}`,
    `- Open questions: ${project.openQuestions?.length ?? 0}`,
    "",
    "## Outputs",
    "",
    ...labelList(outputIds).map((label) => `- ${label}`),
    "",
    "## Usage boundary",
    "",
    "This package contains structured project context only. It does not contain executable code or authorize agent actions.",
    ""
  ].join("\n");

  const documents: Record<string, string> = {
    context,
    project: yaml(project),
    skills: yaml({
      schemaVersion: "1",
      project: project.id,
      skills: resolvedRecords(skillIds, entryMap, nodeMap)
    }),
    "selected-artifacts": yaml({
      schemaVersion: "1",
      project: project.id,
      templates: resolvedRecords(templateIds, entryMap, nodeMap),
      checklists: resolvedRecords(checklistIds, entryMap, nodeMap),
      decisionMatrices: resolvedRecords(matrixIds, entryMap, nodeMap),
      artifacts: resolvedRecords(artifactIds, entryMap, nodeMap),
      sourcesAndReferences: sourcesAndReferences.map(nodeRecord)
    }),
    risks: yaml({
      schemaVersion: "1",
      project: project.id,
      risks: project.risks ?? []
    }),
    "open-questions": yaml({
      schemaVersion: "1",
      project: project.id,
      openQuestions: project.openQuestions ?? []
    }),
    outputs: yaml({
      schemaVersion: "1",
      project: project.id,
      outputs
    }),
    relationships: yaml({
      schemaVersion: "1",
      project: project.id,
      relationships
    })
  };

  const files = definition.files.map((file) => ({
    ...file,
    content:
      documents[file.id] ??
      yaml({
        schemaVersion: "1",
        project: project.id,
        notice: `No generator is configured for "${file.id}".`
      })
  }));

  return {
    files,
    summary: {
      selectedSkills: skillIds.flatMap((id) => nodeMap.get(id) ?? []),
      selectedTemplates: templateIds.flatMap((id) => nodeMap.get(id) ?? []),
      selectedChecklists: checklistIds.flatMap((id) => nodeMap.get(id) ?? []),
      selectedDecisionMatrices: matrixIds.flatMap(
        (id) => nodeMap.get(id) ?? []
      ),
      selectedArtifacts: artifactIds.flatMap((id) => nodeMap.get(id) ?? []),
      sourcesAndReferences,
      outputs: outputIds.flatMap((id) => nodeMap.get(id) ?? []),
      risks: project.risks ?? [],
      openQuestions: project.openQuestions ?? [],
      relationshipCount: relationships.length
    }
  };
}
