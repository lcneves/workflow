import { ansifyStep } from './parse-name.js';
import { Ansi } from '@workflow/errors';
import { getWorkflowMetadata } from './workflow/get-workflow-metadata.js';

export class NotInWorkflowContextError extends Error {
  name = 'NotInWorkflowContextError';
  constructor(
    readonly functionName: string,
    docLink: `${string}: https://${string}`
  ) {
    super(
      Ansi.frame(
        `${Ansi.code(functionName)} can only be called inside a workflow function`,
        [Ansi.note(`Read more about ${docLink}`)]
      )
    );
  }
}

export class NotInStepContextError extends Error {
  name = 'NotInStepContextError';
  constructor(
    readonly functionName: string,
    docLink: `${string}: https://${string}`
  ) {
    super(
      Ansi.frame(
        `${Ansi.code(functionName)} can only be called inside a step function`,
        [Ansi.note(`Read more about ${docLink}`)]
      )
    );
  }
}

export class UnavailableInWorkflowContextError extends Error {
  name = 'UnavailableInWorkflowContextError';
  constructor(
    readonly functionName: string,
    docLink: `${string}: https://${string}`
  ) {
    const { workflowName } = getWorkflowMetadata();
    const message = Ansi.frame(
      `${Ansi.code(functionName)} cannot be called from a workflow context.`,
      [
        'calling this in a workflow context can cause determinism issues.',
        Ansi.note([
          `this call was made from the ${ansifyStep(workflowName)} workflow context.`,
          `Read more about ${docLink}`,
        ]),
      ]
    );
    super(message);
  }
}
