import type { UIMessage, UIMessageChunk } from 'ai';

/**
 * Information about a part being accumulated
 */
interface PartAccumulator {
  type: string;
  id?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: string;
  output?: string;
  [key: string]: unknown;
}

/**
 * Accumulates UIMessageChunks into UIMessage[] as they are written to a stream.
 *
 * This allows server-side code to have access to the same UIMessage[] that the
 * client receives, without needing to convert from ModelMessage[].
 *
 * @example
 * ```typescript
 * const writable = getWritable<UIMessageChunk>();
 * const accumulator = new UIMessageAccumulator(writable);
 *
 * await agent.stream({
 *   messages,
 *   writable: accumulator.writable,
 * });
 *
 * // Get accumulated UIMessages
 * const uiMessages = accumulator.messages;
 * ```
 */
export class UIMessageAccumulator {
  private _messages: UIMessage[] = [];
  private currentMessage: UIMessage | null = null;
  private currentPart: PartAccumulator | null = null;
  private messageIdCounter = 0;
  private readonly _writable: WritableStream<UIMessageChunk>;
  private readonly innerWritable: WritableStream<UIMessageChunk>;

  constructor(innerWritable: WritableStream<UIMessageChunk>) {
    this.innerWritable = innerWritable;

    // Create a wrapper stream that intercepts chunks
    this._writable = new WritableStream<UIMessageChunk>({
      write: async (chunk) => {
        // Process the chunk to accumulate messages
        this.processChunk(chunk);

        // Forward to the inner writable
        const writer = this.innerWritable.getWriter();
        try {
          await writer.write(chunk);
        } finally {
          writer.releaseLock();
        }
      },
      close: async () => {
        // Finalize any pending message
        this.finalizeCurrentMessage();
        await this.innerWritable.close();
      },
      abort: async (reason) => {
        await this.innerWritable.abort(reason);
      },
    });
  }

  /**
   * The writable stream that should be passed to DurableAgent.stream()
   */
  get writable(): WritableStream<UIMessageChunk> {
    return this._writable;
  }

  /**
   * The accumulated UIMessages
   */
  get messages(): UIMessage[] {
    return this._messages;
  }

  private processChunk(chunk: UIMessageChunk): void {
    switch (chunk.type) {
      case 'start':
        // Start of a new response - initialize assistant message
        this.startNewMessage('assistant');
        break;

      case 'start-step':
        // Start of a new step within the current message
        if (!this.currentMessage) {
          this.startNewMessage('assistant');
        }
        break;

      case 'finish-step':
        // End of a step - finalize any pending part
        this.finalizeCurrentPart();
        break;

      case 'finish':
        // End of the response - finalize the message
        this.finalizeCurrentMessage();
        break;

      case 'text-start':
        this.finalizeCurrentPart();
        this.currentPart = {
          type: 'text',
          id: chunk.id,
          text: '',
        };
        break;

      case 'text-delta':
        if (this.currentPart?.type === 'text') {
          this.currentPart.text = (this.currentPart.text || '') + chunk.delta;
        }
        break;

      case 'text-end':
        this.finalizeCurrentPart();
        break;

      case 'reasoning-start':
        this.finalizeCurrentPart();
        this.currentPart = {
          type: 'reasoning',
          id: chunk.id,
          text: '',
        };
        break;

      case 'reasoning-delta':
        if (this.currentPart?.type === 'reasoning') {
          this.currentPart.text = (this.currentPart.text || '') + chunk.delta;
        }
        break;

      case 'reasoning-end':
        this.finalizeCurrentPart();
        break;

      case 'tool-input-start':
        this.finalizeCurrentPart();
        this.currentPart = {
          type: 'tool-invocation',
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: '',
          state: 'partial-call',
        };
        break;

      case 'tool-input-delta':
        if (this.currentPart?.type === 'tool-invocation') {
          this.currentPart.input = (this.currentPart.input || '') + chunk.delta;
        }
        break;

      case 'tool-input-end':
        if (this.currentPart?.type === 'tool-invocation') {
          this.currentPart.state = 'call';
          // Parse input JSON if possible
          try {
            this.currentPart.input = JSON.parse(
              this.currentPart.input as string
            );
          } catch {
            // Keep as string if parsing fails
          }
        }
        this.finalizeCurrentPart();
        break;

      case 'tool-output-available':
        // Find and update the corresponding tool invocation part
        if (this.currentMessage) {
          const toolPart = this.currentMessage.parts.find(
            (p) =>
              p.type === 'tool-invocation' && p.toolCallId === chunk.toolCallId
          );
          if (toolPart && toolPart.type === 'tool-invocation') {
            toolPart.state = 'output-available';
            toolPart.output = chunk.output;
          }
        }
        break;

      case 'file':
        this.finalizeCurrentPart();
        if (this.currentMessage) {
          this.currentMessage.parts.push({
            type: 'file',
            mediaType: chunk.mediaType,
            url: chunk.url,
          } as any);
        }
        break;

      case 'source-url':
        if (this.currentMessage) {
          this.currentMessage.parts.push({
            type: 'source',
            sourceType: 'url',
            id: chunk.sourceId,
            url: chunk.url,
            title: chunk.title,
          } as any);
        }
        break;

      case 'source-document':
        if (this.currentMessage) {
          this.currentMessage.parts.push({
            type: 'source',
            sourceType: 'document',
            id: chunk.sourceId,
            mediaType: chunk.mediaType,
            title: chunk.title,
            filename: chunk.filename,
          } as any);
        }
        break;
    }
  }

  private startNewMessage(role: 'user' | 'assistant'): void {
    // Finalize any existing message first
    this.finalizeCurrentMessage();

    this.currentMessage = {
      id: this.generateMessageId(),
      role,
      parts: [],
    };
  }

  private finalizeCurrentPart(): void {
    if (!this.currentPart || !this.currentMessage) return;

    const part = this.currentPart;

    if (part.type === 'text' && part.text) {
      this.currentMessage.parts.push({
        type: 'text',
        text: part.text,
      });
    } else if (part.type === 'reasoning' && part.text) {
      this.currentMessage.parts.push({
        type: 'reasoning',
        text: part.text,
      } as any);
    } else if (part.type === 'tool-invocation' && part.toolCallId) {
      this.currentMessage.parts.push({
        type: 'tool-invocation',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
        state: part.state || 'call',
      } as any);
    }

    this.currentPart = null;
  }

  private finalizeCurrentMessage(): void {
    this.finalizeCurrentPart();

    if (this.currentMessage && this.currentMessage.parts.length > 0) {
      this._messages.push(this.currentMessage);
    }

    this.currentMessage = null;
  }

  private generateMessageId(): string {
    return `msg-${++this.messageIdCounter}-${Date.now()}`;
  }
}

/**
 * Creates a UIMessageAccumulator that wraps the given writable stream.
 *
 * @example
 * ```typescript
 * const writable = getWritable<UIMessageChunk>();
 * const { accumulatorWritable, getMessages } = createUIMessageAccumulator(writable);
 *
 * await agent.stream({
 *   messages,
 *   writable: accumulatorWritable,
 * });
 *
 * const uiMessages = getMessages();
 * ```
 */
export function createUIMessageAccumulator(
  innerWritable: WritableStream<UIMessageChunk>
): {
  writable: WritableStream<UIMessageChunk>;
  getMessages: () => UIMessage[];
} {
  const accumulator = new UIMessageAccumulator(innerWritable);
  return {
    writable: accumulator.writable,
    getMessages: () => accumulator.messages,
  };
}
