import { describe, it, expect, vi } from 'vitest';
import { GatewayClient, buildEnvelope, redactCode, GATEWAY_URL } from '../src/client.js';

const noSleep = async () => {};

function mockOpts(fetchFn: unknown) {
  return { fetchFn: fetchFn as typeof fetch, sleepFn: noSleep };
}

describe('buildEnvelope', () => {
  it('constructs the correct gateway envelope', () => {
    const envelope = buildEnvelope('myCode', '/step/prompt', 'POST', {
      user_input: 'Will it rain?',
      strict_mode: false,
    });

    expect(envelope).toEqual({
      code: 'myCode',
      post_data: JSON.stringify({ user_input: 'Will it rain?', strict_mode: false }),
      path: '/step/prompt',
      method: 'POST',
    });
  });

  it('stringifies post_data as JSON', () => {
    const envelope = buildEnvelope('x', '/capabilities', 'GET', {});
    expect(typeof envelope.post_data).toBe('string');
    expect(JSON.parse(envelope.post_data)).toEqual({});
  });

  it('handles complex nested payloads', () => {
    const payload = {
      prompt_spec: { id: 'abc', nested: { deep: true } },
      evidence_bundles: [{ items: [1, 2, 3] }],
    };
    const envelope = buildEnvelope('code', '/step/audit', 'POST', payload);
    expect(JSON.parse(envelope.post_data)).toEqual(payload);
  });
});

describe('redactCode', () => {
  it('replaces the access code with [REDACTED]', () => {
    expect(redactCode('Error with code cosZMi in request', 'cosZMi')).toBe(
      'Error with code [REDACTED] in request',
    );
  });

  it('replaces all occurrences', () => {
    expect(redactCode('cosZMi appears twice: cosZMi', 'cosZMi')).toBe(
      '[REDACTED] appears twice: [REDACTED]',
    );
  });

  it('handles special regex characters in the code', () => {
    expect(redactCode('code a+b.c here', 'a+b.c')).toBe('code [REDACTED] here');
  });

  it('returns text unchanged if code is empty', () => {
    expect(redactCode('no code here', '')).toBe('no code here');
  });
});

describe('GatewayClient', () => {
  it('sends POST to the gateway URL with correct envelope', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { result: 'ok' } }),
    });

    const client = new GatewayClient('testCode', mockOpts(mockFetch));
    const result = await client.call('/step/prompt', 'POST', { user_input: 'test' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(GATEWAY_URL);
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(options.body);
    expect(body.code).toBe('testCode');
    expect(body.path).toBe('/step/prompt');
    expect(body.method).toBe('POST');
    expect(JSON.parse(body.post_data)).toEqual({ user_input: 'test' });

    expect(result).toEqual({ data: { result: 'ok' } });
  });

  it('retries on 500 errors', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    const client = new GatewayClient('code', mockOpts(mockFetch));
    const result = await client.call('/step/prompt', 'POST', {});

    expect(callCount).toBe(3);
    expect(result).toEqual({ success: true });
  });

  it('throws immediately on 4xx errors (non-429)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request with code secret123'),
    });

    const client = new GatewayClient('secret123', mockOpts(mockFetch));

    await expect(client.call('/step/prompt', 'POST', {})).rejects.toThrow(
      'Gateway returned 400',
    );
    // Access code should be redacted in the error message
    await expect(client.call('/step/prompt', 'POST', {})).rejects.toThrow('[REDACTED]');
    expect(mockFetch).toHaveBeenCalledTimes(2); // no retries
  });

  it('retries on 429 errors', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve('Rate limited'),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    });

    const client = new GatewayClient('code', mockOpts(mockFetch));
    const result = await client.call('/step/prompt', 'POST', {});

    expect(callCount).toBe(2);
    expect(result).toEqual({ ok: true });
  });

  it('throws after max retries exhausted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server Error'),
    });

    const client = new GatewayClient('code', mockOpts(mockFetch));

    await expect(client.call('/step/prompt', 'POST', {})).rejects.toThrow(
      'Gateway returned 500',
    );
    expect(mockFetch).toHaveBeenCalledTimes(3); // MAX_RETRIES = 3
  });

  it('retries on network errors', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('fetch failed: ECONNREFUSED'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ recovered: true }),
      });
    });

    const client = new GatewayClient('code', mockOpts(mockFetch));
    const result = await client.call('/test', 'POST', {});

    expect(callCount).toBe(2);
    expect(result).toEqual({ recovered: true });
  });

  it('never includes access code in error messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid code: mySecret42'),
    });

    const client = new GatewayClient('mySecret42', mockOpts(mockFetch));

    try {
      await client.call('/step/prompt', 'POST', {});
    } catch (err) {
      expect((err as Error).message).not.toContain('mySecret42');
      expect((err as Error).message).toContain('[REDACTED]');
    }
  });
});
