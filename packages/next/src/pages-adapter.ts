import type { IncomingMessage } from 'node:http';

/**
 * Next.js Pages Router request type.
 * Uses Node.js IncomingMessage with additional Next.js properties.
 */
interface NextApiRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Next.js Pages Router response type.
 * We define only the methods we use rather than extending ServerResponse
 * to avoid type conflicts with the base class's method signatures.
 */
interface NextApiResponse {
  statusCode: number;
  status(statusCode: number): NextApiResponse;
  send(body: unknown): void;
  json(body: unknown): void;
  setHeader(name: string, value: string | number | readonly string[]): void;
  write(chunk: unknown): boolean;
  end(body?: unknown): void;
}

/**
 * Converts a Pages Router NextApiRequest to a Web API Request.
 * This allows the workflow runtime (which uses Web APIs) to handle
 * requests from Pages Router endpoints.
 */
export async function convertPagesRequest(
  req: NextApiRequest
): Promise<Request> {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host || 'localhost:3000';
  const url = new URL(req.url || '/', `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }
  }

  const init: RequestInit = {
    method: req.method || 'GET',
    headers,
  };

  // Only include body for methods that support it
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')) {
    // Handle body - it may already be parsed by Next.js body parser
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        init.body = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        init.body = req.body;
      } else {
        // Object body - serialize to JSON
        init.body = JSON.stringify(req.body);
        // Ensure content-type is set for JSON
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      }
    }
  }

  return new Request(url.toString(), init);
}

/**
 * Sends a Web API Response through a Pages Router NextApiResponse.
 * Handles streaming responses by reading the body incrementally.
 */
export async function sendPagesResponse(
  res: NextApiResponse,
  webResponse: Response
): Promise<void> {
  // Set status code
  res.statusCode = webResponse.status;

  // Copy headers from Web Response to Node.js response
  webResponse.headers.forEach((value, key) => {
    // Skip headers that Node.js/Next.js handles automatically
    // or that could cause issues with the response
    const lowerKey = key.toLowerCase();
    if (
      lowerKey !== 'content-encoding' &&
      lowerKey !== 'transfer-encoding' &&
      lowerKey !== 'connection'
    ) {
      res.setHeader(key, value);
    }
  });

  // Send body
  if (webResponse.body) {
    const reader = webResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } else {
    res.end();
  }
}
