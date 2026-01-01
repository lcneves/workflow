import { Ansi } from '@workflow/errors';

/**
 * The options for {@link getWritable}.
 */
export interface WorkflowWritableStreamOptions {
  /**
   * An optional namespace to distinguish between multiple streams associated
   * with the same workflow run.
   */
  namespace?: string;
}

/**
 * Retrieves a writable stream that is associated with the current workflow.
 *
 * The writable stream can be used in both workflow and step functions.
 * In workflows, it can be passed as an argument to steps. In steps, it can
 * be called directly. Chunks written to this stream can be read outside the
 * workflow by using the readable method of getRun.
 *
 * @note This function can only be called inside a workflow or step function.
 * @returns The writable stream.
 */
export function getWritable<W = any>(
  // @ts-expect-error `options` is here for types/docs
  options: WorkflowWritableStreamOptions = {}
): WritableStream<W> {
  throw new Error(
    Ansi.frame(
      '`getWritable()` can only be called inside a workflow or step function',
      [
        Ansi.help([
          'This function comes from Workflow DevKit, and requires to be used as a part of a workflow or a step,',
          'As it has no meaning outside of the workflow context.',
          'Read more about the writable workflow stream: https://useworkflow.dev/docs/api-reference/workflow/get-writable',
        ]),
      ]
    )
  );
}
