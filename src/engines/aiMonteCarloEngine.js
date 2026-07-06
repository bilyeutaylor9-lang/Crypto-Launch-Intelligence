// src/engines/aiMonteCarloEngine.js

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function sleep(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(text = "") {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallback(project = {}, reason = "AI unavailable") {
  return {
    aiMonteCarloScore: clamp(project.monteCarloScore || 0),
    aiMonteCarloLevel: reason,
    aiMonteCarloSummary: reason,
    aiMonteCarloThesis: "",
    aiMonteCarloRisk: "",
    aiMonteCarloConfidence: "Low",
    aiMonteCarloDecision: "Monitor",
    aiMonteCarloReasons: [reason],
  };
}

export async function analyzeMonteCarloWithAI(project = {}) {
  if (!process.env.OPENAI_API_KEY) {
    return fallback(project, "OPENAI_API_KEY is not set");
  }

  const payload = {
    name: project.name,
    symbol: project.symbol,
    chain: project.chain,
    pipelineScore: project.pipelineScore,
    monteCarloScore: project.monteCarloScore,
    monteCarlo: project.monteCarlo,
    scores: {
      smartMoney: project.smartMoneyAccumulationScore,
      buyPressure: project.buyPressureScore,
      capitalFlow: project.capitalFlowScore,
      catalyst: project.catalystScore,
      narrative: project.narrativeForecastScore,
      risk: project.riskScore,
      sellPressure: project.sellPressureScore,
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        temperature: 0.2,
        text: {
          format: {
            type: "json_object",
          },
        },
        input: [
          {
            role: "system",
            content:
              "You are an institutional crypto risk analyst. Return only valid JSON. Do not give financial advice. Analyze probability, risk, uncertainty, and evidence quality.",
          },
          {
            role: "user",
            content: `Analyze this Monte Carlo crypto simulation and return JSON with:
{
  "aiMonteCarloScore": number,
  "aiMonteCarloLevel": string,
  "summary": string,
  "upsideThesis": string,
  "downsideRisk": string,
  "confidence": "Low" | "Medium" | "High",
  "decision": "Avoid" | "Monitor" | "Watchlist" | "Strong Watchlist" | "High Conviction",
  "reasons": string[]
}

Score must be 0-100.
Do not recommend buying.
Focus on probability, risk, uncertainty, and signal quality.

Data:
${JSON.stringify(payload, null, 2)}`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      return fallback(project, `OpenAI API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      data.output?.[0]?.content?.[0]?.content ||
      "";

    const parsed = safeJson(text);

    if (!parsed) {
      return fallback(project, "AI JSON parse failed");
    }

    return {
      aiMonteCarloScore: clamp(parsed.aiMonteCarloScore),
      aiMonteCarloLevel: parsed.aiMonteCarloLevel || parsed.decision || "Unknown",
      aiMonteCarloSummary: parsed.summary || "",
      aiMonteCarloThesis: parsed.upsideThesis || "",
      aiMonteCarloRisk: parsed.downsideRisk || "",
      aiMonteCarloConfidence: parsed.confidence || "Low",
      aiMonteCarloDecision: parsed.decision || "Monitor",
      aiMonteCarloReasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    };
  } catch (error) {
    clearTimeout(timeout);

    return fallback(
      project,
      error?.name === "AbortError"
        ? "OpenAI request timed out"
        : `OpenAI request failed: ${error.message}`
    );
  }
}

export async function analyzeAIMonteCarlo(project = {}) {
  const ai = await analyzeMonteCarloWithAI(project);

  return {
    ...project,
    ...ai,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      aiMonteCarlo: ai,
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "AI Monte Carlo Engine",
        signal: "AI interpretation of probabilistic simulation",
        score: ai.aiMonteCarloScore || 0,
        confidence:
          ai.aiMonteCarloConfidence === "High"
            ? 0.9
            : ai.aiMonteCarloConfidence === "Medium"
              ? 0.65
              : 0.4,
        impact:
          ai.aiMonteCarloScore >= 75
            ? "Strong Positive"
            : ai.aiMonteCarloScore >= 55
              ? "Positive"
              : "Neutral",
        reasons: ai.aiMonteCarloReasons || [],
      },
    ],
  };
}

export async function analyzeAIMonteCarloBatch(projects = [], options = {}) {
  const limit = Number(options.limit || 25);

  const topProjects = [...projects]
    .sort((a, b) => Number(b.monteCarloScore || 0) - Number(a.monteCarloScore || 0))
    .slice(0, limit);

  const topIds = new Set(topProjects.map((p) => p.symbol || p.name));

  const analyzed = [];

  for (const project of projects) {
    if (topIds.has(project.symbol || project.name)) {
      analyzed.push(await analyzeAIMonteCarlo(project));
      await sleep(Number(options.delayMs || 400));
    } else {
      analyzed.push(project);
    }
  }

  return analyzed;
}
