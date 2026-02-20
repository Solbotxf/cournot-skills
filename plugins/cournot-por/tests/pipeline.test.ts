import { describe, it, expect, vi } from 'vitest';
import { runPipeline, getCapabilities } from '../src/pipeline.js';
import type { GatewayClientOptions } from '../src/client.js';

const noSleep = async () => {};

// Mock API responses for the happy path
const MOCK_PROMPT_RESPONSE = {
  data: {
    market_id: 'market-123',
    prompt_spec: { id: 'spec-1', query: 'Will it rain?' },
    tool_plan: { tools: ['search'] },
    metadata: { source: 'test' },
  },
};

const MOCK_COLLECT_RESPONSE = {
  data: {
    evidence_bundles: [
      {
        items: [
          {
            title: 'Weather Report',
            source_url: 'https://weather.example.com',
            snippet: 'Rain expected tomorrow',
          },
          {
            title: 'Climate Data',
            url: 'https://climate.example.com',
            text: 'Precipitation probability 80%',
          },
        ],
      },
    ],
    collectors_used: ['CollectorGeminiGrounded'],
    execution_logs: [],
    errors: [],
  },
};

const MOCK_AUDIT_RESPONSE = {
  data: {
    reasoning_trace: [
      { description: 'Analyzed weather forecasts from multiple sources' },
      { description: 'Cross-referenced with historical precipitation data' },
      { description: 'Evaluated confidence based on forecast agreement' },
    ],
    errors: [],
  },
};

const MOCK_JUDGE_RESPONSE = {
  data: {
    verdict: {
      resolution_rule_id: 'RULE-001',
      requirements: [
        { description: 'Multiple sources agree', fulfilled: true },
        { description: 'Recent data available', fulfilled: true },
        { description: 'Official source confirms', fulfilled: false },
      ],
    },
    outcome: 'YES',
    confidence: 0.85,
    errors: [],
  },
};

const MOCK_BUNDLE_RESPONSE = {
  data: {
    por_bundle: { version: 1, steps: 5 },
    por_root: '0xabc123',
    roots: {
      prompt_spec_hash: '0xdef456',
      evidence_root: '0x789abc',
      reasoning_root: '0xdef012',
      por_root: '0xabc123',
    },
    errors: [],
  },
};

function createMockFetch(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    const path = body.path as string;
    const responseData = responses[path];

    if (!responseData) {
      return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve(`No mock for path: ${path}`),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responseData),
    });
  });
}

function clientOpts(mockFetch: unknown): GatewayClientOptions {
  return { fetchFn: mockFetch as typeof fetch, sleepFn: noSleep };
}

describe('runPipeline', () => {
  it('executes all 5 steps in order and returns a report', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    const report = await runPipeline(
      { query: 'Will it rain?', code: 'testCode' },
      clientOpts(mockFetch),
    );

    // Verify all 5 API calls were made
    expect(mockFetch).toHaveBeenCalledTimes(5);

    // Verify call order
    const paths = mockFetch.mock.calls.map((call: unknown[]) => {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      return body.path;
    });
    expect(paths).toEqual([
      '/step/prompt',
      '/step/collect',
      '/step/audit',
      '/step/judge',
      '/step/bundle',
    ]);

    // Verify report structure
    expect(report.outcome).toBe('YES');
    expect(report.confidence).toBe(0.85);
    expect(report.resolution_rule_id).toBe('RULE-001');
    expect(report.roots.por_root).toBe('0xabc123');
    expect(report.roots.prompt_spec_hash).toBe('0xdef456');
    expect(report.roots.evidence_root).toBe('0x789abc');
    expect(report.roots.reasoning_root).toBe('0xdef012');
  });

  it('extracts evidence highlights correctly', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    const report = await runPipeline(
      { query: 'Will it rain?', code: 'testCode' },
      clientOpts(mockFetch),
    );

    expect(report.evidence_highlights).toHaveLength(2);
    expect(report.evidence_highlights[0]).toEqual({
      title: 'Weather Report',
      source_url: 'https://weather.example.com',
      snippet: 'Rain expected tomorrow',
    });
    expect(report.evidence_highlights[1]).toEqual({
      title: 'Climate Data',
      source_url: 'https://climate.example.com',
      snippet: 'Precipitation probability 80%',
    });
  });

  it('extracts reasoning summary correctly', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    const report = await runPipeline(
      { query: 'Will it rain?', code: 'testCode' },
      clientOpts(mockFetch),
    );

    expect(report.reasoning_summary).toHaveLength(3);
    expect(report.reasoning_summary[0]).toBe(
      'Analyzed weather forecasts from multiple sources',
    );
  });

  it('extracts requirements correctly', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    const report = await runPipeline(
      { query: 'Will it rain?', code: 'testCode' },
      clientOpts(mockFetch),
    );

    expect(report.requirements_fulfilled).toEqual([
      'Multiple sources agree',
      'Recent data available',
    ]);
    expect(report.requirements_unfulfilled).toEqual(['Official source confirms']);
  });

  it('passes custom options through the pipeline', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    await runPipeline(
      {
        query: 'Custom query',
        code: 'myCode',
        strict_mode: true,
        collectors: ['CollectorA', 'CollectorB'],
        include_raw_content: true,
      },
      clientOpts(mockFetch),
    );

    // Check /step/prompt payload
    const promptBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    const promptPayload = JSON.parse(promptBody.post_data);
    expect(promptPayload.user_input).toBe('Custom query');
    expect(promptPayload.strict_mode).toBe(true);

    // Check /step/collect payload
    const collectBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    const collectPayload = JSON.parse(collectBody.post_data);
    expect(collectPayload.collectors).toEqual(['CollectorA', 'CollectorB']);
    expect(collectPayload.include_raw_content).toBe(true);
  });

  it('uses default options when not specified', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': MOCK_PROMPT_RESPONSE,
      '/step/collect': MOCK_COLLECT_RESPONSE,
      '/step/audit': MOCK_AUDIT_RESPONSE,
      '/step/judge': MOCK_JUDGE_RESPONSE,
      '/step/bundle': MOCK_BUNDLE_RESPONSE,
    });

    await runPipeline(
      { query: 'test', code: 'code' },
      clientOpts(mockFetch),
    );

    // Check defaults in /step/prompt
    const promptBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    const promptPayload = JSON.parse(promptBody.post_data);
    expect(promptPayload.strict_mode).toBe(false);

    // Check defaults in /step/collect
    const collectBody = JSON.parse(
      (mockFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    const collectPayload = JSON.parse(collectBody.post_data);
    expect(collectPayload.collectors).toEqual(['CollectorGeminiGrounded']);
    expect(collectPayload.include_raw_content).toBe(false);
  });

  it('handles non-wrapped responses (no data envelope)', async () => {
    const mockFetch = createMockFetch({
      '/step/prompt': {
        market_id: 'market-123',
        prompt_spec: { id: 'spec-1' },
        tool_plan: { tools: [] },
      },
      '/step/collect': {
        evidence_bundles: [],
        collectors_used: [],
        errors: [],
      },
      '/step/audit': {
        reasoning_trace: [],
        errors: [],
      },
      '/step/judge': {
        verdict: {},
        outcome: 'NO',
        confidence: 0.3,
        errors: [],
      },
      '/step/bundle': {
        por_bundle: {},
        por_root: '0x111',
        roots: {
          prompt_spec_hash: '0x222',
          evidence_root: '0x333',
          reasoning_root: '0x444',
          por_root: '0x111',
        },
        errors: [],
      },
    });

    const report = await runPipeline(
      { query: 'test', code: 'code' },
      clientOpts(mockFetch),
    );

    expect(report.outcome).toBe('NO');
    expect(report.confidence).toBe(0.3);
    expect(report.roots.por_root).toBe('0x111');
  });
});

describe('getCapabilities', () => {
  it('calls /capabilities and returns parsed data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            collectors: ['CollectorA', 'CollectorB'],
            providers: ['ProviderX'],
          },
        }),
    });

    const result = await getCapabilities(
      'testCode',
      clientOpts(mockFetch),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.path).toBe('/capabilities');
    expect(body.method).toBe('GET');

    expect(result).toEqual({
      collectors: ['CollectorA', 'CollectorB'],
      providers: ['ProviderX'],
    });
  });
});
