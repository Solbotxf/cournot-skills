import { z } from 'zod';

export const promptResponseSchema = z.object({
  market_id: z.string().optional(),
  prompt_spec: z.unknown(),
  tool_plan: z.unknown(),
  metadata: z.unknown().optional(),
}).passthrough();

export const collectResponseSchema = z.object({
  evidence_bundles: z.array(z.unknown()),
  collectors_used: z.array(z.string()).optional().default([]),
  execution_logs: z.array(z.unknown()).optional(),
  errors: z.array(z.unknown()).optional().default([]),
}).passthrough();

export const auditResponseSchema = z.object({
  reasoning_trace: z.unknown(),
  errors: z.array(z.unknown()).optional().default([]),
}).passthrough();

export const judgeResponseSchema = z.object({
  verdict: z.unknown(),
  outcome: z.string(),
  confidence: z.number(),
  errors: z.array(z.unknown()).optional().default([]),
}).passthrough();

export const bundleResponseSchema = z.object({
  por_bundle: z.unknown(),
  por_root: z.string(),
  roots: z.object({
    prompt_spec_hash: z.string(),
    evidence_root: z.string(),
    reasoning_root: z.string(),
    por_root: z.string(),
  }),
  errors: z.array(z.unknown()).optional().default([]),
}).passthrough();

export const capabilitiesResponseSchema = z.object({
  collectors: z.array(z.unknown()).optional(),
  providers: z.array(z.unknown()).optional(),
}).passthrough();
