import { describe, it, expect } from 'vitest';
import { buildReport, formatReport } from '../src/report.js';
import type {
  PromptResponse,
  CollectResponse,
  AuditResponse,
  JudgeResponse,
  BundleResponse,
} from '../src/types.js';

const PROMPT: PromptResponse = {
  market_id: 'mkt-1',
  prompt_spec: { id: 'spec-1' },
  tool_plan: { tools: [] },
};

const COLLECT: CollectResponse = {
  evidence_bundles: [
    {
      items: [
        { title: 'Article A', source_url: 'https://a.com', snippet: 'Snippet A' },
        { headline: 'Article B', url: 'https://b.com', text: 'Snippet B' },
      ],
    },
  ],
  collectors_used: ['CollectorGeminiGrounded'],
  errors: [],
};

const AUDIT: AuditResponse = {
  reasoning_trace: [
    { description: 'Step one reasoning' },
    { summary: 'Step two reasoning' },
  ],
  errors: [],
};

const JUDGE: JudgeResponse = {
  verdict: {
    resolution_rule_id: 'RULE-42',
    requirements: [
      { description: 'Source corroboration', fulfilled: true },
      { description: 'Official announcement', fulfilled: false },
    ],
  },
  outcome: 'YES',
  confidence: 0.92,
  errors: [],
};

const BUNDLE: BundleResponse = {
  por_bundle: { v: 1 },
  por_root: '0xroot',
  roots: {
    prompt_spec_hash: '0xpsh',
    evidence_root: '0xer',
    reasoning_root: '0xrr',
    por_root: '0xroot',
  },
  errors: [],
};

describe('buildReport', () => {
  it('constructs a report with all fields', () => {
    const report = buildReport(PROMPT, COLLECT, AUDIT, JUDGE, BUNDLE);

    expect(report.outcome).toBe('YES');
    expect(report.confidence).toBe(0.92);
    expect(report.resolution_rule_id).toBe('RULE-42');
    expect(report.evidence_highlights).toHaveLength(2);
    expect(report.evidence_highlights[0].title).toBe('Article A');
    expect(report.evidence_highlights[1].title).toBe('Article B');
    expect(report.reasoning_summary).toEqual([
      'Step one reasoning',
      'Step two reasoning',
    ]);
    expect(report.requirements_fulfilled).toEqual(['Source corroboration']);
    expect(report.requirements_unfulfilled).toEqual(['Official announcement']);
    expect(report.roots).toEqual(BUNDLE.roots);
  });

  it('handles empty evidence bundles', () => {
    const emptyCollect: CollectResponse = {
      evidence_bundles: [],
      collectors_used: [],
      errors: [],
    };
    const report = buildReport(PROMPT, emptyCollect, AUDIT, JUDGE, BUNDLE);
    expect(report.evidence_highlights).toEqual([]);
  });

  it('handles string reasoning trace', () => {
    const stringAudit: AuditResponse = {
      reasoning_trace: 'Single-line reasoning',
      errors: [],
    };
    const report = buildReport(PROMPT, COLLECT, stringAudit, JUDGE, BUNDLE);
    expect(report.reasoning_summary).toEqual(['Single-line reasoning']);
  });

  it('handles nested reasoning trace with steps key', () => {
    const nestedAudit: AuditResponse = {
      reasoning_trace: {
        steps: [{ description: 'Nested step 1' }, { description: 'Nested step 2' }],
      },
      errors: [],
    };
    const report = buildReport(PROMPT, COLLECT, nestedAudit, JUDGE, BUNDLE);
    expect(report.reasoning_summary).toEqual(['Nested step 1', 'Nested step 2']);
  });

  it('limits evidence highlights to 10', () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      title: `Item ${i}`,
      snippet: `Snippet ${i}`,
    }));
    const bigCollect: CollectResponse = {
      evidence_bundles: [{ items: manyItems }],
      collectors_used: [],
      errors: [],
    };
    const report = buildReport(PROMPT, bigCollect, AUDIT, JUDGE, BUNDLE);
    expect(report.evidence_highlights).toHaveLength(10);
  });

  it('omits requirements when verdict has none', () => {
    const noReqJudge: JudgeResponse = {
      verdict: {},
      outcome: 'NO',
      confidence: 0.1,
      errors: [],
    };
    const report = buildReport(PROMPT, COLLECT, AUDIT, noReqJudge, BUNDLE);
    expect(report.requirements_fulfilled).toBeUndefined();
    expect(report.requirements_unfulfilled).toBeUndefined();
  });
});

describe('formatReport', () => {
  it('produces markdown output with all sections', () => {
    const report = buildReport(PROMPT, COLLECT, AUDIT, JUDGE, BUNDLE);
    const text = formatReport(report);

    expect(text).toContain('# PoR Report');
    expect(text).toContain('**Outcome:** YES');
    expect(text).toContain('**Confidence:** 92.0%');
    expect(text).toContain('**Resolution Rule:** RULE-42');
    expect(text).toContain('## Evidence Highlights');
    expect(text).toContain('**Article A**');
    expect(text).toContain('[source](https://a.com)');
    expect(text).toContain('## Requirements');
    expect(text).toContain('[x] Source corroboration');
    expect(text).toContain('[ ] Official announcement');
    expect(text).toContain('## Reasoning Summary');
    expect(text).toContain('1. Step one reasoning');
    expect(text).toContain('## PoR Roots');
    expect(text).toContain('`0xroot`');
    expect(text).toContain("verify the evidence and reasoning");
  });

  it('omits resolution rule section when not present', () => {
    const report = buildReport(PROMPT, COLLECT, AUDIT, {
      ...JUDGE,
      verdict: {},
    }, BUNDLE);
    report.resolution_rule_id = undefined;
    const text = formatReport(report);
    expect(text).not.toContain('**Resolution Rule:**');
  });
});
