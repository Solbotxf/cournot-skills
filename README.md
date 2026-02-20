# cournot-por

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that runs the **Cournot Proof-of-Reasoning (PoR)** pipeline. Given a natural-language question (e.g. a prediction-market resolution query), this plugin collects evidence, audits reasoning, renders a judgment, and produces a cryptographically-anchored PoR bundle -- all through a single conversational command.

## What it does

The skill orchestrates a 5-step pipeline via the Cournot backend gateway:

1. **Prompt** -- Parses the user query into a structured prompt spec and tool plan.
2. **Collect** -- Gathers evidence bundles from configurable collectors.
3. **Audit** -- Produces a reasoning trace from the evidence.
4. **Judge** -- Renders an outcome (YES / NO / UNKNOWN) with a confidence score.
5. **Bundle** -- Creates a PoR bundle with Merkle-style cryptographic roots.

The final output is a structured **PoR Report** with outcome, confidence, evidence highlights, reasoning summary, and verifiable roots.

## Installation

### As a Claude Code plugin (recommended)

**Option A -- Add as a marketplace and install:**

```
/plugin marketplace add Solbotxf/cournot-skills
/plugin install cournot-por@cournot-skills
```

**Option B -- Team/project configuration:**

Add to your project's `.claude/settings.json` so all team members get the plugin:

```json
{
  "extraKnownMarketplaces": {
    "cournot-skills": {
      "source": {
        "source": "github",
        "repo": "Solbotxf/cournot-skills"
      }
    }
  },
  "enabledPlugins": {
    "cournot-por@cournot-skills": true
  }
}
```

**Option C -- Test locally from a clone:**

```bash
git clone https://github.com/Solbotxf/cournot-skills.git
/plugin marketplace add ./cournot-skills
/plugin install cournot-por@cournot-skills
```

### As a standalone CLI

```bash
git clone https://github.com/Solbotxf/cournot-skills.git
cd cournot-skills/plugins/cournot-por
npm install
```

## Usage

### In Claude Code

Just ask Claude naturally:

> "Use Cournot to resolve: Will the US government shut down on Saturday?"

> "Run PoR on this market: Will BTC exceed $100k by end of month?"

> "Verify with proof of reasoning: Has the Fed raised rates?"

Claude will ask for your access code if you haven't provided one, then run the pipeline and present the PoR Report.

**Optional parameters you can specify:**

- **Strict mode:** "Use strict mode" or "with strict_mode enabled"
- **Custom collectors:** "Use collectors CollectorA and CollectorB"
- **Raw content:** "Include raw evidence content"

### As a CLI

```bash
cd plugins/cournot-por

# Resolve a question
npx tsx src/cli.ts resolve \
  --query "Will the US government shut down?" \
  --code YOUR_CODE

# Get JSON output
npx tsx src/cli.ts resolve \
  --query "Will BTC hit 100k?" \
  --code YOUR_CODE \
  --json

# With custom options
npx tsx src/cli.ts resolve \
  --query "Has the Fed raised rates?" \
  --code YOUR_CODE \
  --strict \
  --collectors "CollectorGeminiGrounded,CollectorCustom" \
  --include-raw

# Check available capabilities
npx tsx src/cli.ts capabilities --code YOUR_CODE
```

## Example output

```
# PoR Report

**Outcome:** YES
**Confidence:** 85.0%
**Resolution Rule:** RULE-001

## Evidence Highlights
- **Government Shutdown Update** — [source](https://example.com/article) — Congress fails to pass spending bill
- **Budget Analysis** — [source](https://example.com/budget) — Continuing resolution expired Friday midnight

## Requirements
**Fulfilled:**
- [x] Multiple independent sources confirm
- [x] Official government communication found

**Unfulfilled:**
- [ ] Post-deadline status confirmation

## Reasoning Summary
1. Analyzed latest congressional voting records
2. Cross-referenced with official budget office statements
3. Evaluated timeline against resolution criteria

## PoR Roots
- **Prompt Spec Hash:** `0xabc123...`
- **Evidence Root:** `0xdef456...`
- **Reasoning Root:** `0x789abc...`
- **PoR Root:** `0xfed321...`

---
*Don't trust the output -- verify the evidence and reasoning.*
```

## Repo structure

```
.claude-plugin/
  marketplace.json                  # Marketplace catalog
plugins/
  cournot-por/
    .claude-plugin/
      plugin.json                   # Plugin manifest
    skills/
      cournot-por/
        SKILL.md                    # Skill definition (loaded by Claude Code)
    src/
      types.ts                      # TypeScript interfaces
      schemas.ts                    # Zod validation schemas
      client.ts                     # Gateway HTTP client (retry, backoff, redaction)
      pipeline.ts                   # 5-step pipeline orchestrator
      report.ts                     # Report builder + Markdown formatter
      cli.ts                        # CLI entry point
    tests/                          # Vitest tests (30 passing)
    package.json
```

## Running tests

```bash
cd plugins/cournot-por
npm install
npm test
```

## Security notes

- **Access codes are never stored on disk.** The code is held in memory only for the duration of the current session/run.
- **Access codes are never printed in output.** If an error message contains the code, it is automatically redacted as `[REDACTED]`.
- **No secrets in the repository.** This repo contains only the skill code. No API keys, tokens, or credentials are included.
- **All API calls go through a single gateway endpoint** (`https://interface.cournot.ai/play/polymarket/ai_data`). No other external dependencies.

## License

MIT
