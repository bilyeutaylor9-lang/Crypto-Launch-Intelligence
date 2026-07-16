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

## Output

The report contains six independent specialist findings, failed-agent telemetry, a cautious evidence-judge synthesis, source availability, missing proof, and concrete verification checks. A missing local service or model creates an `UNAVAILABLE` report with setup steps instead of pretending analysis occurred.

Model output is untrusted research assistance. Verify every claim against primary public sources before relying on it.
