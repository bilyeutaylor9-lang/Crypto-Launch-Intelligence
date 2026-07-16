# Local AI Brain

The local AI brain is an optional, local-only research assistant. It sends a compact evidence brief to Ollama and writes its result to `reports/local-ai-brain.json`. It does not modify scanner scores, bypass integrity gates, or provide financial advice.

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

Normal `npm run scan` runs every deterministic identity, source, liquidity, and safety gate first. It then queues at most 25 light research missions and 5 deep research missions. Queueing does not require Ollama and never changes scanner scores or final selection.

Run the local worker in a separate terminal after starting Ollama:

```bash
npm run ai:worker
```

The worker processes one mission at a time, saves each result, and resumes queued work after interruption. To process at most one worker batch and exit:

```bash
npm run ai:worker:once
```

The live queue, completed research summaries, and conservative agent-performance records are written to `reports/local-ai-research.json`. A missing model leaves missions queued for a later worker; it does not fail the normal scan.

For a small, synchronous review after a scan, explicitly opt in:

```bash
LOCAL_AI_INLINE=true LOCAL_AI_INLINE_LIMIT=5 npm run scan
```

Keep Ollama bound to `127.0.0.1`; do not expose its port directly to the internet.

## Output

The report contains six independent specialist findings, failed-agent telemetry, a cautious evidence-judge synthesis, source availability, missing proof, and concrete verification checks. Local-agent influence stays at its default until at least 20 measured outcomes exist, and later adjustments are deliberately capped.

Model output is untrusted research assistance. Verify every claim against primary public sources before relying on it.
