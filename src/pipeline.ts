import { GatewayClient, type GatewayClientOptions } from './client.js';
import {
  promptResponseSchema,
  collectResponseSchema,
  auditResponseSchema,
  judgeResponseSchema,
  bundleResponseSchema,
  capabilitiesResponseSchema,
} from './schemas.js';
import { buildReport } from './report.js';
import type {
  PipelineOptions,
  PromptResponse,
  CollectResponse,
  AuditResponse,
  JudgeResponse,
  BundleResponse,
  PorReport,
} from './types.js';

/**
 * Unwrap response envelope: if the API wraps results in { data: ... }, extract the inner value.
 */
function extractData(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as Record<string, unknown>).data;
  }
  return raw;
}

/**
 * Run the full 5-step PoR pipeline and return a structured report.
 */
export async function runPipeline(
  options: PipelineOptions,
  clientOptions?: GatewayClientOptions,
): Promise<PorReport> {
  const client = new GatewayClient(options.code, clientOptions);
  const collectors = options.collectors ?? ['CollectorGeminiGrounded'];
  const strictMode = options.strict_mode ?? false;
  const includeRaw = options.include_raw_content ?? false;

  // Step 1: Prompt
  const promptRaw = await client.call('/step/prompt', 'POST', {
    user_input: options.query,
    strict_mode: strictMode,
  });
  const promptResponse = promptResponseSchema.parse(
    extractData(promptRaw),
  ) as PromptResponse;

  // Step 2: Collect
  const collectRaw = await client.call('/step/collect', 'POST', {
    prompt_spec: promptResponse.prompt_spec,
    tool_plan: promptResponse.tool_plan,
    collectors,
    include_raw_content: includeRaw,
  });
  const collectResponse = collectResponseSchema.parse(
    extractData(collectRaw),
  ) as CollectResponse;

  // Step 3: Audit
  const auditRaw = await client.call('/step/audit', 'POST', {
    prompt_spec: promptResponse.prompt_spec,
    evidence_bundles: collectResponse.evidence_bundles,
  });
  const auditResponse = auditResponseSchema.parse(
    extractData(auditRaw),
  ) as AuditResponse;

  // Step 4: Judge
  const judgeRaw = await client.call('/step/judge', 'POST', {
    prompt_spec: promptResponse.prompt_spec,
    evidence_bundles: collectResponse.evidence_bundles,
    reasoning_trace: auditResponse.reasoning_trace,
  });
  const judgeResponse = judgeResponseSchema.parse(
    extractData(judgeRaw),
  ) as JudgeResponse;

  // Step 5: Bundle
  const bundleRaw = await client.call('/step/bundle', 'POST', {
    prompt_spec: promptResponse.prompt_spec,
    evidence_bundles: collectResponse.evidence_bundles,
    reasoning_trace: auditResponse.reasoning_trace,
    verdict: judgeResponse.verdict,
  });
  const bundleResponse = bundleResponseSchema.parse(
    extractData(bundleRaw),
  ) as BundleResponse;

  return buildReport(
    promptResponse,
    collectResponse,
    auditResponse,
    judgeResponse,
    bundleResponse,
  );
}

/**
 * Query backend capabilities (available collectors/providers).
 */
export async function getCapabilities(
  code: string,
  clientOptions?: GatewayClientOptions,
): Promise<unknown> {
  const client = new GatewayClient(code, clientOptions);
  const raw = await client.call('/capabilities', 'GET', {});
  const data = extractData(raw);
  return capabilitiesResponseSchema.parse(data);
}
