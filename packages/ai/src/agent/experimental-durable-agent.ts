/**
 * Experimental DurableAgent implementation using AI SDK's streamText with middleware.
 *
 * This approach:
 * 1. Uses AI SDK's streamText for each LLM call (gets features like chunk conversion for free)
 * 2. Uses middleware to make each LLM call a durable step
 * 3. Handles tool loop at workflow level (so tools can use sleep, hooks, etc.)
 * 4. Passes tools WITHOUT execute functions so streamText doesn't auto-execute
 */
import type {
  LanguageModelV2,
  LanguageModelV2Middleware,
  LanguageModelV2Prompt,
  SharedV2ProviderOptions,
} from '@ai-sdk/provider';
import {
  type Experimental_DownloadFunction as DownloadFunction,
  type GenerateTextOnStepFinishCallback,
  gateway,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  type StepResult,
  type StopCondition,
  type StreamTextOnChunkCallback,
  type StreamTextOnErrorCallback,
  type StreamTextOnStepFinishCallback,
  type StreamTextTransform,
  stepCountIs,
  streamText,
  type TelemetrySettings,
  type ToolCallRepairFunction,
  type ToolChoice,
  type ToolSet,
  type UIMessageChunk,
  wrapLanguageModel,
} from 'ai';

/**
 * Middleware that makes each LLM call a durable workflow step.
 */
function createDurableMiddleware(): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
    wrapStream: async ({ doStream }) => {
      'use step';
      return doStream();
    },
    wrapGenerate: async ({ doGenerate }) => {
      'use step';
      return doGenerate();
    },
  };
}

/**
 * Wraps a model with durability middleware.
 */
function makeDurable(model: LanguageModel): LanguageModel {
  return wrapLanguageModel({
    model: model as LanguageModelV2,
    middleware: createDurableMiddleware(),
  }) as LanguageModel;
}

/**
 * Strip execute functions from tools so streamText doesn't auto-execute them.
 * We'll execute them ourselves at the workflow level.
 */
function stripExecute(tools: ToolSet): ToolSet {
  const stripped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    stripped[name] = {
      description: tool.description,
      inputSchema: tool.inputSchema,
      // No execute function - streamText won't auto-execute
    };
  }
  return stripped;
}

/**
 * Execute a tool as a durable workflow step.
 * This ensures tool execution is retried on failure.
 */
async function executeToolDurably(
  toolName: string,
  toolCallId: string,
  input: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: ToolSet[string],
  messages: ModelMessage[]
): Promise<unknown> {
  'use step';

  if (!tool?.execute) {
    throw new Error(`Tool "${toolName}" has no execute function`);
  }

  return tool.execute(input, {
    toolCallId,
    messages,
  });
}

/**
 * Information passed to the prepareStep callback.
 */
export interface PrepareStepInfo<TTools extends ToolSet = ToolSet> {
  model: string | LanguageModel | (() => Promise<LanguageModelV2>);
  stepNumber: number;
  steps: StepResult<TTools>[];
  messages: LanguageModelV2Prompt;
}

/**
 * Return type from the prepareStep callback.
 */
export interface PrepareStepResult {
  model?: string | LanguageModel | (() => Promise<LanguageModelV2>);
  messages?: LanguageModelV2Prompt;
}

/**
 * Callback function called before each step in the agent loop.
 */
export type PrepareStepCallback<TTools extends ToolSet = ToolSet> = (
  info: PrepareStepInfo<TTools>
) => PrepareStepResult | Promise<PrepareStepResult>;

/**
 * Generation settings that control LLM behavior.
 * These are passed through to the AI SDK.
 */
export interface GenerationSettings {
  /**
   * Maximum number of tokens to generate.
   */
  maxOutputTokens?: number;

  /**
   * Temperature setting. The range depends on the provider and model.
   * It is recommended to set either temperature or topP, but not both.
   */
  temperature?: number;

  /**
   * Nucleus sampling. A number between 0 and 1.
   * E.g. 0.1 means only tokens with the top 10% probability mass are considered.
   */
  topP?: number;

  /**
   * Only sample from the top K options for each subsequent token.
   * Used to remove "long tail" low probability responses.
   */
  topK?: number;

  /**
   * Presence penalty setting. Affects the likelihood of repeating information
   * already in the prompt. Range: -1 (increase repetition) to 1 (max penalty).
   */
  presencePenalty?: number;

  /**
   * Frequency penalty setting. Affects the likelihood of repeatedly using
   * the same words or phrases. Range: -1 (increase repetition) to 1 (max penalty).
   */
  frequencyPenalty?: number;

  /**
   * Stop sequences. If set, the model will stop generating text when one
   * of the stop sequences is generated.
   */
  stopSequences?: string[];

  /**
   * The seed (integer) to use for random sampling. If set and supported
   * by the model, calls will generate deterministic results.
   */
  seed?: number;
}

/**
 * Reliability settings for handling failures and cancellation.
 */
export interface ReliabilitySettings {
  /**
   * Maximum number of retries per LLM call. Set to 0 to disable retries.
   * @default 2
   */
  maxRetries?: number;

  /**
   * An optional abort signal that can be used to cancel the call.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;
}

/**
 * Advanced/experimental settings.
 */
export interface AdvancedSettings<TTools extends ToolSet = ToolSet> {
  /**
   * Limits the tools available for the model to call without changing
   * the tool call and result types in the result.
   */
  activeTools?: Array<keyof TTools>;

  /**
   * Optional telemetry configuration.
   */
  experimental_telemetry?: TelemetrySettings;

  /**
   * A function that attempts to repair a tool call that failed to parse.
   */
  experimental_repairToolCall?: ToolCallRepairFunction<TTools>;

  /**
   * Context that is passed into tool execution.
   */
  experimental_context?: unknown;

  /**
   * Custom download function to use for URLs.
   * By default, files are downloaded if the model does not support the URL
   * for the given media type.
   */
  experimental_download?: DownloadFunction;
}

export interface ExperimentalDurableAgentOptions {
  /**
   * The model provider to use for the agent.
   * Can be a string (AI Gateway), a LanguageModel instance, or a step function.
   */
  model: string | LanguageModel | (() => Promise<LanguageModelV2>);

  /**
   * A set of tools available to the agent.
   */
  tools?: ToolSet;

  /**
   * Optional system prompt to guide the agent's behavior.
   */
  system?: string;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV2ProviderOptions;
}

export interface ExperimentalDurableAgentGenerateOptions<
  TTools extends ToolSet = ToolSet,
> extends GenerationSettings,
    ReliabilitySettings,
    AdvancedSettings<TTools> {
  /**
   * A simple text prompt. You can either use `prompt` or `messages` but not both.
   */
  prompt?: string;

  /**
   * The conversation messages to process. You can either use `prompt` or `messages` but not both.
   */
  messages?: ModelMessage[];

  /**
   * Optional system prompt override.
   */
  system?: string;

  /**
   * The tool choice strategy.
   */
  toolChoice?: ToolChoice<TTools>;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV2ProviderOptions;

  /**
   * Condition for stopping the generation when there are tool results.
   */
  stopWhen?: StopCondition<TTools> | StopCondition<TTools>[];

  /**
   * Callback function to be called after each step completes.
   */
  onStepFinish?: GenerateTextOnStepFinishCallback<TTools>;

  /**
   * Callback function called before each step in the agent loop.
   */
  prepareStep?: PrepareStepCallback<TTools>;

  /**
   * Optional specification for parsing structured outputs from the LLM response.
   * Use Output.text() or Output.object({ schema }) to create.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental_output?:
    | ReturnType<typeof Output.text>
    | ReturnType<typeof Output.object<any>>;
}

/**
 * Callback called when all steps are finished.
 */
export type DurableAgentOnFinishCallback<TTools extends ToolSet> = (event: {
  steps: StepResult<TTools>[];
  totalUsage: LanguageModelUsage;
  finishReason: StepResult<TTools>['finishReason'];
  text: string;
}) => void | Promise<void>;

export interface ExperimentalDurableAgentStreamOptions<
  TTools extends ToolSet = ToolSet,
> extends GenerationSettings,
    ReliabilitySettings,
    AdvancedSettings<TTools> {
  /**
   * A simple text prompt. You can either use `prompt` or `messages` but not both.
   */
  prompt?: string;

  /**
   * The conversation messages to process. You can either use `prompt` or `messages` but not both.
   */
  messages?: ModelMessage[];

  /**
   * Optional system prompt override.
   */
  system?: string;

  /**
   * The stream to which the agent writes message chunks.
   */
  writable: WritableStream<UIMessageChunk>;

  /**
   * If true, prevents the writable stream from being closed after streaming completes.
   * Defaults to false.
   */
  preventClose?: boolean;

  /**
   * If true, sends a 'start' chunk at the beginning of the stream.
   * Defaults to true.
   */
  sendStart?: boolean;

  /**
   * If true, sends a 'finish' chunk at the end of the stream.
   * Defaults to true.
   */
  sendFinish?: boolean;

  /**
   * The tool choice strategy.
   */
  toolChoice?: ToolChoice<TTools>;

  /**
   * Additional provider-specific options.
   */
  providerOptions?: SharedV2ProviderOptions;

  /**
   * Condition for stopping the generation when there are tool results.
   */
  stopWhen?: StopCondition<TTools> | StopCondition<TTools>[];

  /**
   * Callback function to be called after each step completes.
   */
  onStepFinish?: StreamTextOnStepFinishCallback<TTools>;

  /**
   * Callback function called before each step in the agent loop.
   */
  prepareStep?: PrepareStepCallback<TTools>;

  /**
   * Optional specification for parsing structured outputs from the LLM response.
   * Use Output.text() or Output.object({ schema }) to create.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  experimental_output?:
    | ReturnType<typeof Output.text>
    | ReturnType<typeof Output.object<any>>;

  /**
   * Optional stream transformations. Applied in the order they are provided.
   */
  experimental_transform?:
    | StreamTextTransform<TTools>
    | Array<StreamTextTransform<TTools>>;

  /**
   * Whether to include raw chunks from the provider in the stream.
   * Defaults to false.
   */
  includeRawChunks?: boolean;

  /**
   * Callback that is called for each chunk of the stream.
   */
  onChunk?: StreamTextOnChunkCallback<TTools>;

  /**
   * Callback invoked when an error occurs during streaming.
   */
  onError?: StreamTextOnErrorCallback;

  /**
   * Callback called when the LLM response and all tool executions are finished.
   */
  onFinish?: DurableAgentOnFinishCallback<TTools>;

  /**
   * Callback called when the stream is aborted.
   */
  onAbort?: () => void | Promise<void>;
}

/**
 * Experimental DurableAgent that uses AI SDK's streamText with durability middleware.
 * Drop-in replacement for DurableAgent with the same API.
 */
export class ExperimentalDurableAgent {
  private modelInit: string | LanguageModel | (() => Promise<LanguageModelV2>);
  private tools: ToolSet;
  private strippedTools: ToolSet;
  private system?: string;
  private providerOptions?: SharedV2ProviderOptions;

  constructor(options: ExperimentalDurableAgentOptions) {
    this.modelInit = options.model;
    this.tools = options.tools ?? {};
    this.strippedTools = stripExecute(this.tools);
    this.system = options.system;
    this.providerOptions = options.providerOptions;
  }

  /**
   * Resolves the model and wraps it with durability middleware.
   */
  private async resolveModel(
    modelInit: string | LanguageModel | (() => Promise<LanguageModelV2>)
  ): Promise<LanguageModel> {
    let baseModel: LanguageModel;

    if (typeof modelInit === 'string') {
      baseModel = gateway(modelInit);
    } else if (typeof modelInit === 'function') {
      baseModel = (await modelInit()) as LanguageModel;
    } else {
      baseModel = modelInit;
    }

    return makeDurable(baseModel);
  }

  /**
   * Generate text without streaming. Runs the tool loop until completion.
   */
  async generate<TTools extends ToolSet = ToolSet>(
    options: ExperimentalDurableAgentGenerateOptions<TTools>
  ) {
    // Initialize messages from prompt or messages option
    let messages: ModelMessage[] = options.messages
      ? [...options.messages]
      : options.prompt
        ? [{ role: 'user' as const, content: options.prompt }]
        : [];

    let currentModelInit = this.modelInit;
    let stepNumber = 0;
    const allSteps: StepResult<TTools>[] = [];

    // Tool loop at workflow level
    while (true) {
      // Check abort signal
      if (options.abortSignal?.aborted) {
        break;
      }

      // Call prepareStep callback before each step if provided
      if (options.prepareStep) {
        const prepareResult = await options.prepareStep({
          model: currentModelInit,
          stepNumber,
          steps: allSteps,
          messages: messages as LanguageModelV2Prompt,
        });

        if (prepareResult.model !== undefined) {
          currentModelInit = prepareResult.model;
        }
        if (prepareResult.messages !== undefined) {
          messages = prepareResult.messages as ModelMessage[];
        }
      }

      // Resolve model (handles string, LanguageModel, or step function)
      const model = await this.resolveModel(currentModelInit);

      // Single LLM call using generateText (durability via middleware)
      const result = await generateText({
        model,
        messages,
        system: options.system || this.system,
        tools: this.strippedTools as TTools,
        toolChoice: options.toolChoice,
        providerOptions: options.providerOptions ?? this.providerOptions,
        stopWhen: stepCountIs(1), // Single step only
        // Generation settings
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
        stopSequences: options.stopSequences,
        seed: options.seed,
        // Reliability settings
        maxRetries: options.maxRetries,
        abortSignal: options.abortSignal,
        headers: options.headers,
        // Advanced settings
        activeTools: options.activeTools as Array<keyof TTools> | undefined,
        experimental_telemetry: options.experimental_telemetry,
        experimental_repairToolCall: options.experimental_repairToolCall,
        experimental_download: options.experimental_download,
        experimental_context: options.experimental_context,
        experimental_output: options.experimental_output,
      });

      // Get the step result
      const stepResults = result.steps;
      const lastStep = stepResults[stepResults.length - 1];

      if (!lastStep) break;

      allSteps.push(lastStep as StepResult<TTools>);
      stepNumber++;

      // Call onStepFinish callback
      if (options.onStepFinish) {
        await options.onStepFinish(lastStep as StepResult<TTools>);
      }

      // Check finish reason
      if (lastStep.finishReason === 'stop') {
        // Done - add assistant message and break
        messages = [...messages, ...lastStep.response.messages];
        break;
      }

      if (lastStep.finishReason === 'tool-calls') {
        // Execute tools at workflow level (can use sleep, hooks, etc.)
        messages = [...messages, ...lastStep.response.messages];

        for (const toolCall of lastStep.toolCalls) {
          const tool = this.tools[toolCall.toolName];

          // Execute tool durably - wrapped in 'use step' for automatic retry
          const toolResult = await executeToolDurably(
            toolCall.toolName,
            toolCall.toolCallId,
            toolCall.input,
            tool,
            messages
          );

          // Add tool result to messages
          messages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: {
                  type: 'text',
                  value: JSON.stringify(toolResult),
                },
              },
            ],
          });
        }

        // Check stop conditions
        if (options.stopWhen) {
          const conditions = Array.isArray(options.stopWhen)
            ? options.stopWhen
            : [options.stopWhen];
          if (conditions.some((cond) => cond({ steps: allSteps }))) {
            break;
          }
        }
      } else {
        // Unknown finish reason
        break;
      }
    }

    return {
      messages,
      steps: allSteps,
      text: allSteps[allSteps.length - 1]?.text ?? '',
    };
  }

  /**
   * Stream text generation with the tool loop. Writes chunks to the provided writable stream.
   */
  async stream<TTools extends ToolSet = ToolSet>(
    options: ExperimentalDurableAgentStreamOptions<TTools>
  ) {
    // Initialize messages from prompt or messages option
    let messages: ModelMessage[] = options.messages
      ? [...options.messages]
      : options.prompt
        ? [{ role: 'user' as const, content: options.prompt }]
        : [];
    const writable = options.writable;
    const sendStart = options.sendStart ?? true;
    const sendFinish = options.sendFinish ?? true;
    const preventClose = options.preventClose ?? false;

    let currentModelInit = this.modelInit;
    let isFirstStep = true;
    let stepNumber = 0;
    const allSteps: StepResult<TTools>[] = [];

    // Tool loop at workflow level
    while (true) {
      // Check abort signal
      if (options.abortSignal?.aborted) {
        if (options.onAbort) {
          await options.onAbort();
        }
        break;
      }

      // Call prepareStep callback before each step if provided
      if (options.prepareStep) {
        const prepareResult = await options.prepareStep({
          model: currentModelInit,
          stepNumber,
          steps: allSteps,
          messages: messages as LanguageModelV2Prompt,
        });

        if (prepareResult.model !== undefined) {
          currentModelInit = prepareResult.model;
        }
        if (prepareResult.messages !== undefined) {
          messages = prepareResult.messages as ModelMessage[];
        }
      }

      // Resolve model (handles string, LanguageModel, or step function)
      const model = await this.resolveModel(currentModelInit);

      // Single LLM call using streamText (durability via middleware)
      const result = await streamText({
        model,
        messages,
        system: options.system || this.system,
        tools: this.strippedTools as TTools,
        toolChoice: options.toolChoice,
        providerOptions: options.providerOptions ?? this.providerOptions,
        stopWhen: stepCountIs(1), // Single step only
        // Generation settings
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
        stopSequences: options.stopSequences,
        seed: options.seed,
        // Reliability settings
        maxRetries: options.maxRetries,
        abortSignal: options.abortSignal,
        headers: options.headers,
        // Advanced settings
        activeTools: options.activeTools as Array<keyof TTools> | undefined,
        experimental_telemetry: options.experimental_telemetry,
        experimental_repairToolCall: options.experimental_repairToolCall,
        experimental_download: options.experimental_download,
        experimental_context: options.experimental_context,
        experimental_output: options.experimental_output,
        experimental_transform: options.experimental_transform,
        includeRawChunks: options.includeRawChunks,
        // Callbacks
        onChunk: options.onChunk,
        onError: options.onError,
      });

      // Pipe chunks to UI
      const uiStream = result.toUIMessageStream({
        sendStart: sendStart && isFirstStep,
        sendFinish: false,
      });

      const reader = uiStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const writer = writable.getWriter();
        await writer.write(value);
        writer.releaseLock();
      }
      isFirstStep = false;

      // Get the step result
      const stepResults = await result.steps;
      const lastStep = stepResults[stepResults.length - 1];

      if (!lastStep) break;

      allSteps.push(lastStep as StepResult<TTools>);
      stepNumber++;

      // Call onStepFinish callback
      if (options.onStepFinish) {
        await options.onStepFinish(lastStep as StepResult<TTools>);
      }

      // Check finish reason
      if (lastStep.finishReason === 'stop') {
        // Done - add assistant message and break
        messages = [...messages, ...lastStep.response.messages];
        break;
      }

      if (lastStep.finishReason === 'tool-calls') {
        // Execute tools at workflow level (can use sleep, hooks, etc.)
        messages = [...messages, ...lastStep.response.messages];

        for (const toolCall of lastStep.toolCalls) {
          const tool = this.tools[toolCall.toolName];

          // Execute tool durably - wrapped in 'use step' for automatic retry
          const toolResult = await executeToolDurably(
            toolCall.toolName,
            toolCall.toolCallId,
            toolCall.input,
            tool,
            messages
          );

          // Add tool result to messages
          messages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                output: {
                  type: 'text',
                  value: JSON.stringify(toolResult),
                },
              },
            ],
          });

          // Write tool result to UI
          const writer = writable.getWriter();
          await writer.write({
            type: 'tool-output-available',
            toolCallId: toolCall.toolCallId,
            output: JSON.stringify(toolResult),
          });
          writer.releaseLock();
        }

        // Check stop conditions
        if (options.stopWhen) {
          const conditions = Array.isArray(options.stopWhen)
            ? options.stopWhen
            : [options.stopWhen];
          if (conditions.some((cond) => cond({ steps: allSteps }))) {
            break;
          }
        }
      } else {
        // Unknown finish reason
        break;
      }
    }

    // Call onFinish callback
    if (options.onFinish) {
      const lastStep = allSteps[allSteps.length - 1];
      if (lastStep) {
        // Calculate total usage across all steps
        const totalUsage = allSteps.reduce<LanguageModelUsage>(
          (acc, step) => ({
            inputTokens:
              (acc.inputTokens ?? 0) + (step.usage?.inputTokens ?? 0),
            outputTokens:
              (acc.outputTokens ?? 0) + (step.usage?.outputTokens ?? 0),
            totalTokens:
              (acc.totalTokens ?? 0) + (step.usage?.totalTokens ?? 0),
          }),
          { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        );

        await options.onFinish({
          steps: allSteps,
          totalUsage,
          finishReason: lastStep.finishReason,
          text: lastStep.text,
        });
      }
    }

    // Write finish and close stream
    if (sendFinish || !preventClose) {
      const writer = writable.getWriter();
      try {
        if (sendFinish) {
          await writer.write({ type: 'finish' });
        }
      } finally {
        writer.releaseLock();
      }

      if (!preventClose) {
        await writable.close();
      }
    }

    return { messages };
  }
}
