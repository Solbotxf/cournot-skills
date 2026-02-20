---
name: cournot-por
description: >
  Use when the user asks to verify, resolve, or search using PoR, proof of reasoning,
  Cournot, or to resolve a prediction market. Runs the Cournot Proof-of-Reasoning
  pipeline and returns a structured PoR report with outcome, confidence, evidence,
  reasoning, and cryptographic roots.
allowed-tools: Bash, Read
---

# Cournot Proof-of-Reasoning (PoR) Skill

You are orchestrating the Cournot PoR pipeline. This pipeline resolves a user's
question through five sequential steps, producing a cryptographically-anchored
proof of reasoning.

## Trigger

Activate when the user mentions any of:
- "PoR", "proof of reasoning", "Cournot"
- "resolve this market", "verify this", "search with PoR"
- Asks you to analyze or resolve a prediction market question using evidence

## Access Code

The pipeline requires a Cournot access code. If the user has not provided one:

**Ask:** "Please provide your Cournot access code (e.g., `cosZMi`)."

**CRITICAL:** Never log, print, or include the access code in any output. Store it
only in memory for the current session. If you need to show a command you ran,
redact the code as `[REDACTED]`.

## Parameters

Collect these from the user (use defaults if not specified):

| Parameter | Default | Description |
|---|---|---|
| `query` | *(required)* | The question or market to resolve |
| `code` | *(ask user)* | Cournot access code |
| `strict_mode` | `false` | Whether to use strict resolution mode |
| `collectors` | `["CollectorGeminiGrounded"]` | Evidence collectors to use |
| `include_raw_content` | `false` | Whether to include raw evidence content |

## Execution: Use the CLI Tool

This skill ships with a TypeScript CLI. Run it from the plugin's directory.

### por.resolve

```bash
npx tsx src/cli.ts resolve \
  --query "<USER_QUERY>" \
  --code "<ACCESS_CODE>" \
  --json
```

Add optional flags as needed:
- `--strict` for strict mode
- `--collectors "Collector1,Collector2"` for custom collectors
- `--include-raw` for raw evidence content

Parse the JSON output and present it as the PoR Report format below.

### por.capabilities

```bash
npx tsx src/cli.ts capabilities --code "<ACCESS_CODE>"
```

Returns the list of available collectors and providers.

## Fallback: Direct API Calls

If the CLI is not available, make the calls directly using `curl` via Bash.
All calls go through a single gateway endpoint:

**Endpoint:** `POST https://interface.cournot.ai/play/polymarket/ai_data`

**Envelope format:**
```json
{
  "code": "<ACCESS_CODE>",
  "post_data": "<STRINGIFIED_JSON_PAYLOAD>",
  "path": "<INTERNAL_PATH>",
  "method": "<HTTP_METHOD>"
}
```

**Important:** Set `--max-time 300` on all curl calls.

### Step 1: Prompt (`POST /step/prompt`)

```bash
curl -s -X POST 'https://interface.cournot.ai/play/polymarket/ai_data' \
  -H 'Content-Type: application/json' \
  --max-time 300 \
  -d '{
    "code": "<CODE>",
    "post_data": "{\"user_input\": \"<QUERY>\", \"strict_mode\": false}",
    "path": "/step/prompt",
    "method": "POST"
  }'
```

Extract: `prompt_spec`, `tool_plan`, `market_id` from response.

### Step 2: Collect (`POST /step/collect`)

Payload fields: `prompt_spec` (from step 1), `tool_plan` (from step 1),
`collectors` (array of strings), `include_raw_content` (boolean).

### Step 3: Audit (`POST /step/audit`)

Payload fields: `prompt_spec` (from step 1), `evidence_bundles` (from step 2).

Returns: `reasoning_trace`.

### Step 4: Judge (`POST /step/judge`)

Payload fields: `prompt_spec` (from step 1), `evidence_bundles` (from step 2),
`reasoning_trace` (from step 3).

Returns: `verdict`, `outcome`, `confidence`.

### Step 5: Bundle (`POST /step/bundle`)

Payload fields: `prompt_spec` (from step 1), `evidence_bundles` (from step 2),
`reasoning_trace` (from step 3), `verdict` (from step 4).

Returns: `por_bundle`, `por_root`, `roots`.

### Capabilities (`GET /capabilities`)

```bash
curl -s -X POST 'https://interface.cournot.ai/play/polymarket/ai_data' \
  -H 'Content-Type: application/json' \
  --max-time 300 \
  -d '{
    "code": "<CODE>",
    "post_data": "{}",
    "path": "/capabilities",
    "method": "GET"
  }'
```

## Error Handling

- If a step fails, report which step failed and the error message.
- If the API returns a wrapped response (`{ "data": { ... } }`), extract the inner `data` field.
- Never expose the access code in error messages.
- If a collector fails but others succeed, continue with available evidence.

## Output Format: PoR Report

Present results in this exact format:

```
# PoR Report

**Outcome:** <YES/NO/UNKNOWN>
**Confidence:** <percentage>%
**Resolution Rule:** <rule_id, if present>

## Evidence Highlights
- **<title>** -- [source](<url>) -- <snippet>
- ...
(Show top 5-10 items. Include source URL and title when available.)

## Requirements
**Fulfilled:**
- [x] <requirement description>

**Unfulfilled:**
- [ ] <requirement description>

(Only show this section if requirements data is present in the verdict.)

## Reasoning Summary
1. <reasoning step>
2. <reasoning step>
...
(Show top steps from the reasoning trace.)

## PoR Roots
- **Prompt Spec Hash:** `<hash>`
- **Evidence Root:** `<hash>`
- **Reasoning Root:** `<hash>`
- **PoR Root:** `<hash>`

---
*Don't trust the output -- verify the evidence and reasoning.*
```

## Important Reminders

1. **Security:** The access code is sensitive. Never print it, log it, or include
   it in outputs. Always redact as `[REDACTED]`.
2. **Timeouts:** Each API call may take up to 300 seconds. Inform the user that
   the pipeline may take a few minutes to complete.
3. **Verification:** Always include the footer disclaimer. This is not optional.
4. **Roots:** The PoR roots are cryptographic commitments. Present them exactly
   as returned by the API.
