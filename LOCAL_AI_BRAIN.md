# Local AI Brain

The local AI brain is an optional, local-only research assistant. It sends compact evidence briefs to Ollama and writes its result to `reports/local-ai-brain.json`. Every normal Mac scan queues the top 100 eligible research candidates: the strongest candidates receive deeper specialist review and the remainder receive bounded triage. Completed light/deep research can apply a small evidence adjustment from -10 to +6 before final scoring. Triage never increases a score and can only apply a limited negative adjustment. It cannot bypass identity, contract, liquidity, safety, final-selection, or sniper-integrity gates, and it does not provide financial advice.

## Setup

Install and start [Ollama](https://ollama.com/) on the Mac, then download a local model:

```bash
ollama pull qwen3:4b
```

The default model is `qwen3:4b`. A smaller model can be selected by adding this to `.env.local`:

```text
OLLAMA_MODEL=qwen3:1.7b
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TIMEOUT_MS=90000
OLLAMA_MAX_TOKENS=450
OLLAMA_THINK=false
LOCAL_AI_TOP_PROJECT_LIMIT=100
LOCAL_AI_TRIAGE_MAX_TOKENS=180
```

## Run

Run the self-contained fictional fixture to verify the local setup:

```bash
npm run ai:brain
```

To research a project from the latest scanner report, first run the normal scan and then pass a permanent project key, contract address, exact name, or symbol:

```bash
npm run scan
npm run ai:brain -- LGNS
```

When a ticker matches multiple projects, use a contract address or permanent project key. This keeps ticker collisions from selecting the wrong asset.

## Automatic Queue and Worker

Normal `npm run scan` runs deterministic identity, source, liquidity, demand, wallet, and safety checks first. On a Mac with Ollama available, it reviews the highest-priority eligible project inline before final scoring and queues the top 100 eligible candidates. Up to five receive deep research, up to 25 receive light specialist research, and the remaining eligible projects receive bounded identity, provenance, and bear-case triage. The completed light/deep review can adjust the score by -10 to +6; triage can only deprioritize. Final selection remains deterministic.

Choose the local-AI behavior with `LOCAL_AI_MODE`:

```text
LOCAL_AI_MODE=AUTO   # default: review one strong candidate inline and queue the rest
LOCAL_AI_MODE=INLINE # review LOCAL_AI_INLINE_LIMIT candidates inline
LOCAL_AI_MODE=QUEUE  # queue research without waiting for Ollama
LOCAL_AI_MODE=OFF    # disable local AI for this scan
```

Mac-local commands:

```bash
npm run scan:ai       # one inline local-AI review plus the full scanner
npm run scan:ai:deep  # three inline reviews plus the full scanner
npm run scan:ai:top100 # wait for local-AI review of the top 100 eligible projects
npm run scan:ai:queue # queue only, then process with the worker
```

Run the local worker in a separate terminal after starting Ollama:

```bash
npm run ai:worker
```

The worker processes one mission at a time, saves each result, and resumes queued work after interruption. To process at most one worker batch and exit:

```bash
npm run ai:worker:once
npm run ai:worker:top100
```

The live queue, completed research summaries, and conservative agent-performance records are written to `reports/local-ai-research.json`. A missing model leaves missions queued for a later worker; it does not fail the normal scan.

To change the inline workload explicitly:

```bash
LOCAL_AI_INLINE=true LOCAL_AI_INLINE_LIMIT=5 npm run scan
```

Inline results can contribute their bounded adjustment during that same scan. Worker results are attached when a later scan sees the same evidence fingerprint.

Score influence is enabled by default. It can be disabled, or its already conservative limits can be lowered, in `.env.local`:

```text
LOCAL_AI_SCORE_INFLUENCE=false
LOCAL_AI_MAX_SCORE_BOOST=6
LOCAL_AI_MAX_SCORE_PENALTY=10
```

The implementation never allows values above `+6` or below `-10`, even when an environment value is larger.

Keep Ollama bound to `127.0.0.1`; do not expose its port directly to the internet.

## Output

The report contains up to fourteen focused specialist findings, failed-agent telemetry, a cautious evidence-judge synthesis, source availability, missing proof, and concrete verification checks. Local AI emits one of four research actions: corroborate, verify, monitor, or block promotion. A promotion block requires completed, high-confidence light/deep risk research and is still subject to independent resolution. Local-agent influence stays at its default until at least 20 measured outcomes exist, and later adjustments are deliberately capped.

Model output is untrusted research assistance. Verify every claim against primary public sources before relying on it.
