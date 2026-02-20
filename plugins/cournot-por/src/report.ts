import type {
  PromptResponse,
  CollectResponse,
  AuditResponse,
  JudgeResponse,
  BundleResponse,
  PorReport,
  EvidenceHighlight,
} from './types.js';

export function buildReport(
  prompt: PromptResponse,
  collect: CollectResponse,
  audit: AuditResponse,
  judge: JudgeResponse,
  bundle: BundleResponse,
): PorReport {
  const evidenceHighlights = extractEvidenceHighlights(collect.evidence_bundles);
  const reasoningSummary = extractReasoningSummary(audit.reasoning_trace);
  const { fulfilled, unfulfilled } = extractRequirements(judge);
  const resolutionRuleId = extractResolutionRuleId(judge);

  return {
    outcome: judge.outcome,
    confidence: judge.confidence,
    resolution_rule_id: resolutionRuleId,
    evidence_highlights: evidenceHighlights,
    requirements_fulfilled: fulfilled.length > 0 ? fulfilled : undefined,
    requirements_unfulfilled: unfulfilled.length > 0 ? unfulfilled : undefined,
    reasoning_summary: reasoningSummary,
    roots: bundle.roots,
    raw: {
      prompt_response: prompt,
      collect_response: collect,
      audit_response: audit,
      judge_response: judge,
      bundle_response: bundle,
    },
  };
}

function extractEvidenceHighlights(bundles: unknown[]): EvidenceHighlight[] {
  const highlights: EvidenceHighlight[] = [];

  for (const bundle of bundles) {
    if (!bundle || typeof bundle !== 'object') continue;
    const b = bundle as Record<string, unknown>;

    // Try to find an array of evidence items inside the bundle
    const items = (b.items ?? b.evidence_items ?? b.results ?? b.snippets) as unknown[];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const i = item as Record<string, unknown>;
        highlights.push({
          title: asOptionalString(i.title ?? i.headline ?? i.name),
          source_url: asOptionalString(i.source_url ?? i.url ?? i.link),
          snippet: asOptionalString(i.snippet ?? i.text ?? i.content ?? i.summary),
        });
      }
    }

    // Fallback: treat the bundle itself as a single evidence item
    if (items === undefined || !Array.isArray(items)) {
      if (b.title || b.snippet || b.source_url || b.url || b.text) {
        highlights.push({
          title: asOptionalString(b.title ?? b.headline),
          source_url: asOptionalString(b.source_url ?? b.url),
          snippet: asOptionalString(b.snippet ?? b.text ?? b.summary),
        });
      }
    }
  }

  return highlights.slice(0, 10);
}

function extractReasoningSummary(trace: unknown): string[] {
  if (!trace) return [];

  if (Array.isArray(trace)) {
    return trace
      .filter((step): step is Record<string, unknown> =>
        typeof step === 'object' && step !== null,
      )
      .map(step => {
        const desc = step.description ?? step.summary ?? step.step ?? step.text;
        return typeof desc === 'string' ? desc : JSON.stringify(step);
      })
      .slice(0, 10);
  }

  if (typeof trace === 'object' && trace !== null) {
    const t = trace as Record<string, unknown>;
    const steps = (t.steps ?? t.trace ?? t.reasoning_steps) as unknown[];
    if (Array.isArray(steps)) {
      return extractReasoningSummary(steps);
    }
    const summary = t.summary ?? t.text;
    if (typeof summary === 'string') {
      return [summary];
    }
  }

  if (typeof trace === 'string') {
    return [trace];
  }

  return [];
}

function extractRequirements(
  judge: JudgeResponse,
): { fulfilled: string[]; unfulfilled: string[] } {
  const verdict = judge.verdict;
  if (!verdict || typeof verdict !== 'object') return { fulfilled: [], unfulfilled: [] };

  const fulfilled: string[] = [];
  const unfulfilled: string[] = [];

  const v = verdict as Record<string, unknown>;
  const reqs = (v.requirements ?? v.criteria ?? v.rules) as unknown[];

  if (Array.isArray(reqs)) {
    for (const req of reqs) {
      if (!req || typeof req !== 'object') continue;
      const r = req as Record<string, unknown>;
      const label = asOptionalString(r.description ?? r.label ?? r.name ?? r.id);
      if (!label) continue;
      const met = r.fulfilled ?? r.met ?? r.satisfied ?? r.passed;
      if (met) {
        fulfilled.push(label);
      } else {
        unfulfilled.push(label);
      }
    }
  }

  return { fulfilled, unfulfilled };
}

function extractResolutionRuleId(judge: JudgeResponse): string | undefined {
  const verdict = judge.verdict;
  if (!verdict || typeof verdict !== 'object') return undefined;
  const v = verdict as Record<string, unknown>;
  return asOptionalString(v.resolution_rule_id ?? v.rule_id);
}

function asOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' ? val : undefined;
}

export function formatReport(report: PorReport): string {
  const lines: string[] = [];

  lines.push('# PoR Report');
  lines.push('');
  lines.push(`**Outcome:** ${report.outcome}`);
  lines.push(`**Confidence:** ${(report.confidence * 100).toFixed(1)}%`);
  if (report.resolution_rule_id) {
    lines.push(`**Resolution Rule:** ${report.resolution_rule_id}`);
  }

  lines.push('');
  lines.push('## Evidence Highlights');
  if (report.evidence_highlights.length === 0) {
    lines.push('No evidence highlights available.');
  } else {
    for (const item of report.evidence_highlights) {
      const parts: string[] = [];
      if (item.title) parts.push(`**${item.title}**`);
      if (item.source_url) parts.push(`[source](${item.source_url})`);
      if (item.snippet) parts.push(item.snippet);
      lines.push(`- ${parts.join(' — ')}`);
    }
  }

  if (report.requirements_fulfilled?.length || report.requirements_unfulfilled?.length) {
    lines.push('');
    lines.push('## Requirements');
    if (report.requirements_fulfilled?.length) {
      lines.push('**Fulfilled:**');
      for (const r of report.requirements_fulfilled) {
        lines.push(`- [x] ${r}`);
      }
    }
    if (report.requirements_unfulfilled?.length) {
      lines.push('**Unfulfilled:**');
      for (const r of report.requirements_unfulfilled) {
        lines.push(`- [ ] ${r}`);
      }
    }
  }

  lines.push('');
  lines.push('## Reasoning Summary');
  if (report.reasoning_summary.length === 0) {
    lines.push('No reasoning steps available.');
  } else {
    for (let i = 0; i < report.reasoning_summary.length; i++) {
      lines.push(`${i + 1}. ${report.reasoning_summary[i]}`);
    }
  }

  lines.push('');
  lines.push('## PoR Roots');
  lines.push(`- **Prompt Spec Hash:** \`${report.roots.prompt_spec_hash}\``);
  lines.push(`- **Evidence Root:** \`${report.roots.evidence_root}\``);
  lines.push(`- **Reasoning Root:** \`${report.roots.reasoning_root}\``);
  lines.push(`- **PoR Root:** \`${report.roots.por_root}\``);

  lines.push('');
  lines.push('---');
  lines.push("*Don't trust the output -- verify the evidence and reasoning.*");

  return lines.join('\n');
}
