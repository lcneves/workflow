import type { Span } from '@opentelemetry/api';
import { waitUntil } from '@vercel/functions';
import { WorkflowAPIError } from '@workflow/errors';
import type { CreateEventRequest, World } from '@workflow/world';
import type {
  HookInvocationQueueItem,
  StepInvocationQueueItem,
  WaitInvocationQueueItem,
  WorkflowSuspension,
} from '../global.js';
import type { Serializable } from '../schemas.js';
import { dehydrateStepArguments } from '../serialization.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { serializeTraceCarrier } from '../telemetry.js';
import { queueMessage } from './helpers.js';

export interface SuspensionHandlerParams {
  suspension: WorkflowSuspension;
  world: World;
  runId: string;
  workflowName: string;
  workflowStartedAt: number;
  span?: Span;
}

export interface SuspensionHandlerResult {
  timeoutSeconds?: number;
}

/**
 * Handles a workflow suspension by processing all pending operations (hooks, steps, waits).
 * Uses an event-sourced architecture where entities (steps, hooks) are created atomically
 * with their corresponding events via createBatch.
 *
 * Processing order:
 * 1. Hooks are processed first to prevent race conditions with webhook receivers
 * 2. Steps and waits are processed in parallel after hooks complete
 */
export async function handleSuspension({
  suspension,
  world,
  runId,
  workflowName,
  workflowStartedAt,
  span,
}: SuspensionHandlerParams): Promise<SuspensionHandlerResult> {
  // Separate queue items by type
  const stepItems = suspension.steps.filter(
    (item): item is StepInvocationQueueItem => item.type === 'step'
  );
  const hookItems = suspension.steps.filter(
    (item): item is HookInvocationQueueItem => item.type === 'hook'
  );
  const waitItems = suspension.steps.filter(
    (item): item is WaitInvocationQueueItem => item.type === 'wait'
  );

  // Build hook_created events (World will atomically create hook entities)
  const hookEvents: CreateEventRequest[] = hookItems.map((queueItem) => {
    const hookMetadata =
      typeof queueItem.metadata === 'undefined'
        ? undefined
        : dehydrateStepArguments(queueItem.metadata, suspension.globalThis);
    return {
      eventType: 'hook_created' as const,
      correlationId: queueItem.correlationId,
      eventData: {
        token: queueItem.token,
        metadata: hookMetadata,
      },
    };
  });

  // Process hooks first to prevent race conditions with webhook receivers
  // Hooks must be processed individually (not batched) to detect hook_conflict events
  // Track any hook conflicts that occur - these will be handled by re-enqueueing the workflow
  let hasHookConflict = false;

  if (hookEvents.length > 0) {
    await Promise.all(
      hookEvents.map(async (hookEvent) => {
        try {
          const result = await world.events.create(runId, hookEvent);
          // Check if the world returned a hook_conflict event instead of hook_created
          // The hook_conflict event is stored in the event log and will be replayed
          // on the next workflow invocation, causing the hook's promise to reject
          if (result.event.eventType === 'hook_conflict') {
            hasHookConflict = true;
          }
        } catch (err) {
          if (WorkflowAPIError.is(err)) {
            if (err.status === 410) {
              console.warn(
                `Workflow run "${runId}" has already completed, skipping hook: ${err.message}`
              );
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      })
    );
  }

  // Build step_created events only for steps that haven't been created yet
  // Steps with hasCreatedEvent=true already have their event in the log
  const stepsNeedingCreation = stepItems.filter(
    (queueItem) => !queueItem.hasCreatedEvent
  );
  const stepEvents: CreateEventRequest[] = stepsNeedingCreation.map(
    (queueItem) => {
      const dehydratedInput = dehydrateStepArguments(
        {
          args: queueItem.args,
          closureVars: queueItem.closureVars,
          thisVal: queueItem.thisVal,
        },
        suspension.globalThis
      );
      return {
        eventType: 'step_created' as const,
        correlationId: queueItem.correlationId,
        eventData: {
          stepName: queueItem.stepName,
          input: dehydratedInput as Serializable,
        },
      };
    }
  );

  // Build wait_created events (only for waits that haven't been created yet)
  const waitEvents: CreateEventRequest[] = waitItems
    .filter((queueItem) => !queueItem.hasCreatedEvent)
    .map((queueItem) => ({
      eventType: 'wait_created' as const,
      correlationId: queueItem.correlationId,
      eventData: {
        resumeAt: queueItem.resumeAt,
      },
    }));

  // Process steps and waits in parallel using batch creation
  await Promise.all([
    // Create step events (World creates step entities atomically)
    // Only for steps that don't already have a step_created event
    stepEvents.length > 0
      ? world.events.createBatch(runId, stepEvents).catch((err) => {
          if (WorkflowAPIError.is(err) && err.status === 409) {
            console.warn(
              `Some steps already exist, continuing: ${err.message}`
            );
          } else {
            throw err;
          }
        })
      : Promise.resolve(),
    // Create wait events
    waitEvents.length > 0
      ? world.events.createBatch(runId, waitEvents).catch((err) => {
          if (WorkflowAPIError.is(err) && err.status === 409) {
            console.warn(
              `Some waits already exist, continuing: ${err.message}`
            );
          } else {
            throw err;
          }
        })
      : Promise.resolve(),
  ]);

  // Queue step execution messages for ALL pending steps in parallel
  // (both newly created and those with existing step_created events)
  const queueOps = stepItems.map(async (queueItem) => {
    await queueMessage(
      world,
      `__wkf_step_${queueItem.stepName}`,
      {
        workflowName,
        workflowRunId: runId,
        workflowStartedAt,
        stepId: queueItem.correlationId,
        traceCarrier: await serializeTraceCarrier(),
        requestedAt: new Date(),
      },
      {
        idempotencyKey: queueItem.correlationId,
      }
    );
  });

  // Wait for all queue operations to complete
  waitUntil(
    Promise.all(queueOps).catch((opErr) => {
      const isAbortError =
        opErr?.name === 'AbortError' || opErr?.name === 'ResponseAborted';
      if (!isAbortError) throw opErr;
    })
  );
  await Promise.all(queueOps);

  // Calculate minimum timeout from waits
  const now = Date.now();
  const minTimeoutSeconds = waitItems.reduce<number | null>(
    (min, queueItem) => {
      const resumeAtMs = queueItem.resumeAt.getTime();
      const delayMs = Math.max(1000, resumeAtMs - now);
      const timeoutSeconds = Math.ceil(delayMs / 1000);
      if (min === null) return timeoutSeconds;
      return Math.min(min, timeoutSeconds);
    },
    null
  );

  span?.setAttributes({
    ...Attribute.WorkflowRunStatus('workflow_suspended'),
    ...Attribute.WorkflowStepsCreated(stepItems.length),
    ...Attribute.WorkflowHooksCreated(hookItems.length),
    ...Attribute.WorkflowWaitsCreated(waitItems.length),
  });

  // If any hook conflicts occurred, re-enqueue the workflow immediately
  // On the next iteration, the hook consumer will see the hook_conflict event
  // and reject the promise with a WorkflowRuntimeError
  // We do this after processing all other operations (steps, waits) to ensure
  // they are recorded in the event log before the re-execution
  if (hasHookConflict) {
    return { timeoutSeconds: 1 };
  }

  if (minTimeoutSeconds !== null) {
    return { timeoutSeconds: minTimeoutSeconds };
  }

  return {};
}
