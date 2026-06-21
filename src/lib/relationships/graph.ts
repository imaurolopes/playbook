import type {
  KnowledgeNode,
  TaxonomyDefinition,
  TaxonomyOption
} from "@/types/content";
import {
  resolveIncomingRelationships,
  resolveOutgoingRelationships
} from "@/lib/relationships/resolve";

export interface RelationshipGraphEdge {
  id: string;
  source: KnowledgeNode;
  target: KnowledgeNode;
  definition: TaxonomyOption;
  relationshipType: string;
}

export interface RelationshipGraphModel {
  roots: KnowledgeNode[];
  nodes: KnowledgeNode[];
  edges: RelationshipGraphEdge[];
}

export function buildRelationshipGraph(
  roots: KnowledgeNode[],
  registry: KnowledgeNode[],
  taxonomy: TaxonomyDefinition,
  depth: number
): RelationshipGraphModel {
  const nodes = new Map(roots.map((node) => [node.id, node]));
  const edges = new Map<string, RelationshipGraphEdge>();
  let frontier = [...roots];
  const visited = new Set<string>();

  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const next = new Map<string, KnowledgeNode>();

    for (const node of frontier) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      for (const resolved of resolveOutgoingRelationships(
        node,
        registry,
        taxonomy
      )) {
        if (!resolved.target || !resolved.definition) continue;
        const edgeId = `${node.id}:${resolved.relationship.type}:${resolved.target.id}`;
        edges.set(edgeId, {
          id: edgeId,
          source: node,
          target: resolved.target,
          definition: resolved.definition,
          relationshipType: resolved.relationship.type
        });
        nodes.set(resolved.target.id, resolved.target);
        next.set(resolved.target.id, resolved.target);
      }

      for (const resolved of resolveIncomingRelationships(
        node,
        registry,
        taxonomy
      )) {
        if (!resolved.source || !resolved.definition) continue;
        const edgeId = `${resolved.source.id}:${resolved.relationship.type}:${node.id}`;
        edges.set(edgeId, {
          id: edgeId,
          source: resolved.source,
          target: node,
          definition: resolved.definition,
          relationshipType: resolved.relationship.type
        });
        nodes.set(resolved.source.id, resolved.source);
        next.set(resolved.source.id, resolved.source);
      }
    }

    frontier = [...next.values()];
  }

  return {
    roots,
    nodes: [...nodes.values()],
    edges: [...edges.values()].sort(
      (a, b) =>
        (a.definition.order ?? Number.MAX_SAFE_INTEGER) -
          (b.definition.order ?? Number.MAX_SAFE_INTEGER) ||
        a.source.title.localeCompare(b.source.title)
    )
  };
}
