import { WorkflowAPIError } from '@workflow/errors';
import type { World } from '@workflow/world';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryWorld, withRetry } from './retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should succeed on first try when no error', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 500 Internal Server Error', async () => {
    const error = new WorkflowAPIError('Server error', { status: 500 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should retry on 502 Bad Gateway', async () => {
    const error = new WorkflowAPIError('Bad gateway', { status: 502 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 503 Service Unavailable', async () => {
    const error = new WorkflowAPIError('Service unavailable', { status: 503 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 504 Gateway Timeout', async () => {
    const error = new WorkflowAPIError('Gateway timeout', { status: 504 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 408 Request Timeout', async () => {
    const error = new WorkflowAPIError('Request timeout', { status: 408 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on 429 Too Many Requests', async () => {
    const error = new WorkflowAPIError('Too many requests', { status: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on 400 Bad Request', async () => {
    vi.useRealTimers();
    const error = new WorkflowAPIError('Bad request', { status: 400 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 3, minTimeout: 10 })).rejects.toThrow(
      'Bad request'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 401 Unauthorized', async () => {
    vi.useRealTimers();
    const error = new WorkflowAPIError('Unauthorized', { status: 401 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 3, minTimeout: 10 })).rejects.toThrow(
      'Unauthorized'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 404 Not Found', async () => {
    vi.useRealTimers();
    const error = new WorkflowAPIError('Not found', { status: 404 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 3, minTimeout: 10 })).rejects.toThrow(
      'Not found'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 409 Conflict', async () => {
    vi.useRealTimers();
    const error = new WorkflowAPIError('Conflict', { status: 409 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 3, minTimeout: 10 })).rejects.toThrow(
      'Conflict'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on ECONNRESET network error', async () => {
    const error = Object.assign(new Error('Connection reset'), {
      code: 'ECONNRESET',
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ETIMEDOUT network error', async () => {
    const error = Object.assign(new Error('Connection timed out'), {
      code: 'ETIMEDOUT',
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on ECONNREFUSED network error', async () => {
    const error = Object.assign(new Error('Connection refused'), {
      code: 'ECONNREFUSED',
    });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on fetch failed TypeError', async () => {
    const error = new TypeError('fetch failed');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry on AbortError', async () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    const fn = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const promise = withRetry(fn, { retries: 3, minTimeout: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting all retries', async () => {
    vi.useRealTimers();
    const error = new WorkflowAPIError('Server error', { status: 500 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 3, minTimeout: 10 })).rejects.toThrow(
      'Server error'
    );
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });
});

describe('RetryWorld', () => {
  let mockWorld: World;
  let retryWorld: RetryWorld;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create a mock World with all required methods
    mockWorld = {
      getDeploymentId: vi.fn(),
      queue: vi.fn(),
      createQueueHandler: vi.fn(),
      writeToStream: vi.fn(),
      closeStream: vi.fn(),
      readFromStream: vi.fn(),
      listStreamsByRunId: vi.fn(),
      runs: {
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        list: vi.fn(),
        cancel: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
      },
      steps: {
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        list: vi.fn(),
      },
      events: {
        create: vi.fn(),
        list: vi.fn(),
        listByCorrelationId: vi.fn(),
      },
      hooks: {
        create: vi.fn(),
        get: vi.fn(),
        getByToken: vi.fn(),
        list: vi.fn(),
        dispose: vi.fn(),
      },
    };

    retryWorld = new RetryWorld(mockWorld);
  });

  describe('idempotent operations (with retry)', () => {
    it('should retry getDeploymentId on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.getDeploymentId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue('deployment-123');

      const promise = retryWorld.getDeploymentId();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('deployment-123');
      expect(mockWorld.getDeploymentId).toHaveBeenCalledTimes(2);
    });

    it('should retry readFromStream on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockStream = new ReadableStream();
      (mockWorld.readFromStream as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockStream);

      const promise = retryWorld.readFromStream('stream-name');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe(mockStream);
      expect(mockWorld.readFromStream).toHaveBeenCalledTimes(2);
    });

    it('should retry listStreamsByRunId on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.listStreamsByRunId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(['stream-1', 'stream-2']);

      const promise = retryWorld.listStreamsByRunId('run-123');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(['stream-1', 'stream-2']);
      expect(mockWorld.listStreamsByRunId).toHaveBeenCalledTimes(2);
    });

    it('should retry runs.get on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockRun = { runId: 'run-123', status: 'running' };
      (mockWorld.runs.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockRun);

      const promise = retryWorld.runs.get('run-123');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockRun);
      expect(mockWorld.runs.get).toHaveBeenCalledTimes(2);
    });

    it('should retry runs.list on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockResponse = { data: [], hasMore: false, cursor: null };
      (mockWorld.runs.list as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockResponse);

      const promise = retryWorld.runs.list();
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockWorld.runs.list).toHaveBeenCalledTimes(2);
    });

    it('should retry steps.get on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockStep = { stepId: 'step-123', status: 'completed' };
      (mockWorld.steps.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockStep);

      const promise = retryWorld.steps.get('run-123', 'step-123');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockStep);
      expect(mockWorld.steps.get).toHaveBeenCalledTimes(2);
    });

    it('should retry steps.list on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockResponse = { data: [], hasMore: false, cursor: null };
      (mockWorld.steps.list as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockResponse);

      const promise = retryWorld.steps.list({ runId: 'run-123' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockWorld.steps.list).toHaveBeenCalledTimes(2);
    });

    it('should retry events.list on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockResponse = { data: [], hasMore: false, cursor: null };
      (mockWorld.events.list as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockResponse);

      const promise = retryWorld.events.list({ runId: 'run-123' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockWorld.events.list).toHaveBeenCalledTimes(2);
    });

    it('should retry events.listByCorrelationId on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockResponse = { data: [], hasMore: false, cursor: null };
      (mockWorld.events.listByCorrelationId as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockResponse);

      const promise = retryWorld.events.listByCorrelationId({
        correlationId: 'corr-123',
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockWorld.events.listByCorrelationId).toHaveBeenCalledTimes(2);
    });

    it('should retry hooks.get on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockHook = { hookId: 'hook-123', token: 'token-123' };
      (mockWorld.hooks.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockHook);

      const promise = retryWorld.hooks.get('hook-123');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockHook);
      expect(mockWorld.hooks.get).toHaveBeenCalledTimes(2);
    });

    it('should retry hooks.getByToken on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockHook = { hookId: 'hook-123', token: 'token-123' };
      (mockWorld.hooks.getByToken as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockHook);

      const promise = retryWorld.hooks.getByToken('token-123');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockHook);
      expect(mockWorld.hooks.getByToken).toHaveBeenCalledTimes(2);
    });

    it('should retry hooks.list on transient error', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      const mockResponse = { data: [], hasMore: false, cursor: null };
      (mockWorld.hooks.list as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(error)
        .mockResolvedValue(mockResponse);

      const promise = retryWorld.hooks.list({ runId: 'run-123' });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(mockResponse);
      expect(mockWorld.hooks.list).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-idempotent operations (no retry)', () => {
    it('should NOT retry queue', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.queue as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(
        retryWorld.queue('__wkf_workflow_test' as any, { runId: 'run-123' })
      ).rejects.toThrow('Server error');
      expect(mockWorld.queue).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry writeToStream', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.writeToStream as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.writeToStream('stream-name', 'run-123', 'chunk')
      ).rejects.toThrow('Server error');
      expect(mockWorld.writeToStream).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry closeStream', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.closeStream as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.closeStream('stream-name', 'run-123')
      ).rejects.toThrow('Server error');
      expect(mockWorld.closeStream).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry runs.create', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.runs.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.runs.create({
          workflowName: 'test',
          deploymentId: 'deploy-123',
          input: [],
        })
      ).rejects.toThrow('Server error');
      expect(mockWorld.runs.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry runs.update', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.runs.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.runs.update('run-123', { status: 'completed' })
      ).rejects.toThrow('Server error');
      expect(mockWorld.runs.update).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry runs.cancel', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.runs.cancel as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(retryWorld.runs.cancel('run-123')).rejects.toThrow(
        'Server error'
      );
      expect(mockWorld.runs.cancel).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry runs.pause', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.runs.pause as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(retryWorld.runs.pause('run-123')).rejects.toThrow(
        'Server error'
      );
      expect(mockWorld.runs.pause).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry runs.resume', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.runs.resume as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(retryWorld.runs.resume('run-123')).rejects.toThrow(
        'Server error'
      );
      expect(mockWorld.runs.resume).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry steps.create', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.steps.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.steps.create('run-123', {
          stepId: 'step-123',
          stepName: 'test-step',
          input: {},
        })
      ).rejects.toThrow('Server error');
      expect(mockWorld.steps.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry steps.update', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.steps.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.steps.update('run-123', 'step-123', { status: 'completed' })
      ).rejects.toThrow('Server error');
      expect(mockWorld.steps.update).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry events.create', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.events.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.events.create('run-123', {
          eventType: 'step_completed',
          correlationId: 'step-123',
          eventData: { result: null },
        })
      ).rejects.toThrow('Server error');
      expect(mockWorld.events.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry hooks.create', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.hooks.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(
        retryWorld.hooks.create('run-123', {
          hookId: 'hook-123',
          token: 'token-123',
        })
      ).rejects.toThrow('Server error');
      expect(mockWorld.hooks.create).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry hooks.dispose', async () => {
      const error = new WorkflowAPIError('Server error', { status: 500 });
      (mockWorld.hooks.dispose as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      await expect(retryWorld.hooks.dispose('hook-123')).rejects.toThrow(
        'Server error'
      );
      expect(mockWorld.hooks.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('pass-through methods', () => {
    it('should delegate createQueueHandler without retry', () => {
      const mockHandler = vi.fn();
      const mockReturnValue = vi.fn();
      (
        mockWorld.createQueueHandler as ReturnType<typeof vi.fn>
      ).mockReturnValue(mockReturnValue);

      const result = retryWorld.createQueueHandler(
        '__wkf_workflow_',
        mockHandler
      );

      expect(result).toBe(mockReturnValue);
      expect(mockWorld.createQueueHandler).toHaveBeenCalledWith(
        '__wkf_workflow_',
        mockHandler
      );
    });

    it('should call start on underlying world if it exists', async () => {
      const mockStart = vi.fn().mockResolvedValue(undefined);
      mockWorld.start = mockStart;

      await retryWorld.start();

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('should not throw if underlying world has no start method', async () => {
      delete mockWorld.start;

      await expect(retryWorld.start()).resolves.toBeUndefined();
    });
  });

  describe('argument passing', () => {
    it('should pass arguments correctly to runs.get', async () => {
      const mockRun = { runId: 'run-123', status: 'running' };
      (mockWorld.runs.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockRun
      );

      const promise = retryWorld.runs.get('run-123', { resolveData: 'all' });
      await vi.runAllTimersAsync();
      await promise;

      expect(mockWorld.runs.get).toHaveBeenCalledWith('run-123', {
        resolveData: 'all',
      });
    });

    it('should pass arguments correctly to steps.get', async () => {
      const mockStep = { stepId: 'step-123', status: 'completed' };
      (mockWorld.steps.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockStep
      );

      const promise = retryWorld.steps.get('run-123', 'step-123', {
        resolveData: 'all',
      });
      await vi.runAllTimersAsync();
      await promise;

      expect(mockWorld.steps.get).toHaveBeenCalledWith('run-123', 'step-123', {
        resolveData: 'all',
      });
    });

    it('should pass arguments correctly to readFromStream', async () => {
      const mockStream = new ReadableStream();
      (mockWorld.readFromStream as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockStream
      );

      const promise = retryWorld.readFromStream('stream-name', 5);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockWorld.readFromStream).toHaveBeenCalledWith('stream-name', 5);
    });
  });
});
