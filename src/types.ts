export interface GatewayEnvelope {
  code: string;
  post_data: string;
  path: string;
  method: string;
}

// --- Step 1: Prompt ---

export interface PromptRequest {
  user_input: string;
  strict_mode: boolean;
}

export interface PromptResponse {
  market_id?: string;
  prompt_spec: unknown;
  tool_plan: unknown;
  metadata?: unknown;
}

// --- Step 2: Collect ---

export interface CollectRequest {
  prompt_spec: unknown;
  tool_plan: unknown;
  collectors: string[];
  include_raw_content: boolean;
}

export interface CollectResponse {
  evidence_bundles: unknown[];
  collectors_used: string[];
  execution_logs?: unknown[];
  errors: string[];
}

// --- Step 3: Audit ---

export interface AuditRequest {
  prompt_spec: unknown;
  evidence_bundles: unknown[];
}

export interface AuditResponse {
  reasoning_trace: unknown;
  errors: string[];
}

// --- Step 4: Judge ---

export interface JudgeRequest {
  prompt_spec: unknown;
  evidence_bundles: unknown[];
  reasoning_trace: unknown;
}

export interface JudgeResponse {
  verdict: unknown;
  outcome: string;
  confidence: number;
  errors: string[];
}

// --- Step 5: Bundle ---

export interface BundleRequest {
  prompt_spec: unknown;
  evidence_bundles: unknown[];
  reasoning_trace: unknown;
  verdict: unknown;
}

export interface BundleResponse {
  por_bundle: unknown;
  por_root: string;
  roots: {
    prompt_spec_hash: string;
    evidence_root: string;
    reasoning_root: string;
    por_root: string;
  };
  errors: string[];
}

// --- Report ---

export interface PorReport {
  outcome: string;
  confidence: number;
  resolution_rule_id?: string;
  evidence_highlights: EvidenceHighlight[];
  requirements_fulfilled?: string[];
  requirements_unfulfilled?: string[];
  reasoning_summary: string[];
  roots: {
    prompt_spec_hash: string;
    evidence_root: string;
    reasoning_root: string;
    por_root: string;
  };
  raw?: {
    prompt_response: PromptResponse;
    collect_response: CollectResponse;
    audit_response: AuditResponse;
    judge_response: JudgeResponse;
    bundle_response: BundleResponse;
  };
}

export interface EvidenceHighlight {
  title?: string;
  source_url?: string;
  snippet?: string;
}

// --- Pipeline Options ---

export interface PipelineOptions {
  query: string;
  code: string;
  strict_mode?: boolean;
  collectors?: string[];
  include_raw_content?: boolean;
}
