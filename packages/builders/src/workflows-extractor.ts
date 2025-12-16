import { readFile } from 'node:fs/promises';
import type {
  ArrowFunctionExpression,
  BlockStatement,
  CallExpression,
  Expression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  MemberExpression,
  Program,
  Statement,
  VariableDeclaration,
} from '@swc/core';
import { parseSync } from '@swc/core';

// ============================================================================
// Constants
// ============================================================================

/**
 * Workflow primitives that should be shown as nodes in the graph.
 * These are built-in workflow functions that represent meaningful
 * pauses or wait points in the workflow execution.
 */
const WORKFLOW_PRIMITIVES = new Set(['sleep', 'createHook', 'createWebhook']);

// ============================================================================
// Internal Types (used during extraction only)
// ============================================================================

interface FunctionInfo {
  name: string;
  body: BlockStatement | Expression | null | undefined;
  isStep: boolean;
  stepId?: string;
}

interface AnalysisContext {
  parallelCounter: number;
  loopCounter: number;
  conditionalCounter: number;
  nodeCounter: number;
  inLoop: string | null;
  inConditional: string | null;
  /** Tracks variables assigned from createWebhook() or createHook() */
  webhookVariables: Set<string>;
}

interface AnalysisResult {
  nodes: ManifestNode[];
  edges: ManifestEdge[];
  entryNodeIds: string[];
  exitNodeIds: string[];
}

/**
 * Node metadata for control flow semantics
 */
export interface NodeMetadata {
  loopId?: string;
  loopIsAwait?: boolean;
  conditionalId?: string;
  conditionalBranch?: 'Then' | 'Else';
  parallelGroupId?: string;
  parallelMethod?: string;
  /** Step is passed as a reference (callback/tool) rather than directly called */
  isStepReference?: boolean;
  /** Context where the step reference was found (e.g., "tools.getWeather.execute") */
  referenceContext?: string;
  /** This node is a tool step connected to a DurableAgent */
  isTool?: boolean;
  /** The name of the tool (key in tools object) */
  toolName?: string;
  /** This node represents a collection of tools (imported variable) */
  isToolsCollection?: boolean;
  /** The variable name of the tools collection */
  toolsVariable?: string;
}

/**
 * Graph node for workflow visualization
 */
export interface ManifestNode {
  id: string;
  type: string;
  data: {
    label: string;
    nodeKind: string;
    stepId?: string;
  };
  metadata?: NodeMetadata;
}

/**
 * Graph edge for workflow control flow
 */
export interface ManifestEdge {
  id: string;
  source: string;
  target: string;
  type: 'default' | 'loop' | 'conditional' | 'parallel' | 'tool';
  label?: string;
}

/**
 * Graph data for a single workflow
 */
export interface WorkflowGraphData {
  nodes: ManifestNode[];
  edges: ManifestEdge[];
}

/**
 * Step entry in the manifest
 */
export interface ManifestStepEntry {
  stepId: string;
}

/**
 * Workflow entry in the manifest (includes graph data)
 */
export interface ManifestWorkflowEntry {
  workflowId: string;
  graph: WorkflowGraphData;
}

/**
 * Manifest structure - single source of truth for all workflow metadata
 */
export interface Manifest {
  version: string;
  steps: {
    [filePath: string]: {
      [stepName: string]: ManifestStepEntry;
    };
  };
  workflows: {
    [filePath: string]: {
      [workflowName: string]: ManifestWorkflowEntry;
    };
  };
}

// =============================================================================
// Extraction Functions
// =============================================================================

/**
 * Extracts workflow graphs from a bundled workflow file.
 * Returns workflow entries organized by file path, ready for merging into Manifest.
 */
export async function extractWorkflowGraphs(bundlePath: string): Promise<{
  [filePath: string]: {
    [workflowName: string]: ManifestWorkflowEntry;
  };
}> {
  const bundleCode = await readFile(bundlePath, 'utf-8');

  try {
    let actualWorkflowCode = bundleCode;

    const bundleAst = parseSync(bundleCode, {
      syntax: 'ecmascript',
      target: 'es2022',
    });

    const workflowCodeValue = extractWorkflowCodeFromBundle(bundleAst);
    if (workflowCodeValue) {
      actualWorkflowCode = workflowCodeValue;
    }

    const ast = parseSync(actualWorkflowCode, {
      syntax: 'ecmascript',
      target: 'es2022',
    });

    const stepDeclarations = extractStepDeclarations(actualWorkflowCode);
    const functionMap = buildFunctionMap(ast, stepDeclarations);
    const variableMap = buildVariableMap(ast);

    return extractWorkflows(ast, stepDeclarations, functionMap, variableMap);
  } catch (error) {
    console.error('Failed to extract workflow graphs from bundle:', error);
    return {};
  }
}

/**
 * Extract the workflowCode string value from a parsed bundle AST
 */
function extractWorkflowCodeFromBundle(ast: Program): string | null {
  for (const item of ast.body) {
    if (item.type === 'VariableDeclaration') {
      for (const decl of item.declarations) {
        if (
          decl.id.type === 'Identifier' &&
          decl.id.value === 'workflowCode' &&
          decl.init
        ) {
          if (decl.init.type === 'TemplateLiteral') {
            return decl.init.quasis.map((q) => q.cooked || q.raw).join('');
          }
          if (decl.init.type === 'StringLiteral') {
            return decl.init.value;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Extract step declarations using regex for speed
 */
function extractStepDeclarations(
  bundleCode: string
): Map<string, { stepId: string }> {
  const stepDeclarations = new Map<string, { stepId: string }>();

  const stepPattern =
    /var (\w+) = globalThis\[Symbol\.for\("WORKFLOW_USE_STEP"\)\]\("([^"]+)"\)/g;

  const lines = bundleCode.split('\n');
  for (const line of lines) {
    stepPattern.lastIndex = 0;
    const match = stepPattern.exec(line);
    if (match) {
      const [, varName, stepId] = match;
      stepDeclarations.set(varName, { stepId });
    }
  }

  return stepDeclarations;
}

/**
 * Extract inline step declarations from within a function body.
 * These are steps defined as variable declarations inside a workflow function.
 * Pattern: var/const varName = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("stepId")
 */
function extractInlineStepDeclarations(
  stmts: Statement[]
): Map<string, { stepId: string }> {
  const inlineSteps = new Map<string, { stepId: string }>();

  for (const stmt of stmts) {
    if (stmt.type === 'VariableDeclaration') {
      const varDecl = stmt as VariableDeclaration;
      for (const decl of varDecl.declarations) {
        if (
          decl.id.type === 'Identifier' &&
          decl.init?.type === 'CallExpression'
        ) {
          const callExpr = decl.init as CallExpression;
          // Check for globalThis[Symbol.for("WORKFLOW_USE_STEP")]("stepId") pattern
          if (callExpr.callee.type === 'MemberExpression') {
            const member = callExpr.callee as MemberExpression;
            // Check if object is globalThis
            if (
              member.object.type === 'Identifier' &&
              (member.object as Identifier).value === 'globalThis' &&
              member.property.type === 'Computed'
            ) {
              // For computed member access globalThis[Symbol.for(...)],
              // the property is a Computed type containing the expression
              const computedExpr = (member.property as any).expression;
              if (computedExpr?.type === 'CallExpression') {
                const symbolCall = computedExpr as CallExpression;
                // Check if it's Symbol.for("WORKFLOW_USE_STEP")
                if (symbolCall.callee.type === 'MemberExpression') {
                  const symbolMember = symbolCall.callee as MemberExpression;
                  if (
                    symbolMember.object.type === 'Identifier' &&
                    (symbolMember.object as Identifier).value === 'Symbol' &&
                    symbolMember.property.type === 'Identifier' &&
                    (symbolMember.property as Identifier).value === 'for' &&
                    symbolCall.arguments.length > 0 &&
                    symbolCall.arguments[0].expression.type ===
                      'StringLiteral' &&
                    (symbolCall.arguments[0].expression as any).value ===
                      'WORKFLOW_USE_STEP'
                  ) {
                    // Extract the stepId from the outer call arguments
                    if (
                      callExpr.arguments.length > 0 &&
                      callExpr.arguments[0].expression.type === 'StringLiteral'
                    ) {
                      const stepId = (callExpr.arguments[0].expression as any)
                        .value;
                      const varName = (decl.id as Identifier).value;
                      inlineSteps.set(varName, { stepId });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return inlineSteps;
}

/**
 * Build a map of all functions in the bundle for transitive step resolution
 */
function buildFunctionMap(
  ast: Program,
  stepDeclarations: Map<string, { stepId: string }>
): Map<string, FunctionInfo> {
  const functionMap = new Map<string, FunctionInfo>();

  for (const item of ast.body) {
    if (item.type === 'FunctionDeclaration') {
      const func = item as FunctionDeclaration;
      if (func.identifier) {
        const name = func.identifier.value;
        const isStep = stepDeclarations.has(name);
        functionMap.set(name, {
          name,
          body: func.body,
          isStep,
          stepId: isStep ? stepDeclarations.get(name)?.stepId : undefined,
        });
      }
    }

    if (item.type === 'VariableDeclaration') {
      const varDecl = item as VariableDeclaration;
      for (const decl of varDecl.declarations) {
        if (decl.id.type === 'Identifier' && decl.init) {
          const name = decl.id.value;
          const isStep = stepDeclarations.has(name);

          if (decl.init.type === 'FunctionExpression') {
            const funcExpr = decl.init as FunctionExpression;
            functionMap.set(name, {
              name,
              body: funcExpr.body,
              isStep,
              stepId: isStep ? stepDeclarations.get(name)?.stepId : undefined,
            });
          } else if (decl.init.type === 'ArrowFunctionExpression') {
            const arrowFunc = decl.init as ArrowFunctionExpression;
            functionMap.set(name, {
              name,
              body: arrowFunc.body,
              isStep,
              stepId: isStep ? stepDeclarations.get(name)?.stepId : undefined,
            });
          }
        }
      }
    }
  }

  return functionMap;
}

/**
 * Build a map of variable definitions (objects) for tool resolution
 * This allows us to resolve tools objects to the actual tools object
 */
function buildVariableMap(ast: Program): Map<string, any> {
  const variableMap = new Map<string, any>();

  for (const item of ast.body) {
    if (item.type === 'VariableDeclaration') {
      const varDecl = item as VariableDeclaration;
      for (const decl of varDecl.declarations) {
        if (
          decl.type === 'VariableDeclarator' &&
          decl.id.type === 'Identifier' &&
          decl.init?.type === 'ObjectExpression'
        ) {
          variableMap.set(decl.id.value, decl.init);
        }
      }
    }
  }

  return variableMap;
}

/**
 * Extract workflows from AST
 */
function extractWorkflows(
  ast: Program,
  stepDeclarations: Map<string, { stepId: string }>,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>
): {
  [filePath: string]: {
    [workflowName: string]: ManifestWorkflowEntry;
  };
} {
  const result: {
    [filePath: string]: {
      [workflowName: string]: ManifestWorkflowEntry;
    };
  } = {};

  for (const item of ast.body) {
    if (item.type === 'FunctionDeclaration') {
      const func = item as FunctionDeclaration;
      if (!func.identifier) continue;

      const workflowName = func.identifier.value;
      const workflowId = findWorkflowId(ast, workflowName);
      if (!workflowId) continue;

      // Extract file path and actual workflow name from workflowId: "workflow//path/to/file.ts//functionName"
      // The bundler may rename functions to avoid collisions (e.g. addTenWorkflow -> addTenWorkflow2),
      // but the workflowId contains the original TypeScript function name.
      const parts = workflowId.split('//');
      const filePath = parts.length > 1 ? parts[1] : 'unknown';
      const actualWorkflowName = parts.length > 2 ? parts[2] : workflowName;

      const graph = analyzeWorkflowFunction(
        func,
        workflowName,
        stepDeclarations,
        functionMap,
        variableMap
      );

      if (!result[filePath]) {
        result[filePath] = {};
      }

      result[filePath][actualWorkflowName] = {
        workflowId,
        graph,
      };
    }
  }

  return result;
}

/**
 * Find workflowId assignment for a function
 */
function findWorkflowId(ast: Program, functionName: string): string | null {
  for (const item of ast.body) {
    if (item.type === 'ExpressionStatement') {
      const expr = item.expression;
      if (expr.type === 'AssignmentExpression') {
        const left = expr.left;
        if (left.type === 'MemberExpression') {
          const obj = left.object;
          const prop = left.property;
          if (
            obj.type === 'Identifier' &&
            obj.value === functionName &&
            prop.type === 'Identifier' &&
            prop.value === 'workflowId'
          ) {
            const right = expr.right;
            if (right.type === 'StringLiteral') {
              return right.value;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Analyze a workflow function and build its graph
 */
function analyzeWorkflowFunction(
  func: FunctionDeclaration,
  workflowName: string,
  stepDeclarations: Map<string, { stepId: string }>,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>
): WorkflowGraphData {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];

  // Add start node
  nodes.push({
    id: 'start',
    type: 'workflowStart',
    data: {
      label: `Start: ${workflowName}`,
      nodeKind: 'workflow_start',
    },
  });

  const context: AnalysisContext = {
    parallelCounter: 0,
    loopCounter: 0,
    conditionalCounter: 0,
    nodeCounter: 0,
    inLoop: null,
    inConditional: null,
    webhookVariables: new Set(),
  };

  let prevExitIds = ['start'];

  if (func.body?.stmts) {
    // Extract inline step declarations from the workflow body
    // These are steps defined as variables inside the workflow function
    const inlineSteps = extractInlineStepDeclarations(func.body.stmts);

    // Merge inline steps with global step declarations
    const mergedStepDeclarations = new Map(stepDeclarations);
    for (const [name, info] of inlineSteps) {
      mergedStepDeclarations.set(name, info);
    }

    for (const stmt of func.body.stmts) {
      const result = analyzeStatement(
        stmt,
        mergedStepDeclarations,
        context,
        functionMap,
        variableMap
      );

      nodes.push(...result.nodes);
      edges.push(...result.edges);

      for (const prevId of prevExitIds) {
        for (const entryId of result.entryNodeIds) {
          const edgeId = `e_${prevId}_${entryId}`;
          if (!edges.find((e) => e.id === edgeId)) {
            const targetNode = result.nodes.find((n) => n.id === entryId);
            // Only use 'parallel' type for parallel group connections
            // Sequential connections (including to/from loops) should be 'default'
            const edgeType = targetNode?.metadata?.parallelGroupId
              ? 'parallel'
              : 'default';
            edges.push({
              id: edgeId,
              source: prevId,
              target: entryId,
              type: edgeType,
            });
          }
        }
      }

      if (result.exitNodeIds.length > 0) {
        prevExitIds = result.exitNodeIds;
      }
    }
  }

  // Add end node
  nodes.push({
    id: 'end',
    type: 'workflowEnd',
    data: {
      label: 'Return',
      nodeKind: 'workflow_end',
    },
  });

  for (const prevId of prevExitIds) {
    edges.push({
      id: `e_${prevId}_end`,
      source: prevId,
      target: 'end',
      type: 'default',
    });
  }

  return { nodes, edges };
}

/**
 * Analyze a statement and extract step calls with proper CFG structure
 */
function analyzeStatement(
  stmt: Statement,
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  let entryNodeIds: string[] = [];
  let exitNodeIds: string[] = [];

  if (stmt.type === 'VariableDeclaration') {
    const varDecl = stmt as VariableDeclaration;
    for (const decl of varDecl.declarations) {
      if (decl.init) {
        // Track webhook/hook variable assignments: const webhook = createWebhook()
        if (
          decl.id.type === 'Identifier' &&
          decl.init.type === 'CallExpression' &&
          (decl.init as CallExpression).callee.type === 'Identifier'
        ) {
          const funcName = ((decl.init as CallExpression).callee as Identifier)
            .value;
          if (funcName === 'createWebhook' || funcName === 'createHook') {
            context.webhookVariables.add((decl.id as Identifier).value);
          }
        }

        const result = analyzeExpression(
          decl.init,
          stepDeclarations,
          context,
          functionMap,
          variableMap
        );
        nodes.push(...result.nodes);
        edges.push(...result.edges);
        if (entryNodeIds.length === 0) {
          entryNodeIds = result.entryNodeIds;
        } else {
          for (const prevId of exitNodeIds) {
            for (const entryId of result.entryNodeIds) {
              edges.push({
                id: `e_${prevId}_${entryId}`,
                source: prevId,
                target: entryId,
                type: 'default',
              });
            }
          }
        }
        exitNodeIds = result.exitNodeIds;
      }
    }
  }

  if (stmt.type === 'ExpressionStatement') {
    const result = analyzeExpression(
      stmt.expression,
      stepDeclarations,
      context,
      functionMap,
      variableMap
    );
    nodes.push(...result.nodes);
    edges.push(...result.edges);
    entryNodeIds = result.entryNodeIds;
    exitNodeIds = result.exitNodeIds;
  }

  if (stmt.type === 'IfStatement') {
    const savedConditional = context.inConditional;
    const conditionalId = `cond_${context.conditionalCounter++}`;
    context.inConditional = conditionalId;

    if (stmt.consequent.type === 'BlockStatement') {
      const branchResult = analyzeBlock(
        stmt.consequent.stmts,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of branchResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.conditionalId = conditionalId;
        node.metadata.conditionalBranch = 'Then';
      }

      nodes.push(...branchResult.nodes);
      edges.push(...branchResult.edges);
      if (entryNodeIds.length === 0) {
        entryNodeIds = branchResult.entryNodeIds;
      }
      exitNodeIds.push(...branchResult.exitNodeIds);
    } else {
      // Handle single-statement consequent (no braces)
      const branchResult = analyzeStatement(
        stmt.consequent,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of branchResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.conditionalId = conditionalId;
        node.metadata.conditionalBranch = 'Then';
      }

      nodes.push(...branchResult.nodes);
      edges.push(...branchResult.edges);
      if (entryNodeIds.length === 0) {
        entryNodeIds = branchResult.entryNodeIds;
      }
      exitNodeIds.push(...branchResult.exitNodeIds);
    }

    if (stmt.alternate?.type === 'BlockStatement') {
      const branchResult = analyzeBlock(
        stmt.alternate.stmts,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of branchResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.conditionalId = conditionalId;
        node.metadata.conditionalBranch = 'Else';
      }

      nodes.push(...branchResult.nodes);
      edges.push(...branchResult.edges);
      if (entryNodeIds.length === 0) {
        entryNodeIds = branchResult.entryNodeIds;
      } else {
        entryNodeIds.push(...branchResult.entryNodeIds);
      }
      exitNodeIds.push(...branchResult.exitNodeIds);
    } else if (stmt.alternate) {
      // Handle single-statement alternate (no braces) or else-if
      const branchResult = analyzeStatement(
        stmt.alternate,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of branchResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.conditionalId = conditionalId;
        node.metadata.conditionalBranch = 'Else';
      }

      nodes.push(...branchResult.nodes);
      edges.push(...branchResult.edges);
      if (entryNodeIds.length === 0) {
        entryNodeIds = branchResult.entryNodeIds;
      } else {
        entryNodeIds.push(...branchResult.entryNodeIds);
      }
      exitNodeIds.push(...branchResult.exitNodeIds);
    }

    context.inConditional = savedConditional;
  }

  if (stmt.type === 'WhileStatement' || stmt.type === 'ForStatement') {
    const loopId = `loop_${context.loopCounter++}`;
    const savedLoop = context.inLoop;
    context.inLoop = loopId;

    const body =
      stmt.type === 'WhileStatement' ? stmt.body : (stmt as any).body;
    if (body.type === 'BlockStatement') {
      const loopResult = analyzeBlock(
        body.stmts,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of loopResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.loopId = loopId;
      }

      nodes.push(...loopResult.nodes);
      edges.push(...loopResult.edges);
      entryNodeIds = loopResult.entryNodeIds;
      exitNodeIds = loopResult.exitNodeIds;

      for (const exitId of loopResult.exitNodeIds) {
        for (const entryId of loopResult.entryNodeIds) {
          edges.push({
            id: `e_${exitId}_back_${entryId}`,
            source: exitId,
            target: entryId,
            type: 'loop',
          });
        }
      }
    } else {
      // Handle single-statement body (no braces)
      const loopResult = analyzeStatement(
        body,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of loopResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.loopId = loopId;
      }

      nodes.push(...loopResult.nodes);
      edges.push(...loopResult.edges);
      entryNodeIds = loopResult.entryNodeIds;
      exitNodeIds = loopResult.exitNodeIds;

      for (const exitId of loopResult.exitNodeIds) {
        for (const entryId of loopResult.entryNodeIds) {
          edges.push({
            id: `e_${exitId}_back_${entryId}`,
            source: exitId,
            target: entryId,
            type: 'loop',
          });
        }
      }
    }

    context.inLoop = savedLoop;
  }

  if (stmt.type === 'ForOfStatement') {
    const loopId = `loop_${context.loopCounter++}`;
    const savedLoop = context.inLoop;
    context.inLoop = loopId;

    const isAwait = (stmt as any).isAwait || (stmt as any).await;
    const body = (stmt as any).body;

    if (body.type === 'BlockStatement') {
      const loopResult = analyzeBlock(
        body.stmts,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of loopResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.loopId = loopId;
        node.metadata.loopIsAwait = isAwait;
      }

      nodes.push(...loopResult.nodes);
      edges.push(...loopResult.edges);
      entryNodeIds = loopResult.entryNodeIds;
      exitNodeIds = loopResult.exitNodeIds;

      for (const exitId of loopResult.exitNodeIds) {
        for (const entryId of loopResult.entryNodeIds) {
          edges.push({
            id: `e_${exitId}_back_${entryId}`,
            source: exitId,
            target: entryId,
            type: 'loop',
          });
        }
      }
    } else {
      // Handle single-statement body (no braces)
      const loopResult = analyzeStatement(
        body,
        stepDeclarations,
        context,
        functionMap,
        variableMap
      );

      for (const node of loopResult.nodes) {
        if (!node.metadata) node.metadata = {};
        node.metadata.loopId = loopId;
        node.metadata.loopIsAwait = isAwait;
      }

      nodes.push(...loopResult.nodes);
      edges.push(...loopResult.edges);
      entryNodeIds = loopResult.entryNodeIds;
      exitNodeIds = loopResult.exitNodeIds;

      for (const exitId of loopResult.exitNodeIds) {
        for (const entryId of loopResult.entryNodeIds) {
          edges.push({
            id: `e_${exitId}_back_${entryId}`,
            source: exitId,
            target: entryId,
            type: 'loop',
          });
        }
      }
    }

    context.inLoop = savedLoop;
  }

  // Handle plain BlockStatement (bare blocks like { ... })
  if (stmt.type === 'BlockStatement') {
    const blockResult = analyzeBlock(
      (stmt as BlockStatement).stmts,
      stepDeclarations,
      context,
      functionMap,
      variableMap
    );
    nodes.push(...blockResult.nodes);
    edges.push(...blockResult.edges);
    entryNodeIds = blockResult.entryNodeIds;
    exitNodeIds = blockResult.exitNodeIds;
  }

  if (stmt.type === 'ReturnStatement' && (stmt as any).argument) {
    const result = analyzeExpression(
      (stmt as any).argument,
      stepDeclarations,
      context,
      functionMap,
      variableMap
    );
    nodes.push(...result.nodes);
    edges.push(...result.edges);
    entryNodeIds = result.entryNodeIds;
    exitNodeIds = result.exitNodeIds;
  }

  return { nodes, edges, entryNodeIds, exitNodeIds };
}

/**
 * Analyze a block of statements with proper sequential chaining
 */
function analyzeBlock(
  stmts: Statement[],
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  let entryNodeIds: string[] = [];
  let currentExitIds: string[] = [];

  for (const stmt of stmts) {
    const result = analyzeStatement(
      stmt,
      stepDeclarations,
      context,
      functionMap,
      variableMap
    );

    if (result.nodes.length === 0) continue;

    nodes.push(...result.nodes);
    edges.push(...result.edges);

    if (entryNodeIds.length === 0 && result.entryNodeIds.length > 0) {
      entryNodeIds = result.entryNodeIds;
    }

    if (currentExitIds.length > 0 && result.entryNodeIds.length > 0) {
      for (const prevId of currentExitIds) {
        for (const entryId of result.entryNodeIds) {
          const targetNode = result.nodes.find((n) => n.id === entryId);
          const edgeType = targetNode?.metadata?.parallelGroupId
            ? 'parallel'
            : 'default';
          edges.push({
            id: `e_${prevId}_${entryId}`,
            source: prevId,
            target: entryId,
            type: edgeType,
          });
        }
      }
    }

    if (result.exitNodeIds.length > 0) {
      currentExitIds = result.exitNodeIds;
    }
  }

  return { nodes, edges, entryNodeIds, exitNodeIds: currentExitIds };
}

/**
 * Analyze an expression and extract step calls
 */
function analyzeExpression(
  expr: Expression,
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>,
  visitedFunctions: Set<string> = new Set()
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  const entryNodeIds: string[] = [];
  const exitNodeIds: string[] = [];

  if (expr.type === 'AwaitExpression') {
    const awaitedExpr = expr.argument;
    if (awaitedExpr.type === 'CallExpression') {
      const callExpr = awaitedExpr as CallExpression;

      // Check for Promise.all/race/allSettled/any
      if (callExpr.callee.type === 'MemberExpression') {
        const member = callExpr.callee as MemberExpression;
        if (
          member.object.type === 'Identifier' &&
          (member.object as Identifier).value === 'Promise' &&
          member.property.type === 'Identifier'
        ) {
          const method = (member.property as Identifier).value;
          if (['all', 'race', 'allSettled', 'any'].includes(method)) {
            const parallelId = `parallel_${context.parallelCounter++}`;

            if (callExpr.arguments.length > 0) {
              const arg = callExpr.arguments[0].expression;
              if (arg.type === 'ArrayExpression') {
                for (const element of arg.elements) {
                  if (element?.expression) {
                    const elemResult = analyzeExpression(
                      element.expression,
                      stepDeclarations,
                      context,
                      functionMap,
                      variableMap,
                      visitedFunctions
                    );

                    for (const node of elemResult.nodes) {
                      if (!node.metadata) node.metadata = {};
                      node.metadata.parallelGroupId = parallelId;
                      node.metadata.parallelMethod = method;
                      if (context.inLoop) {
                        node.metadata.loopId = context.inLoop;
                      }
                    }

                    nodes.push(...elemResult.nodes);
                    edges.push(...elemResult.edges);
                    entryNodeIds.push(...elemResult.entryNodeIds);
                    exitNodeIds.push(...elemResult.exitNodeIds);
                  }
                }
              } else {
                // Handle non-array arguments like array.map(stepFn)
                const argResult = analyzeExpression(
                  arg,
                  stepDeclarations,
                  context,
                  functionMap,
                  variableMap,
                  visitedFunctions
                );

                for (const node of argResult.nodes) {
                  if (!node.metadata) node.metadata = {};
                  node.metadata.parallelGroupId = parallelId;
                  node.metadata.parallelMethod = method;
                  if (context.inLoop) {
                    node.metadata.loopId = context.inLoop;
                  }
                }

                nodes.push(...argResult.nodes);
                edges.push(...argResult.edges);
                entryNodeIds.push(...argResult.entryNodeIds);
                exitNodeIds.push(...argResult.exitNodeIds);
              }
            }

            return { nodes, edges, entryNodeIds, exitNodeIds };
          }
        }
      }

      // Regular call - check if it's a step, workflow primitive, or helper function
      if (callExpr.callee.type === 'Identifier') {
        const funcName = (callExpr.callee as Identifier).value;
        const stepInfo = stepDeclarations.get(funcName);

        if (stepInfo) {
          const nodeId = `node_${context.nodeCounter++}`;
          const metadata: NodeMetadata = {};

          if (context.inLoop) {
            metadata.loopId = context.inLoop;
          }
          if (context.inConditional) {
            metadata.conditionalId = context.inConditional;
          }

          const node: ManifestNode = {
            id: nodeId,
            type: 'step',
            data: {
              label: funcName,
              nodeKind: 'step',
              stepId: stepInfo.stepId,
            },
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          };

          nodes.push(node);
          entryNodeIds.push(nodeId);
          exitNodeIds.push(nodeId);
        } else if (WORKFLOW_PRIMITIVES.has(funcName)) {
          // Handle workflow primitives like sleep
          const nodeId = `node_${context.nodeCounter++}`;
          const metadata: NodeMetadata = {};

          if (context.inLoop) {
            metadata.loopId = context.inLoop;
          }
          if (context.inConditional) {
            metadata.conditionalId = context.inConditional;
          }

          const node: ManifestNode = {
            id: nodeId,
            type: 'primitive',
            data: {
              label: funcName,
              nodeKind: 'primitive',
            },
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          };

          nodes.push(node);
          entryNodeIds.push(nodeId);
          exitNodeIds.push(nodeId);
        } else {
          const transitiveResult = analyzeTransitiveCall(
            funcName,
            stepDeclarations,
            context,
            functionMap,
            variableMap,
            visitedFunctions
          );
          nodes.push(...transitiveResult.nodes);
          edges.push(...transitiveResult.edges);
          entryNodeIds.push(...transitiveResult.entryNodeIds);
          exitNodeIds.push(...transitiveResult.exitNodeIds);
        }
      }

      // Also analyze the arguments of awaited calls for step references in objects
      for (const arg of callExpr.arguments) {
        if (arg.expression?.type === 'ObjectExpression') {
          const refResult = analyzeObjectForStepReferences(
            arg.expression,
            stepDeclarations,
            context,
            ''
          );
          nodes.push(...refResult.nodes);
          edges.push(...refResult.edges);
          entryNodeIds.push(...refResult.entryNodeIds);
          exitNodeIds.push(...refResult.exitNodeIds);
        }
      }
    }

    // Handle await on a webhook/hook variable: await webhook
    if (awaitedExpr.type === 'Identifier') {
      const varName = (awaitedExpr as Identifier).value;
      if (context.webhookVariables.has(varName)) {
        const nodeId = `node_${context.nodeCounter++}`;
        const metadata: NodeMetadata = {};

        if (context.inLoop) {
          metadata.loopId = context.inLoop;
        }
        if (context.inConditional) {
          metadata.conditionalId = context.inConditional;
        }

        const node: ManifestNode = {
          id: nodeId,
          type: 'primitive',
          data: {
            label: 'awaitWebhook',
            nodeKind: 'primitive',
          },
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };

        nodes.push(node);
        entryNodeIds.push(nodeId);
        exitNodeIds.push(nodeId);
      }
    }
  }

  // Non-awaited call expression
  if (expr.type === 'CallExpression') {
    const callExpr = expr as CallExpression;
    if (callExpr.callee.type === 'Identifier') {
      const funcName = (callExpr.callee as Identifier).value;
      const stepInfo = stepDeclarations.get(funcName);

      if (stepInfo) {
        const nodeId = `node_${context.nodeCounter++}`;
        const metadata: NodeMetadata = {};

        if (context.inLoop) {
          metadata.loopId = context.inLoop;
        }
        if (context.inConditional) {
          metadata.conditionalId = context.inConditional;
        }

        const node: ManifestNode = {
          id: nodeId,
          type: 'step',
          data: {
            label: funcName,
            nodeKind: 'step',
            stepId: stepInfo.stepId,
          },
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };

        nodes.push(node);
        entryNodeIds.push(nodeId);
        exitNodeIds.push(nodeId);
      } else if (WORKFLOW_PRIMITIVES.has(funcName)) {
        // Handle non-awaited workflow primitives like createHook, createWebhook
        const nodeId = `node_${context.nodeCounter++}`;
        const metadata: NodeMetadata = {};

        if (context.inLoop) {
          metadata.loopId = context.inLoop;
        }
        if (context.inConditional) {
          metadata.conditionalId = context.inConditional;
        }

        const node: ManifestNode = {
          id: nodeId,
          type: 'primitive',
          data: {
            label: funcName,
            nodeKind: 'primitive',
          },
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };

        nodes.push(node);
        entryNodeIds.push(nodeId);
        exitNodeIds.push(nodeId);
      } else {
        const transitiveResult = analyzeTransitiveCall(
          funcName,
          stepDeclarations,
          context,
          functionMap,
          variableMap,
          visitedFunctions
        );
        nodes.push(...transitiveResult.nodes);
        edges.push(...transitiveResult.edges);
        entryNodeIds.push(...transitiveResult.entryNodeIds);
        exitNodeIds.push(...transitiveResult.exitNodeIds);
      }
    }
  }

  // Check for step references in object literals
  if (expr.type === 'ObjectExpression') {
    const refResult = analyzeObjectForStepReferences(
      expr,
      stepDeclarations,
      context,
      ''
    );
    nodes.push(...refResult.nodes);
    edges.push(...refResult.edges);
    entryNodeIds.push(...refResult.entryNodeIds);
    exitNodeIds.push(...refResult.exitNodeIds);
  }

  // Check for step references and step calls in function call arguments
  if (expr.type === 'CallExpression') {
    const callExpr = expr as CallExpression;
    for (const arg of callExpr.arguments) {
      if (arg.expression) {
        if (arg.expression.type === 'Identifier') {
          const argName = (arg.expression as Identifier).value;
          const stepInfo = stepDeclarations.get(argName);
          if (stepInfo) {
            const nodeId = `node_${context.nodeCounter++}`;
            const node: ManifestNode = {
              id: nodeId,
              type: 'step',
              data: {
                label: `${argName} (ref)`,
                nodeKind: 'step',
                stepId: stepInfo.stepId,
              },
              metadata: {
                isStepReference: true,
                referenceContext: 'function argument',
              },
            };
            nodes.push(node);
            entryNodeIds.push(nodeId);
            exitNodeIds.push(nodeId);
          }
        }
        // Handle step calls passed as arguments (e.g., map.set(key, stepCall()))
        if (arg.expression.type === 'CallExpression') {
          const argCallExpr = arg.expression as CallExpression;
          if (argCallExpr.callee.type === 'Identifier') {
            const funcName = (argCallExpr.callee as Identifier).value;
            const stepInfo = stepDeclarations.get(funcName);
            if (stepInfo) {
              const nodeId = `node_${context.nodeCounter++}`;
              const metadata: NodeMetadata = {};
              if (context.inLoop) {
                metadata.loopId = context.inLoop;
              }
              if (context.inConditional) {
                metadata.conditionalId = context.inConditional;
              }
              const node: ManifestNode = {
                id: nodeId,
                type: 'step',
                data: {
                  label: funcName,
                  nodeKind: 'step',
                  stepId: stepInfo.stepId,
                },
                metadata:
                  Object.keys(metadata).length > 0 ? metadata : undefined,
              };
              nodes.push(node);
              entryNodeIds.push(nodeId);
              exitNodeIds.push(nodeId);
            }
          }
        }
        if (arg.expression.type === 'ObjectExpression') {
          const refResult = analyzeObjectForStepReferences(
            arg.expression,
            stepDeclarations,
            context,
            ''
          );
          nodes.push(...refResult.nodes);
          edges.push(...refResult.edges);
          entryNodeIds.push(...refResult.entryNodeIds);
          exitNodeIds.push(...refResult.exitNodeIds);
        }
      }
    }
  }

  // Check for step references in 'new' expressions
  if (expr.type === 'NewExpression') {
    const newExpr = expr as any;

    // Check if this is a DurableAgent instantiation
    const isDurableAgent =
      newExpr.callee?.type === 'Identifier' &&
      newExpr.callee?.value === 'DurableAgent';

    if (isDurableAgent && newExpr.arguments?.length > 0) {
      // Create a node for the DurableAgent itself
      const agentNodeId = `node_${context.nodeCounter++}`;
      const agentNode: ManifestNode = {
        id: agentNodeId,
        type: 'agent',
        data: {
          label: 'DurableAgent',
          nodeKind: 'agent',
        },
        metadata: {
          isStepReference: true,
          referenceContext: 'DurableAgent',
        },
      };
      nodes.push(agentNode);
      entryNodeIds.push(agentNodeId);

      // Look for tools in the constructor options
      const optionsArg = newExpr.arguments[0]?.expression;
      if (optionsArg?.type === 'ObjectExpression') {
        const toolsResult = analyzeDurableAgentTools(
          optionsArg,
          stepDeclarations,
          context,
          agentNodeId,
          variableMap
        );
        nodes.push(...toolsResult.nodes);
        edges.push(...toolsResult.edges);

        // If we found tools, they are the exit nodes
        if (toolsResult.exitNodeIds.length > 0) {
          exitNodeIds.push(...toolsResult.exitNodeIds);
        } else {
          exitNodeIds.push(agentNodeId);
        }
      } else {
        exitNodeIds.push(agentNodeId);
      }
    } else if (newExpr.arguments) {
      for (const arg of newExpr.arguments) {
        if (arg.expression?.type === 'ObjectExpression') {
          const refResult = analyzeObjectForStepReferences(
            arg.expression,
            stepDeclarations,
            context,
            ''
          );
          nodes.push(...refResult.nodes);
          edges.push(...refResult.edges);
          entryNodeIds.push(...refResult.entryNodeIds);
          exitNodeIds.push(...refResult.exitNodeIds);
        }
      }
    }
  }

  // Handle AssignmentExpression - analyze the right-hand side
  if (expr.type === 'AssignmentExpression') {
    const assignExpr = expr as any;
    if (assignExpr.right) {
      const rightResult = analyzeExpression(
        assignExpr.right,
        stepDeclarations,
        context,
        functionMap,
        variableMap,
        visitedFunctions
      );
      nodes.push(...rightResult.nodes);
      edges.push(...rightResult.edges);
      entryNodeIds.push(...rightResult.entryNodeIds);
      exitNodeIds.push(...rightResult.exitNodeIds);
    }
  }

  // Handle MemberExpression calls like array.map(stepFn) where step is passed as callback
  if (expr.type === 'CallExpression') {
    const callExpr = expr as CallExpression;
    if (callExpr.callee.type === 'MemberExpression') {
      const member = callExpr.callee as MemberExpression;
      // Check if this is a method call like .map(), .forEach(), .filter() etc.
      if (member.property.type === 'Identifier') {
        const methodName = (member.property as Identifier).value;
        if (
          [
            'map',
            'forEach',
            'filter',
            'find',
            'some',
            'every',
            'flatMap',
          ].includes(methodName)
        ) {
          // Check if any argument is a step function reference
          for (const arg of callExpr.arguments) {
            if (arg.expression?.type === 'Identifier') {
              const argName = (arg.expression as Identifier).value;
              const stepInfo = stepDeclarations.get(argName);
              if (stepInfo) {
                const nodeId = `node_${context.nodeCounter++}`;
                const metadata: NodeMetadata = {};
                if (context.inLoop) {
                  metadata.loopId = context.inLoop;
                }
                if (context.inConditional) {
                  metadata.conditionalId = context.inConditional;
                }
                const node: ManifestNode = {
                  id: nodeId,
                  type: 'step',
                  data: {
                    label: argName,
                    nodeKind: 'step',
                    stepId: stepInfo.stepId,
                  },
                  metadata:
                    Object.keys(metadata).length > 0 ? metadata : undefined,
                };
                nodes.push(node);
                entryNodeIds.push(nodeId);
                exitNodeIds.push(nodeId);
              }
            }
          }
        }
      }
    }
  }

  return { nodes, edges, entryNodeIds, exitNodeIds };
}

/**
 * Analyze DurableAgent tools property to extract tool nodes
 */
function analyzeDurableAgentTools(
  optionsObj: any,
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  agentNodeId: string,
  variableMap: Map<string, any>
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  const entryNodeIds: string[] = [];
  const exitNodeIds: string[] = [];

  if (!optionsObj.properties)
    return { nodes, edges, entryNodeIds, exitNodeIds };

  // Helper function to extract tools from an ObjectExpression
  function extractToolsFromObject(toolsObj: any): void {
    for (const toolProp of toolsObj.properties || []) {
      if (toolProp.type !== 'KeyValueProperty') continue;

      let toolName = '';
      if (toolProp.key.type === 'Identifier') {
        toolName = toolProp.key.value;
      }

      if (!toolName) continue;

      // Look for execute property in the tool definition
      if (toolProp.value.type === 'ObjectExpression') {
        for (const innerProp of toolProp.value.properties || []) {
          if (innerProp.type !== 'KeyValueProperty') continue;

          let innerKey = '';
          if (innerProp.key.type === 'Identifier') {
            innerKey = innerProp.key.value;
          }

          if (innerKey === 'execute' && innerProp.value.type === 'Identifier') {
            const stepName = innerProp.value.value;
            const stepInfo = stepDeclarations.get(stepName);

            const nodeId = `node_${context.nodeCounter++}`;
            const node: ManifestNode = {
              id: nodeId,
              type: 'tool',
              data: {
                label: stepName,
                nodeKind: 'tool',
                stepId: stepInfo?.stepId,
              },
              metadata: {
                isTool: true,
                toolName: toolName,
                referenceContext: `tools.${toolName}.execute`,
              },
            };
            nodes.push(node);
            exitNodeIds.push(nodeId);

            // Connect agent to this tool with tool edge type
            edges.push({
              id: `e_${agentNodeId}_${nodeId}`,
              source: agentNodeId,
              target: nodeId,
              type: 'tool',
            });
          }
        }
      }
    }
  }

  // Find the 'tools' property
  for (const prop of optionsObj.properties) {
    if (prop.type !== 'KeyValueProperty') continue;

    let keyName = '';
    if (prop.key.type === 'Identifier') {
      keyName = prop.key.value;
    }

    if (keyName !== 'tools') continue;

    // Handle inline tools object
    if (prop.value.type === 'ObjectExpression') {
      extractToolsFromObject(prop.value);
    }

    // Handle tools as a variable reference - resolve it from variableMap
    if (prop.value.type === 'Identifier') {
      const toolsVarName = prop.value.value;

      // Try to resolve the variable from the variableMap (bundled code)
      const resolvedToolsObj = variableMap.get(toolsVarName);

      if (resolvedToolsObj && resolvedToolsObj.type === 'ObjectExpression') {
        // Successfully resolved - extract individual tools
        extractToolsFromObject(resolvedToolsObj);
      } else {
        // Fallback: create a placeholder node if we can't resolve
        const nodeId = `node_${context.nodeCounter++}`;
        const node: ManifestNode = {
          id: nodeId,
          type: 'tool',
          data: {
            label: `${toolsVarName}`,
            nodeKind: 'tool',
          },
          metadata: {
            isToolsCollection: true,
            toolsVariable: toolsVarName,
            referenceContext: `tools:${toolsVarName}`,
          },
        };
        nodes.push(node);
        exitNodeIds.push(nodeId);

        // Connect agent to tools with tool edge type
        edges.push({
          id: `e_${agentNodeId}_${nodeId}`,
          source: agentNodeId,
          target: nodeId,
          type: 'tool',
        });
      }
    }
  }

  return { nodes, edges, entryNodeIds, exitNodeIds };
}

/**
 * Analyze an object expression for step references
 */
function analyzeObjectForStepReferences(
  obj: any,
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  path: string
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  const entryNodeIds: string[] = [];
  const exitNodeIds: string[] = [];

  if (!obj.properties) return { nodes, edges, entryNodeIds, exitNodeIds };

  for (const prop of obj.properties) {
    if (prop.type !== 'KeyValueProperty') continue;

    let keyName = '';
    if (prop.key.type === 'Identifier') {
      keyName = prop.key.value;
    } else if (prop.key.type === 'StringLiteral') {
      keyName = prop.key.value;
    }

    const currentPath = path ? `${path}.${keyName}` : keyName;

    if (prop.value.type === 'Identifier') {
      const valueName = prop.value.value;
      const stepInfo = stepDeclarations.get(valueName);
      if (stepInfo) {
        const nodeId = `node_${context.nodeCounter++}`;
        const node: ManifestNode = {
          id: nodeId,
          type: 'step',
          data: {
            label: `${valueName} (tool)`,
            nodeKind: 'step',
            stepId: stepInfo.stepId,
          },
          metadata: {
            isStepReference: true,
            referenceContext: currentPath,
          },
        };
        nodes.push(node);
        entryNodeIds.push(nodeId);
        exitNodeIds.push(nodeId);
      }
    }

    if (prop.value.type === 'ObjectExpression') {
      const nestedResult = analyzeObjectForStepReferences(
        prop.value,
        stepDeclarations,
        context,
        currentPath
      );
      nodes.push(...nestedResult.nodes);
      edges.push(...nestedResult.edges);
      entryNodeIds.push(...nestedResult.entryNodeIds);
      exitNodeIds.push(...nestedResult.exitNodeIds);
    }
  }

  return { nodes, edges, entryNodeIds, exitNodeIds };
}

/**
 * Analyze a transitive function call to find step calls within helper functions
 */
function analyzeTransitiveCall(
  funcName: string,
  stepDeclarations: Map<string, { stepId: string }>,
  context: AnalysisContext,
  functionMap: Map<string, FunctionInfo>,
  variableMap: Map<string, any>,
  visitedFunctions: Set<string>
): AnalysisResult {
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  const entryNodeIds: string[] = [];
  const exitNodeIds: string[] = [];

  if (visitedFunctions.has(funcName)) {
    return { nodes, edges, entryNodeIds, exitNodeIds };
  }

  const funcInfo = functionMap.get(funcName);
  if (!funcInfo || funcInfo.isStep) {
    return { nodes, edges, entryNodeIds, exitNodeIds };
  }

  visitedFunctions.add(funcName);

  try {
    if (funcInfo.body) {
      if (funcInfo.body.type === 'BlockStatement') {
        const bodyResult = analyzeBlock(
          funcInfo.body.stmts,
          stepDeclarations,
          context,
          functionMap,
          variableMap
        );
        nodes.push(...bodyResult.nodes);
        edges.push(...bodyResult.edges);
        entryNodeIds.push(...bodyResult.entryNodeIds);
        exitNodeIds.push(...bodyResult.exitNodeIds);
      } else {
        const exprResult = analyzeExpression(
          funcInfo.body,
          stepDeclarations,
          context,
          functionMap,
          variableMap,
          visitedFunctions
        );
        nodes.push(...exprResult.nodes);
        edges.push(...exprResult.edges);
        entryNodeIds.push(...exprResult.entryNodeIds);
        exitNodeIds.push(...exprResult.exitNodeIds);
      }
    }
  } finally {
    visitedFunctions.delete(funcName);
  }

  return { nodes, edges, entryNodeIds, exitNodeIds };
}
