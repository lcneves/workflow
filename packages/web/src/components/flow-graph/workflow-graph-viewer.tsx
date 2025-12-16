'use client';

import {
  Background,
  BaseEdge,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useEffect, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import { GitBranch, PlayCircle, StopCircle } from 'lucide-react';
import './workflow-graph-viewer.css';
import type {
  GraphNode,
  WorkflowGraph,
} from '@/lib/flow-graph/workflow-graph-types';

interface WorkflowGraphViewerProps {
  workflow: WorkflowGraph;
}

// Custom Loop Node component with left-side handles for self-loop edge
function LoopNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as {
    label: React.ReactNode;
    nodeKind: string;
    isLoopNode?: boolean;
    isAwaitLoop?: boolean;
    nodeStyle?: React.CSSProperties;
  };

  return (
    <div
      className="relative"
      style={{
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        width: 220,
        borderStyle: 'solid',
        ...nodeData.nodeStyle,
        boxShadow: selected ? '0 0 0 2px rgba(168, 85, 247, 0.5)' : undefined,
      }}
    >
      {/* Node content */}
      {nodeData.label}

      {/* Main flow handles (top/bottom) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-500"
      />

      {/* Left-side handles for self-loop edge */}
      <Handle
        type="source"
        position={Position.Left}
        id="loop-out"
        className="!bg-purple-500 !-left-1"
        style={{ top: '30%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="loop-in"
        className="!bg-purple-500 !-left-1"
        style={{ top: '70%' }}
      />
    </div>
  );
}

// Custom node components
const nodeTypes = {
  loopNode: LoopNodeComponent,
};

// Custom self-loop edge that curves to the left of the node
function SelfLoopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  markerEnd,
}: EdgeProps) {
  // Calculate the loop path that goes to the left of the node
  const loopOffset = 50; // How far left the loop extends
  const verticalGap = targetY - sourceY;

  // Create a path that exits left, curves around, and enters left
  const path = `
    M ${sourceX} ${sourceY}
    C ${sourceX - loopOffset} ${sourceY},
      ${sourceX - loopOffset} ${targetY},
      ${targetX} ${targetY}
  `;

  // Label position (center-left of the loop)
  const labelX = sourceX - loopOffset - 10;
  const labelY = sourceY + verticalGap / 2;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: '#a855f7',
          strokeWidth: 2,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-100%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-200 dark:bg-purple-900/50 text-purple-700 dark:text-purple-200 rounded border border-purple-400 dark:border-purple-600 whitespace-nowrap">
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// Custom edge types
const edgeTypes = {
  selfLoop: SelfLoopEdge,
};

// Get node styling based on node kind - uses theme-aware colors
function getNodeStyle(nodeKind: string) {
  const baseStyle = {
    color: 'hsl(var(--card-foreground))',
  };

  if (nodeKind === 'workflow_start') {
    return {
      ...baseStyle,
      backgroundColor: 'rgba(34, 197, 94, 0.15)', // green with 15% opacity
      borderColor: '#22c55e', // green-500 - works in both light and dark
    };
  }
  if (nodeKind === 'workflow_end') {
    return {
      ...baseStyle,
      backgroundColor: 'rgba(148, 163, 184, 0.15)', // slate with 15% opacity
      borderColor: '#94a3b8', // slate-400 - works in both light and dark
    };
  }
  return {
    ...baseStyle,
    backgroundColor: 'rgba(96, 165, 250, 0.15)', // blue with 15% opacity
    borderColor: '#60a5fa', // blue-400 - works in both light and dark
  };
}

// Get node icon based on node kind
function getNodeIcon(nodeKind: string) {
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
  return <GitBranch className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />;
}

// Layout constants
const LAYOUT = {
  NODE_WIDTH: 220,
  NODE_HEIGHT: 100,
  HORIZONTAL_SPACING: 280,
  VERTICAL_SPACING: 220,
  START_X: 250,
  PARALLEL_GROUP_PADDING: 25,
  LOOP_GROUP_PADDING: 50,
};

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
    sourceHandle?: string;
    targetHandle?: string;
  }>;
} {
  // Clone nodes (positions are always provided by the manifest adapter)
  const nodes: GraphNode[] = workflow.nodes.map((node) => ({ ...node }));
  const groupNodes: Array<{
    id: string;
    type: 'group';
    position: { x: number; y: number };
    style: React.CSSProperties;
    data: { label: string };
  }> = [];
  const additionalEdges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    label?: string;
    sourceHandle?: string;
    targetHandle?: string;
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

    // Create a visual group container
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
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        border: '2px dashed rgba(59, 130, 246, 0.3)',
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
          y: baseY + idx * 120,
        };
      });

      elseNodes.forEach((node, idx) => {
        node.position = {
          x: 400,
          y: baseY + idx * 120,
        };
      });
    }
  }

  // Create visual containers for loops
  for (const [loopId, loopNodeList] of loopNodes) {
    if (loopNodeList.length > 0) {
      // Calculate bounding box for all loop nodes
      const minX = Math.min(...loopNodeList.map((n) => n.position.x));
      const maxX = Math.max(...loopNodeList.map((n) => n.position.x));
      const minY = Math.min(...loopNodeList.map((n) => n.position.y));
      const maxY = Math.max(...loopNodeList.map((n) => n.position.y));

      const isAwaitLoop = loopNodeList.some((n) => n.metadata?.loopIsAwait);
      const loopLabel = isAwaitLoop ? '⟳ for await' : '⟳ loop';

      // Create a visual group container for the loop
      groupNodes.push({
        id: `loop_group_${loopId}`,
        type: 'group',
        position: {
          x: minX - LAYOUT.LOOP_GROUP_PADDING * 2,
          y: minY - LAYOUT.LOOP_GROUP_PADDING - 25,
        },
        style: {
          width:
            maxX - minX + LAYOUT.NODE_WIDTH + LAYOUT.LOOP_GROUP_PADDING * 3,
          height:
            maxY -
            minY +
            LAYOUT.NODE_HEIGHT +
            LAYOUT.LOOP_GROUP_PADDING * 2 +
            25,
          backgroundColor: 'rgba(168, 85, 247, 0.05)',
          border: '3px dashed rgba(168, 85, 247, 0.4)',
          borderRadius: 16,
        },
        data: { label: loopLabel },
      });

      // Add self-loop edges for each node in the loop (using left-side handles)
      for (const loopNode of loopNodeList) {
        additionalEdges.push({
          id: `self_loop_${loopNode.id}`,
          source: loopNode.id,
          target: loopNode.id,
          sourceHandle: 'loop-out',
          targetHandle: 'loop-in',
          type: 'selfLoop',
          label: isAwaitLoop ? '⟳ await' : '⟳ loop',
        });
      }
    }
  }

  return { nodes, groupNodes, additionalEdges };
}

// Edge type with optional consolidation flag
type ConsolidatedEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
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
  for (const node of nodes) {
    if (node.metadata?.parallelGroupId) {
      nodeToGroup.set(node.id, node.metadata.parallelGroupId);
    }
  }

  // Find edges that connect different parallel groups (N×M pattern)
  // Group edges by source-group → target-group
  const groupToGroupEdges = new Map<string, ConsolidatedEdge[]>();
  const otherEdges: ConsolidatedEdge[] = [];

  for (const edge of edges) {
    const sourceGroup = nodeToGroup.get(edge.source);
    const targetGroup = nodeToGroup.get(edge.target);

    // Only consolidate if both nodes are in different parallel groups
    if (sourceGroup && targetGroup && sourceGroup !== targetGroup) {
      const key = `${sourceGroup}->${targetGroup}`;
      const existing = groupToGroupEdges.get(key) || [];
      existing.push(edge);
      groupToGroupEdges.set(key, existing);
    } else {
      otherEdges.push(edge);
    }
  }

  // For each group-to-group connection, consolidate N×M edges to 1×M
  const consolidatedEdges: ConsolidatedEdge[] = [...otherEdges];

  for (const [, groupEdges] of groupToGroupEdges) {
    if (groupEdges.length > 1) {
      // Find unique targets
      const uniqueTargets = [...new Set(groupEdges.map((e) => e.target))];
      // Pick the first source as the representative
      const representativeSource = groupEdges[0].source;

      // Create one edge from representative source to each unique target
      for (const target of uniqueTargets) {
        const originalEdge = groupEdges.find((e) => e.target === target);
        consolidatedEdges.push({
          ...originalEdge!,
          id: `consolidated_${representativeSource}_${target}`,
          source: representativeSource,
          target,
          isConsolidated: true,
        });
      }
    } else {
      // Only one edge, keep as-is
      consolidatedEdges.push(...groupEdges);
    }
  }

  return consolidatedEdges;
}

// Convert our graph nodes to React Flow format
function convertToReactFlowNodes(workflow: WorkflowGraph): Node[] {
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
      draggable: true,
      selectable: true,
      zIndex: -1,
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
      draggable: true,
      selectable: true,
      zIndex: -1,
    });
  }

  // Add regular nodes
  nodes.forEach((node) => {
    const styles = getNodeStyle(node.data.nodeKind);
    const metadata = node.metadata;
    const isLoopNode = !!metadata?.loopId;
    const isAwaitLoop = !!metadata?.loopIsAwait;

    // Determine node type - use custom loopNode for nodes in loops
    let nodeType: 'input' | 'output' | 'default' | 'loopNode' = isLoopNode
      ? 'loopNode'
      : 'default';
    if (node.type === 'workflowStart') {
      nodeType = 'input'; // Only source handle (outputs edges)
    } else if (node.type === 'workflowEnd') {
      nodeType = 'output'; // Only target handle (receives edges)
    }

    // Add CFG metadata badges (loop badge removed - now using visual notch)
    const badges: React.ReactNode[] = [];

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

    const nodeLabel = (
      <div
        key={`label-${node.id}`}
        className="flex flex-col gap-1.5 w-full overflow-hidden"
      >
        <div className="flex items-start gap-2 w-full overflow-hidden">
          <div className="flex-shrink-0">{getNodeIcon(node.data.nodeKind)}</div>
          <span className="text-sm font-medium break-words whitespace-normal leading-tight flex-1 min-w-0">
            {node.data.label}
          </span>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">{badges}</div>
        )}
      </div>
    );

    // For loop nodes, pass style through data for custom component
    if (isLoopNode) {
      reactFlowNodes.push({
        id: node.id,
        type: nodeType,
        position,
        parentId: parentId,
        extent: parentId ? 'parent' : undefined,
        expandParent: true,
        data: {
          ...node.data,
          label: nodeLabel,
          isLoopNode: true,
          isAwaitLoop,
          nodeStyle: styles,
        },
      });
    } else {
      reactFlowNodes.push({
        id: node.id,
        type: nodeType,
        position,
        parentId: parentId,
        extent: parentId ? 'parent' : undefined,
        expandParent: true,
        data: {
          ...node.data,
          label: nodeLabel,
        },
        style: {
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
          width: 220,
          ...styles,
        },
      });
    }
  });

  return reactFlowNodes;
}

// Convert our graph edges to React Flow format
function convertToReactFlowEdges(workflow: WorkflowGraph): Edge[] {
  const { additionalEdges } = calculateEnhancedLayout(workflow);

  // Filter out original loop edges - we'll use our own clean loop-back edges
  const originalEdgesFiltered = workflow.edges.filter((edge) => {
    // Skip original loop edges that go backwards (we add our own)
    if (edge.type === 'loop') {
      const sourceNum = parseInt(edge.source.replace('node_', '')) || 0;
      const targetNum = parseInt(edge.target.replace('node_', '')) || 0;
      if (targetNum <= sourceNum) {
        return false; // Skip backward loop edges
      }
    }
    return true;
  });

  // Combine original edges with additional loop-back edges
  const rawEdges = [
    ...originalEdgesFiltered.map((e) => ({ ...e, isOriginal: true })),
    ...additionalEdges.map((e) => ({ ...e, isOriginal: false })),
  ];

  // Consolidate N×M edges between parallel groups into single edges
  const allEdges = consolidateEdges(rawEdges, workflow.nodes);

  return allEdges.map((edge) => {
    // Handle self-loop edges specially (they use custom edge type and handles)
    if (edge.type === 'selfLoop') {
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: 'selfLoop',
        label: edge.label,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: '#a855f7',
        },
      };
    }

    // Check if this is a loop-back edge
    const isLoopBackEdge = edge.id.startsWith('loop_back_');

    // Customize edge style based on type
    let strokeColor = '#94a3b8'; // default gray
    let strokeWidth = 1;
    let strokeDasharray: string | undefined;
    const animated = false;
    let label: string | undefined = edge.label;
    let edgeType: 'smoothstep' | 'straight' | 'step' | 'bezier' = 'bezier';

    switch (edge.type) {
      case 'parallel':
        strokeColor = '#3b82f6'; // blue
        strokeWidth = 1.5;
        strokeDasharray = '4,4';
        edgeType = 'smoothstep';
        label = undefined;
        break;
      case 'loop':
        strokeColor = '#a855f7'; // purple
        strokeWidth = 2;
        strokeDasharray = '8,4';
        edgeType = 'step';
        // Keep label for loop-back edges
        break;
      case 'conditional':
        strokeColor = '#f59e0b'; // amber
        strokeWidth = 1;
        strokeDasharray = '8,4';
        edgeType = 'smoothstep';
        label = undefined;
        break;
      default:
        edgeType = 'bezier';
        break;
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edgeType,
      animated,
      label,
      labelStyle: {
        fill: isLoopBackEdge ? '#a855f7' : 'hsl(var(--foreground))',
        fontWeight: isLoopBackEdge ? 600 : 500,
        fontSize: isLoopBackEdge ? '12px' : '11px',
      },
      labelBgPadding: isLoopBackEdge
        ? ([6, 10] as [number, number])
        : ([4, 6] as [number, number]),
      labelBgBorderRadius: isLoopBackEdge ? 6 : 4,
      labelBgStyle: {
        fill: 'hsl(var(--background))',
        fillOpacity: 0.9,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: strokeColor,
      },
      style: {
        strokeWidth,
        stroke: strokeColor,
        strokeDasharray,
      },
    };
  });
}

export function WorkflowGraphViewer({ workflow }: WorkflowGraphViewerProps) {
  const initialNodes = useMemo(
    () => convertToReactFlowNodes(workflow),
    [workflow]
  );
  const initialEdges = useMemo(
    () => convertToReactFlowEdges(workflow),
    [workflow]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes and edges when workflow changes
  useEffect(() => {
    setNodes(convertToReactFlowNodes(workflow));
    setEdges(convertToReactFlowEdges(workflow));
  }, [workflow, setNodes, setEdges]);

  return (
    <div className="h-full w-full border rounded-lg bg-background relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <Panel
          position="top-left"
          className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg p-3 text-xs"
        >
          <div className="space-y-3">
            {/* Node types */}
            <div className="space-y-1">
              <div className="font-semibold text-[10px] text-muted-foreground mb-1.5">
                Node Types
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-100 dark:bg-green-950 border-2 border-green-600 dark:border-green-400" />
                <span>Workflow Start</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-100 dark:bg-blue-950 border-2 border-blue-600 dark:border-blue-400" />
                <span>Step</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-gray-600 dark:border-gray-400" />
                <span>Workflow End</span>
              </div>
            </div>

            {/* Control flow */}
            <div className="space-y-1 pt-2 border-t">
              <div className="font-semibold text-[10px] text-muted-foreground mb-1.5">
                Control Flow
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-12 h-0.5 bg-blue-500"
                  style={{ boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)' }}
                />
                <span>∥ Parallel</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-12 h-0.5 bg-purple-500"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, #a855f7, #a855f7 5px, transparent 5px, transparent 10px)',
                  }}
                />
                <span>⟳ Loop</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-12 h-0.5 bg-amber-500"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, #f59e0b, #f59e0b 8px, transparent 8px, transparent 12px)',
                  }}
                />
                <span>Conditional</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-0.5 bg-gray-400" />
                <span>Sequential</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
