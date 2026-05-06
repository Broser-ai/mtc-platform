const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  cost_usd: number;
  latency_ms: number;
}

// Approximate cost per 1M tokens (input/output average) for estimation
const MODEL_COST_PER_1M: Record<string, number> = {
  "anthropic/claude-opus-4": 18.75,
  "openai/gpt-4o": 6.25,
  "google/gemini-2.5-pro-preview": 3.75,
};

export function estimateCost(model: string, estimatedTokens: number): number {
  const rate = MODEL_COST_PER_1M[model] ?? 5;
  return (estimatedTokens / 1_000_000) * rate;
}

export async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  maxTokens = 2048
): Promise<OpenRouterResponse> {
  const start = Date.now();

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://mtc-platform.vercel.app",
      "X-Title": "Master Team Console",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  const latency_ms = Date.now() - start;
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const rate = MODEL_COST_PER_1M[model] ?? 5;
  const cost_usd = (usage.total_tokens / 1_000_000) * rate;

  return {
    content: data.choices[0].message.content,
    model: data.model ?? model,
    usage,
    cost_usd,
    latency_ms,
  };
}
