import type { GatewayEnvelope } from './types.js';

export const GATEWAY_URL = 'https://interface.cournot.ai/play/polymarket/ai_data';
export const MAX_RETRIES = 3;
export const TIMEOUT_MS = 300_000; // 300 seconds

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function redactCode(text: string, code: string): string {
  if (!code) return text;
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'g'), '[REDACTED]');
}

export function buildEnvelope(
  code: string,
  path: string,
  method: string,
  payload: unknown,
): GatewayEnvelope {
  return {
    code,
    post_data: JSON.stringify(payload),
    path,
    method,
  };
}

function isTransientError(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === 'AbortError' ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket')
  );
}

export interface GatewayClientOptions {
  fetchFn?: typeof globalThis.fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

export class GatewayClient {
  private code: string;
  private fetchFn: typeof globalThis.fetch;
  private sleepFn: (ms: number) => Promise<void>;

  constructor(code: string, options?: GatewayClientOptions) {
    this.code = code;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.sleepFn = options?.sleepFn ?? sleep;
  }

  async call(path: string, method: string, payload: unknown): Promise<unknown> {
    const envelope = buildEnvelope(this.code, path, method, payload);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10_000);
        await this.sleepFn(backoff);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: Response;
        try {
          response = await this.fetchFn(GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(envelope),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const safeBody = redactCode(body, this.code);

          if (isTransientError(response.status)) {
            lastError = new Error(
              `Gateway returned ${response.status} for ${path}: ${safeBody}`,
            );
            continue;
          }

          throw new Error(
            `Gateway returned ${response.status} for ${path}: ${safeBody}`,
          );
        }

        const data = await response.json();
        return data;
      } catch (err: unknown) {
        if (err instanceof Error && !err.message.startsWith('Gateway returned')) {
          if (isNetworkError(err)) {
            lastError = new Error(
              redactCode(
                `Network error calling ${path}: ${err.message}`,
                this.code,
              ),
            );
            continue;
          }
        }
        throw err;
      }
    }

    throw lastError ?? new Error(`Failed after ${MAX_RETRIES} retries for ${path}`);
  }
}
