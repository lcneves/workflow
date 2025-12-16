'use client';

import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { GitBranch, Loader2, PlayCircle, StopCircle, X } from 'lucide-react';
import './workflow-graph-viewer.css';
import {
  type EnvMap,
  formatDuration,
  useWorkflowResourceData,
} from '@workflow/web-shared';
import { StatusBadge } from '@/components/display-utils/status-badge';
import { Badge } from '@/components/ui/badge';
import type {
  GraphNode,
  StepExecution,
  WorkflowGraph,
  WorkflowRunExecution,
} from '@/lib/flow-graph/workflow-graph-types';

interface WorkflowGraphExecutionViewerProps {
  workflow: WorkflowGraph;
  execution?: WorkflowRunExecution;
  env?: EnvMap;
  onNodeClick?: (nodeId: string, executions: StepExecution[]) => void;
}

interface SelectedNodeInfo {
  nodeId: string;
  node: GraphNode;
  executions: StepExecution[];
  stepId?: string;
  runId?: string;
}

// Map execution status to StatusBadge-compatible status
type StatusBadgeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';
function mapToStatusBadgeStatus(
  status: StepExecution['status']
): StatusBadgeStatus {
  if (status === 'retrying') return 'running';
  return status as StatusBadgeStatus;
}

// Custom node components
const nodeTypes = {};

// Get node styling based on node kind and execution state
function getNodeStyle(nodeKind: string, executions?: StepExecution[]) {
  const baseStyle = {
    color: 'hsl(var(--card-foreground))',
  };

  // Base colors for node types
  let baseColors = {
    background: 'rgba(96, 165, 250, 0.15)', // blue
    border: '#60a5fa',
  };

  if (nodeKind === 'workflow_start') {
    baseColors = {
      background: 'rgba(34, 197, 94, 0.15)', // green
      border: '#22c55e',
    };
  } else if (nodeKind === 'workflow_end') {
    baseColors = {
      background: 'rgba(148, 163, 184, 0.15)', // slate
      border: '#94a3b8',
    };
  } else if (nodeKind === 'primitive') {
    baseColors = {
      background: 'rgba(168, 85, 247, 0.15)', // purple
      border: '#a855f7',
    };
  }

  // If no execution data, show faded state
  if (!executions || executions.length === 0) {
    return {
      ...baseStyle,
      backgroundColor: baseColors.background,
      borderColor: baseColors.border,
      opacity: 0.4,
    };
  }

  const latestExecution = executions[executions.length - 1];

  // Override colors based on execution status (matching status-badge colors)
  switch (latestExecution.status) {
    case 'running':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(59, 130, 246, 0.25)', // blue-500
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2)',
      };
    case 'completed':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(16, 185, 129, 0.25)', // emerald-500
        borderColor: '#10b981',
      };
    case 'failed':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(239, 68, 68, 0.25)', // red-500
        borderColor: '#ef4444',
        borderWidth: 1.5,
      };
    case 'retrying':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(249, 115, 22, 0.25)', // orange-500
        borderColor: '#f97316',
        borderStyle: 'dashed',
      };
    case 'cancelled':
      return {
        ...baseStyle,
        backgroundColor: 'rgba(234, 179, 8, 0.25)', // yellow-500
        borderColor: '#eab308',
      };
    case 'pending':
      return {
        ...baseStyle,
        backgroundColor: baseColors.background,
        borderColor: baseColors.border,
        opacity: 0.6,
      };
    default:
      return {
        ...baseStyle,
        backgroundColor: baseColors.background,
        borderColor: baseColors.border,
      };
  }
}

// Get node icon based on node kind
function getNodeIcon(nodeKind: string, label?: string) {
  if (nodeKind === 'workflow_start') {
    return (
      <PlayCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
    );
  }
  if (nodeKind === 'workflow_end') {
    return (
      <StopCircle className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
    );
  }
  if (nodeKind === 'primitive') {
    // Different icons for different primitives
    if (label === 'sleep') {
      return (
        <span className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 text-xs">
          ⏱
        </span>
      );
    }
    if (label === 'createHook' || label === 'createWebhook') {
      return (
        <span className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 text-xs">
          🔗
        </span>
      );
    }
    return (
      <span className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 text-xs">
        ⚙
      </span>
    );
  }
  return <GitBranch className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
}

// Enhanced node label with execution info
function renderNodeLabel(
  nodeData: { label: string; nodeKind: string },
  metadata?: {
    loopId?: string;
    loopIsAwait?: boolean;
    conditionalId?: string;
    conditionalBranch?: string;
    parallelGroupId?: string;
    parallelMethod?: string;
  },
  executions?: StepExecution[]
) {
  // Add CFG metadata badges
  const badges: React.ReactNode[] = [];

  if (metadata?.loopId) {
    badges.push(
      <span
        key="loop"
        className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-200 dark:bg-purple-900/30 !text-gray-950 dark:!text-white rounded border border-purple-400 dark:border-purple-700"
      >
        {metadata.loopIsAwait ? '⟳ await loop' : '⟳ loop'}
      </span>
    );
  }

  if (metadata?.conditionalId) {
    badges.push(
      <span
        key="cond"
        className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-200 dark:bg-amber-900/30 !text-gray-950 dark:!text-white rounded border border-amber-400 dark:border-amber-700"
      >
        {metadata.conditionalBranch === 'Then' ? '✓ if' : '✗ else'}
      </span>
    );
  }

  if (metadata?.parallelGroupId) {
    const parallelLabel =
      metadata.parallelMethod === 'all'
        ? 'Promise.all'
        : metadata.parallelMethod === 'race'
          ? 'Promise.race'
          : metadata.parallelMethod === 'allSettled'
            ? 'Promise.allSettled'
            : `parallel: ${metadata.parallelMethod}`;
    badges.push(
      <span
        key="parallel"
        className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-200 dark:bg-blue-900/30 !text-gray-950 dark:!text-white rounded border border-blue-400 dark:border-blue-700"
      >
        {parallelLabel}
      </span>
    );
  }

  const baseLabel = (
    <div className="flex flex-col gap-1.5 w-full overflow-hidden">
      <div className="flex items-start gap-2 w-full overflow-hidden">
        <div className="flex-shrink-0">
          {getNodeIcon(nodeData.nodeKind, nodeData.label)}
        </div>
        <span className="text-sm font-medium break-words whitespace-normal leading-tight flex-1 min-w-0">
          {nodeData.label}
        </span>
      </div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1">{badges}</div>
      )}
    </div>
  );

  if (!executions || executions.length === 0) {
    return baseLabel;
  }

  const latestExecution = executions[executions.length - 1];
  const totalAttempts = executions.length;
  const hasRetries = totalAttempts > 1;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {baseLabel}

      {/* Execution metadata */}
      <div className="flex flex-wrap gap-1 text-xs">
        {/* Status badge */}
        <Badge
          variant={
            latestExecution.status === 'completed'
              ? 'default'
              : latestExecution.status === 'failed'
                ? 'destructive'
                : latestExecution.status === 'running'
                  ? 'secondary'
                  : latestExecution.status === 'cancelled'
                    ? 'outline'
                    : 'outline'
          }
          className="text-xs px-1.5 py-0"
        >
          {latestExecution.status}
        </Badge>

        {/* Retry indicator */}
        {hasRetries && (
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0 border-orange-500 text-orange-700 dark:text-orange-300"
          >
            ↻ {totalAttempts}x
          </Badge>
        )}

        {/* Duration */}
        {latestExecution.duration && latestExecution.duration > 0 && (
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            ⏱ {formatDuration(latestExecution.duration, true)}
          </Badge>
        )}
      </div>
    </div>
  );
}

// Layout constants - increased spacing for clarity
const LAYOUT = {
  NODE_WIDTH: 220,
  NODE_HEIGHT: 100,
  HORIZONTAL_SPACING: 280,
  VERTICAL_SPACING: 320, // Increased to prevent loop container overlap
  START_X: 250,
  PARALLEL_GROUP_PADDING: 25,
  LOOP_GROUP_PADDING: 50,
};

// Convert nodes with execution overlay
// Helper to calculate enhanced layout with control flow
function calculateEnhancedLayout(workflow: WorkflowGraph): {
  nodes: GraphNode[];
  groupNodes: Array<{
    id: string;
    type: 'group';
    position: { x: number; y: number };
    style: React.CSSProperties;
    data: { label: string };
  }>;
  additionalEdges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label?: string;
  }>;
} {
  // Clone nodes (positions are always provided by the manifest adapter)
  const nodes: GraphNode[] = workflow.nodes.map((node) => ({ ...node }));
  const additionalEdges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label?: string;
  }> = [];
  const groupNodes: Array<{
    id: string;
    type: 'group';
    position: { x: number; y: number };
    style: React.CSSProperties;
    data: { label: string };
  }> = [];

  // Group nodes by their control flow context
  const parallelGroups = new Map<
    string,
    { nodes: GraphNode[]; method?: string }
  >();
  const loopNodes = new Map<string, GraphNode[]>();
  const conditionalGroups = new Map<
    string,
    { thenBranch: GraphNode[]; elseBranch: GraphNode[] }
  >();

  for (const node of nodes) {
    if (node.metadata?.parallelGroupId) {
      const group = parallelGroups.get(node.metadata.parallelGroupId) || {
        nodes: [],
        method: node.metadata.parallelMethod,
      };
      group.nodes.push(node);
      parallelGroups.set(node.metadata.parallelGroupId, group);
    }
    if (node.metadata?.loopId) {
      const group = loopNodes.get(node.metadata.loopId) || [];
      group.push(node);
      loopNodes.set(node.metadata.loopId, group);
    }
    if (node.metadata?.conditionalId) {
      const groups = conditionalGroups.get(node.metadata.conditionalId) || {
        thenBranch: [],
        elseBranch: [],
      };
      if (node.metadata.conditionalBranch === 'Then') {
        groups.thenBranch.push(node);
      } else {
        groups.elseBranch.push(node);
      }
      conditionalGroups.set(node.metadata.conditionalId, groups);
    }
  }

  // Layout parallel nodes side-by-side and create visual group containers
  for (const [groupId, group] of parallelGroups) {
    const groupNodes_ = group.nodes;
    if (groupNodes_.length <= 1) continue;

    const baseY = groupNodes_[0].position.y;
    const spacing = LAYOUT.HORIZONTAL_SPACING;
    const totalWidth = (groupNodes_.length - 1) * spacing;
    const startX = LAYOUT.START_X - totalWidth / 2;

    groupNodes_.forEach((node, idx) => {
      node.position = {
        x: startX + idx * spacing,
        y: baseY,
      };
    });

    // Always create visual group container for Promise.all/race groups
    const minX = Math.min(...groupNodes_.map((n) => n.position.x));
    const maxX = Math.max(...groupNodes_.map((n) => n.position.x));
    const methodLabel =
      group.method === 'all'
        ? 'Promise.all'
        : group.method === 'race'
          ? 'Promise.race'
          : group.method === 'allSettled'
            ? 'Promise.allSettled'
            : 'Parallel';

    groupNodes.push({
      id: `group_${groupId}`,
      type: 'group',
      position: {
        x: minX - LAYOUT.PARALLEL_GROUP_PADDING,
        y: baseY - LAYOUT.PARALLEL_GROUP_PADDING,
      },
      style: {
        width:
          maxX - minX + LAYOUT.NODE_WIDTH + LAYOUT.PARALLEL_GROUP_PADDING * 2,
        height: LAYOUT.NODE_HEIGHT + LAYOUT.PARALLEL_GROUP_PADDING * 2,
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        border: '2px dashed rgba(59, 130, 246, 0.4)',
        borderRadius: 12,
      },
      data: { label: methodLabel },
    });
  }

  // Layout conditional branches side-by-side
  for (const [, branches] of conditionalGroups) {
    const allNodes = [...branches.thenBranch, ...branches.elseBranch];
    if (allNodes.length <= 1) continue;

    const thenNodes = branches.thenBranch;
    const elseNodes = branches.elseBranch;

    if (thenNodes.length > 0 && elseNodes.length > 0) {
      // Position then branch on the left, else on the right
      const baseY = Math.min(
        thenNodes[0]?.position.y || 0,
        elseNodes[0]?.position.y || 0
      );

      thenNodes.forEach((node, idx) => {
        node.position = {
          x: 100,
          y: baseY + idx * LAYOUT.VERTICAL_SPACING,
        };
      });

      elseNodes.forEach((node, idx) => {
        node.position = {
          x: 400,
          y: baseY + idx * LAYOUT.VERTICAL_SPACING,
        };
      });
    }
  }

  // Create visual containers for loops and add loop-back edges
  for (const [loopId, loopNodeList] of loopNodes) {
    if (loopNodeList.length > 0) {
      // Find first and last nodes in the loop by sorting by node ID
      loopNodeList.sort((a, b) => {
        const aNum = parseInt(a.id.replace('node_', '')) || 0;
        const bNum = parseInt(b.id.replace('node_', '')) || 0;
        return aNum - bNum;
      });

      const firstNode = loopNodeList[0];
      const lastNode = loopNodeList[loopNodeList.length - 1];

      // Calculate bounding box for all loop nodes (include padding for nested Promise.all boxes)
      const minX = Math.min(...loopNodeList.map((n) => n.position.x));
      const maxX = Math.max(...loopNodeList.map((n) => n.position.x));
      const minY = Math.min(...loopNodeList.map((n) => n.position.y));
      const maxY = Math.max(...loopNodeList.map((n) => n.position.y));

      // Determine if this is an await loop
      const isAwaitLoop = loopNodeList.some((n) => n.metadata?.loopIsAwait);
      const loopLabel = isAwaitLoop ? '⟳ for await loop' : '⟳ loop';

      // Check if this loop has nested parallel groups
      const hasNestedParallel = loopNodeList.some(
        (n) => n.metadata?.parallelGroupId
      );

      // Add extra padding for loop-back arrow and nested boxes (if any)
      const loopBackPadding = 40;
      const nestedBoxPadding = hasNestedParallel
        ? LAYOUT.PARALLEL_GROUP_PADDING + 10
        : 10;

      // Create a visual group container for the loop
      groupNodes.push({
        id: `loop_group_${loopId}`,
        type: 'group',
        position: {
          x:
            minX -
            LAYOUT.LOOP_GROUP_PADDING -
            loopBackPadding -
            nestedBoxPadding,
          y: minY - LAYOUT.LOOP_GROUP_PADDING - nestedBoxPadding - 25, // Space for label
        },
        style: {
          width:
            maxX -
            minX +
            LAYOUT.NODE_WIDTH +
            LAYOUT.LOOP_GROUP_PADDING * 2 +
            loopBackPadding +
            nestedBoxPadding * 2,
          height:
            maxY -
            minY +
            LAYOUT.NODE_HEIGHT +
            LAYOUT.LOOP_GROUP_PADDING * 2 +
            nestedBoxPadding * 2 +
            25,
          backgroundColor: 'rgba(168, 85, 247, 0.06)', // Lighter purple for loops
          border: '3px dashed rgba(168, 85, 247, 0.4)',
          borderRadius: 24,
        },
        data: { label: loopLabel },
      });

      // Add a back edge from the last node to first node (representing group-to-group flow)
      additionalEdges.push({
        id: `loop_back_${loopId}`,
        source: lastNode.id,
        target: firstNode.id,
        type: 'loop',
        label: '↺ loop',
      });
    }
  }

  return { nodes, groupNodes, additionalEdges };
}

function convertToReactFlowNodes(
  workflow: WorkflowGraph,
  execution?: WorkflowRunExecution
): Node[] {
  const { nodes, groupNodes } = calculateEnhancedLayout(workflow);

  // Build a map of node id -> parent group id for quick lookup
  const nodeToParent = new Map<string, string>();
  const groupPositions = new Map<string, { x: number; y: number }>();

  // Store group positions for relative position calculation
  for (const group of groupNodes) {
    groupPositions.set(group.id, group.position);
  }

  // Determine which parallel groups are inside loop groups
  const parallelGroupToLoop = new Map<string, string>();
  for (const node of nodes) {
    if (node.metadata?.parallelGroupId && node.metadata?.loopId) {
      const parallelGroupId = `group_${node.metadata.parallelGroupId}`;
      const loopGroupId = `loop_group_${node.metadata.loopId}`;
      if (groupPositions.has(loopGroupId)) {
        parallelGroupToLoop.set(parallelGroupId, loopGroupId);
      }
    }
  }

  // Determine parent for each node
  // If node is in a parallel group inside a loop, parent to the parallel group (which is itself in the loop)
  // If node is only in a loop (not parallel), parent directly to the loop
  // If node is only in a parallel group (not in loop), parent to the parallel group
  for (const node of nodes) {
    const parallelGroupId = node.metadata?.parallelGroupId
      ? `group_${node.metadata.parallelGroupId}`
      : null;
    const loopGroupId = node.metadata?.loopId
      ? `loop_group_${node.metadata.loopId}`
      : null;

    if (parallelGroupId && groupPositions.has(parallelGroupId)) {
      // If in a parallel group, always parent to it (parallel group handles its own loop parent)
      nodeToParent.set(node.id, parallelGroupId);
    } else if (loopGroupId && groupPositions.has(loopGroupId)) {
      // Only in loop (no parallel group), parent directly to loop
      nodeToParent.set(node.id, loopGroupId);
    }
  }

  // Start with group nodes (they render behind regular nodes)
  // Process loop groups first, then parallel groups (so parallel groups can be children of loops)
  const loopGroups = groupNodes.filter((g) => g.id.startsWith('loop_group_'));
  const parallelGroups = groupNodes.filter((g) => g.id.startsWith('group_'));

  const reactFlowNodes: Node[] = [];

  // Add loop groups first (they are top-level)
  for (const group of loopGroups) {
    reactFlowNodes.push({
      id: group.id,
      type: 'group',
      position: group.position,
      style: {
        ...group.style,
        cursor: 'grab',
      },
      data: group.data,
      selectable: true,
      draggable: true,
    });
  }

  // Add parallel groups (may be children of loop groups)
  for (const group of parallelGroups) {
    const parentLoopId = parallelGroupToLoop.get(group.id);
    let position = group.position;

    if (parentLoopId) {
      const parentPos = groupPositions.get(parentLoopId);
      if (parentPos) {
        // Convert to relative position within parent loop
        position = {
          x: group.position.x - parentPos.x,
          y: group.position.y - parentPos.y,
        };
      }
    }

    reactFlowNodes.push({
      id: group.id,
      type: 'group',
      position,
      parentId: parentLoopId,
      extent: parentLoopId ? 'parent' : undefined,
      style: {
        ...group.style,
        cursor: 'grab',
      },
      data: group.data,
      selectable: true,
      draggable: true,
    });
  }

  // Add regular nodes
  for (const node of nodes) {
    const executions = execution?.nodeExecutions.get(node.id);
    const styles = getNodeStyle(node.data.nodeKind, executions);
    const isCurrentNode = execution?.currentNode === node.id;

    let nodeType: 'input' | 'output' | 'default' = 'default';
    if (node.type === 'workflowStart') {
      nodeType = 'input';
    } else if (node.type === 'workflowEnd') {
      nodeType = 'output';
    }

    // Determine parent group and calculate relative position
    const parentId = nodeToParent.get(node.id);
    let position = node.position;

    if (parentId) {
      const parentPos = groupPositions.get(parentId);
      if (parentPos) {
        // Convert to relative position within parent
        position = {
          x: node.position.x - parentPos.x,
          y: node.position.y - parentPos.y,
        };
      }
    }

    reactFlowNodes.push({
      id: node.id,
      type: nodeType,
      position,
      parentId: parentId,
      extent: parentId ? 'parent' : undefined,
      expandParent: true,
      data: {
        ...node.data,
        label: renderNodeLabel(node.data, node.metadata, executions),
        executions, // Store for onClick handler
      },
      style: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        width: 220,
        ...styles,
      },
      className: isCurrentNode ? 'animate-pulse-subtle' : '',
    });
  }

  return reactFlowNodes;
}

// Edge type with optional consolidation flag
type ConsolidatedEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  isConsolidated?: boolean;
  isOriginal?: boolean;
};

// Consolidate edges between parallel groups to reduce visual clutter
function consolidateEdges(
  edges: ConsolidatedEdge[],
  nodes: GraphNode[]
): ConsolidatedEdge[] {
  // Build a map of node -> parallel group
  const nodeToGroup = new Map<string, string>();
  const groupNodes = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const groupId = node.metadata?.parallelGroupId;
    if (groupId) {
      nodeToGroup.set(node.id, groupId);
      const group = groupNodes.get(groupId) || [];
      group.push(node);
      groupNodes.set(groupId, group);
    }
  }

  // Find edges that connect different parallel groups (N×M pattern)
  // Group edges by source-group → target-group
  const groupToGroupEdges = new Map<string, ConsolidatedEdge[]>();
  const otherEdges: ConsolidatedEdge[] = [];

  for (const edge of edges) {
    const sourceGroup = nodeToGroup.get(edge.source);
    const targetGroup = nodeToGroup.get(edge.target);

    // If both nodes are in parallel groups AND they're different groups
    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
      const key = `${sourceGroup}→${targetGroup}`;
      const existing = groupToGroupEdges.get(key) || [];
      existing.push(edge);
      groupToGroupEdges.set(key, existing);
    } else {
      otherEdges.push(edge);
    }
  }

  // For each group-to-group connection, consolidate N×M edges to 1×M
  // (one source to all targets, so each target has an incoming edge)
  const consolidatedEdges: ConsolidatedEdge[] = [...otherEdges];

  for (const [, groupEdges] of groupToGroupEdges) {
    if (groupEdges.length > 1) {
      // Find unique sources and targets
      const sources = new Set(groupEdges.map((e) => e.source));
      const targets = new Set(groupEdges.map((e) => e.target));

      // Pick the first source as representative
      const representativeSource = [...sources][0];

      // Keep one edge from the representative source to EACH target
      // This ensures all target nodes have incoming edges
      for (const target of targets) {
        const edgeToTarget = groupEdges.find(
          (e) => e.source === representativeSource && e.target === target
        );
        if (edgeToTarget) {
          consolidatedEdges.push({
            ...edgeToTarget,
            isConsolidated: true,
          });
        } else {
          // If no direct edge exists, create one from the representative source
          const anyEdgeToTarget = groupEdges.find((e) => e.target === target);
          if (anyEdgeToTarget) {
            consolidatedEdges.push({
              ...anyEdgeToTarget,
              source: representativeSource,
              id: `consolidated_${representativeSource}_${target}`,
              isConsolidated: true,
            });
          }
        }
      }
    } else {
      // Only one edge, keep as-is
      consolidatedEdges.push(...groupEdges);
    }
  }

  return consolidatedEdges;
}

// Convert edges with execution overlay
function convertToReactFlowEdges(
  workflow: WorkflowGraph,
  execution?: WorkflowRunExecution
): Edge[] {
  const { additionalEdges } = calculateEnhancedLayout(workflow);

  // Filter out original loop edges - we replace them with a single clean loop-back edge
  const originalEdgesFiltered = workflow.edges.filter((e) => e.type !== 'loop');

  // Combine original edges with additional loop-back edges
  const rawEdges = [
    ...originalEdgesFiltered.map((e) => ({ ...e, isOriginal: true })),
    ...additionalEdges.map((e) => ({ ...e, isOriginal: false })),
  ];

  // Consolidate N×M edges between parallel groups into single edges
  const allEdges = consolidateEdges(rawEdges, workflow.nodes);

  return allEdges.map((edge) => {
    const traversal = execution?.edgeTraversals.get(edge.id);
    const isTraversed = traversal && traversal.traversalCount > 0;
    const hasExecution = !!execution;

    // Calculate average timing if available
    const avgTiming = traversal?.timings.length
      ? traversal.timings.reduce((a, b) => a + b, 0) / traversal.timings.length
      : undefined;

    // Determine edge type based on control flow
    // Use bezier for main flow (cleaner curves), step for loops (clear back-flow)
    let edgeType: 'bezier' | 'smoothstep' | 'step' = 'bezier';
    let baseStrokeColor = '#94a3b8';
    let strokeDasharray: string | undefined;
    let cfgLabel: string | undefined = edge.label;

    // Check if this is a loop-back edge (always show prominently)
    const isLoopBackEdge = edge.id.startsWith('loop_back_');

    switch (edge.type) {
      case 'parallel':
        // Parallel edges use straight paths for cleaner appearance
        edgeType = 'smoothstep';
        baseStrokeColor = hasExecution ? '#cbd5e1' : '#3b82f6';
        strokeDasharray = hasExecution ? undefined : '4,4';
        cfgLabel = undefined;
        break;
      case 'loop':
        // Loop-back edges route around nodes - always visible in purple
        edgeType = 'step';
        baseStrokeColor = '#a855f7'; // Always purple for loop-back
        strokeDasharray = '8,4';
        break;
      case 'conditional':
        edgeType = 'smoothstep';
        baseStrokeColor = hasExecution ? '#cbd5e1' : '#f59e0b';
        strokeDasharray = hasExecution ? undefined : '8,4';
        cfgLabel = undefined;
        break;
      default:
        edgeType = 'bezier';
        baseStrokeColor = hasExecution ? '#cbd5e1' : '#94a3b8';
    }

    // Execution state overrides (but loop-back edges stay purple)
    const finalStrokeColor = isLoopBackEdge
      ? '#a855f7'
      : isTraversed
        ? '#22c55e'
        : baseStrokeColor;
    const finalDasharray = isTraversed
      ? traversal && traversal.traversalCount > 1
        ? '5,5'
        : undefined
      : strokeDasharray;

    // Make non-traversed edges very subtle when there's execution data
    // But loop-back edges are always visible
    const opacity = isLoopBackEdge
      ? 0.9
      : hasExecution && !isTraversed
        ? 0.15
        : 1;
    const strokeWidth = isLoopBackEdge
      ? 2
      : isTraversed
        ? 2.5
        : hasExecution
          ? 0.5
          : 1;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edgeType,
      animated: isTraversed && execution?.status === 'running',
      label:
        traversal && traversal.traversalCount > 1 ? (
          <div className="flex flex-col items-center gap-0.5">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {traversal.traversalCount}×
            </Badge>
            {avgTiming && avgTiming > 0 && (
              <span className="text-[10px] text-muted-foreground">
                ~{formatDuration(avgTiming, true)}
              </span>
            )}
          </div>
        ) : (
          cfgLabel
        ),
      labelStyle: {
        fill: isLoopBackEdge ? '#a855f7' : 'hsl(var(--foreground))',
        fontWeight: isLoopBackEdge ? 600 : 500,
        fontSize: isLoopBackEdge ? '12px' : undefined,
      },
      labelBgStyle: {
        fill: 'hsl(var(--background))',
        fillOpacity: 0.9,
      },
      labelBgPadding: isLoopBackEdge
        ? ([6, 10] as [number, number])
        : ([4, 6] as [number, number]),
      labelBgBorderRadius: isLoopBackEdge ? 6 : 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: isTraversed ? 14 : 10,
        height: isTraversed ? 14 : 10,
        color: finalStrokeColor,
      },
      style: {
        strokeWidth,
        stroke: finalStrokeColor,
        opacity,
        strokeDasharray: finalDasharray,
      },
    };
  });
}

// Node Detail Panel Component
function GraphNodeDetailPanel({
  selectedNode,
  env,
  onClose,
}: {
  selectedNode: SelectedNodeInfo;
  env?: EnvMap;
  onClose: () => void;
}) {
  const { node, executions, stepId, runId } = selectedNode;
  const latestExecution = executions[executions.length - 1];
  const hasMultipleAttempts = executions.length > 1;

  // Fetch full step data with resolved input/output
  const { data: stepData, loading: stepLoading } = useWorkflowResourceData(
    env ?? {},
    'step',
    stepId ?? '',
    { runId }
  );

  // Use fetched data for input/output if available, fallback to execution data
  const resolvedInput = (stepData as any)?.input ?? latestExecution?.input;
  const resolvedOutput = (stepData as any)?.output ?? latestExecution?.output;
  const resolvedError = (stepData as any)?.error ?? latestExecution?.error;

  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* Header - similar to trace view */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b flex-none">
        <span
          className="text-xs font-medium truncate flex-1"
          title={node.data.label}
        >
          {node.data.label}
        </span>
        <div className="flex items-center gap-2 flex-none">
          {latestExecution?.duration !== undefined && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {formatDuration(latestExecution.duration)}
            </span>
          )}
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {/* Basic attributes in bordered container */}
        <div className="flex flex-col divide-y rounded-lg border overflow-hidden mb-3">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              type
            </span>
            <span className="text-[11px] font-mono">{node.data.nodeKind}</span>
          </div>
          {latestExecution && (
            <>
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">
                  status
                </span>
                <StatusBadge
                  status={mapToStatusBadgeStatus(latestExecution.status)}
                />
              </div>
              {latestExecution.duration !== undefined && (
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    duration
                  </span>
                  <span className="text-[11px] font-mono">
                    {formatDuration(latestExecution.duration)}
                  </span>
                </div>
              )}
              {hasMultipleAttempts && (
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    attempts
                  </span>
                  <span className="text-[11px] font-mono">
                    {executions.length}
                  </span>
                </div>
              )}
              {latestExecution.startedAt && (
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    startedAt
                  </span>
                  <span className="text-[11px] font-mono">
                    {new Date(latestExecution.startedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {latestExecution.completedAt && (
                <div className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    completedAt
                  </span>
                  <span className="text-[11px] font-mono">
                    {new Date(latestExecution.completedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Loading indicator for resolved data */}
        {stepLoading && stepId && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading step data...</span>
          </div>
        )}

        {/* Input section */}
        {resolvedInput !== undefined && (
          <details className="group mb-3">
            <summary className="cursor-pointer rounded-md border px-2.5 py-1.5 text-xs hover:brightness-95 bg-muted/50">
              <span className="font-medium">Input</span>
              <span className="text-muted-foreground ml-1">
                ({Array.isArray(resolvedInput) ? resolvedInput.length : 1} args)
              </span>
            </summary>
            <div className="relative pl-6 mt-3">
              <div className="absolute left-3 -top-3 w-px h-3 bg-border" />
              <div className="absolute left-3 top-0 w-3 h-3 border-l border-b rounded-bl-lg border-border" />
              <pre className="text-[11px] overflow-x-auto rounded-md border p-2.5 bg-muted/30 max-h-64 overflow-y-auto">
                <code>{JSON.stringify(resolvedInput, null, 2)}</code>
              </pre>
            </div>
          </details>
        )}

        {/* Output section */}
        {resolvedOutput !== undefined && (
          <details className="group mb-3">
            <summary className="cursor-pointer rounded-md border px-2.5 py-1.5 text-xs hover:brightness-95 bg-muted/50">
              <span className="font-medium">Output</span>
            </summary>
            <div className="relative pl-6 mt-3">
              <div className="absolute left-3 -top-3 w-px h-3 bg-border" />
              <div className="absolute left-3 top-0 w-3 h-3 border-l border-b rounded-bl-lg border-border" />
              <pre className="text-[11px] overflow-x-auto rounded-md border p-2.5 bg-muted/30 max-h-64 overflow-y-auto">
                <code>{JSON.stringify(resolvedOutput, null, 2)}</code>
              </pre>
            </div>
          </details>
        )}

        {/* Error section */}
        {resolvedError && (
          <details className="group mb-3" open>
            <summary className="cursor-pointer rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 px-2.5 py-1.5 text-xs hover:brightness-95">
              <span className="font-medium text-red-600 dark:text-red-400">
                Error
              </span>
            </summary>
            <div className="relative pl-6 mt-3">
              <div className="absolute left-3 -top-3 w-px h-3 bg-red-300" />
              <div className="absolute left-3 top-0 w-3 h-3 border-l border-b rounded-bl-lg border-red-300" />
              <pre className="text-[11px] overflow-x-auto rounded-md border border-red-200 p-2.5 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                <code>
                  {typeof resolvedError === 'object'
                    ? JSON.stringify(resolvedError, null, 2)
                    : String(resolvedError)}
                </code>
              </pre>
            </div>
          </details>
        )}

        {/* Attempt history for retries */}
        {hasMultipleAttempts && (
          <details className="group">
            <summary className="cursor-pointer rounded-md border px-2.5 py-1.5 text-xs hover:brightness-95 bg-muted/50">
              <span className="font-medium">Attempt History</span>
              <span className="text-muted-foreground ml-1">
                ({executions.length} attempts)
              </span>
            </summary>
            <div className="relative pl-6 mt-3">
              <div className="absolute left-3 -top-3 w-px h-3 bg-border" />
              <div className="absolute left-3 top-0 w-3 h-3 border-l border-b rounded-bl-lg border-border" />
              <div className="flex flex-col divide-y rounded-md border overflow-hidden">
                {executions.map((exec) => (
                  <div
                    key={exec.attemptNumber}
                    className="flex items-center justify-between px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="text-muted-foreground">
                      Attempt {exec.attemptNumber}
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={mapToStatusBadgeStatus(exec.status)}
                      />
                      {exec.duration !== undefined && (
                        <span className="font-mono text-muted-foreground">
                          {formatDuration(exec.duration)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export function WorkflowGraphExecutionViewer({
  workflow,
  execution,
  env,
  onNodeClick,
}: WorkflowGraphExecutionViewerProps) {
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(
    null
  );
  const panelWidth = 320;

  const initialNodes = useMemo(
    () => convertToReactFlowNodes(workflow, execution),
    [workflow, execution]
  );
  const initialEdges = useMemo(
    () => convertToReactFlowEdges(workflow, execution),
    [workflow, execution]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when workflow or execution changes
  // Preserve user-dragged positions by merging with current node positions
  useEffect(() => {
    setNodes((currentNodes) => {
      const newNodes = convertToReactFlowNodes(workflow, execution);
      // Create a map of current positions (user may have dragged nodes)
      const currentPositions = new Map(
        currentNodes.map((n) => [n.id, n.position])
      );
      // Merge new node data with existing positions
      return newNodes.map((node) => ({
        ...node,
        position: currentPositions.get(node.id) ?? node.position,
      }));
    });
    setEdges(convertToReactFlowEdges(workflow, execution));
  }, [workflow, execution, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const graphNode = workflow.nodes.find((n) => n.id === node.id);
      if (graphNode) {
        const executions = (node.data.executions as StepExecution[]) || [];
        const latestExecution = executions[executions.length - 1];
        setSelectedNode({
          nodeId: node.id,
          node: graphNode,
          executions,
          stepId: latestExecution?.stepId,
          runId: execution?.runId,
        });
        // Also call the external handler if provided
        if (onNodeClick && executions.length > 0) {
          onNodeClick(node.id, executions);
        }
      }
    },
    [workflow.nodes, execution?.runId, onNodeClick]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="h-full w-full border rounded-lg bg-background relative overflow-hidden flex">
      {/* Graph canvas */}
      <div
        className="h-full flex-1 min-w-0"
        style={{
          width: selectedNode ? `calc(100% - ${panelWidth}px)` : '100%',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />

          {/* Legend with execution states (matching status-badge colors) */}
          <Panel
            position="top-left"
            className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg p-2 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Running</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>Failed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>Canceled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span>Paused</span>
              </div>
              <div className="flex items-center gap-2 opacity-50">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span>Pending</span>
              </div>
            </div>
          </Panel>

          {/* Execution summary panel */}
          {execution && (
            <Panel
              position="top-right"
              className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg p-3 text-xs space-y-1.5"
            >
              <div className="font-semibold text-sm">Execution</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  variant={
                    execution.status === 'completed'
                      ? 'default'
                      : execution.status === 'failed'
                        ? 'destructive'
                        : execution.status === 'cancelled'
                          ? 'outline'
                          : 'secondary'
                  }
                  className="text-xs"
                >
                  {execution.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Progress:</span>
                <span className="font-mono">
                  {execution.executionPath.length} / {workflow.nodes.length}
                </span>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div className="h-full flex-none" style={{ width: panelWidth }}>
          <GraphNodeDetailPanel
            selectedNode={selectedNode}
            env={env}
            onClose={handleClosePanel}
          />
        </div>
      )}
    </div>
  );
}
