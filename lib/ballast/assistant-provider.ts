/**
 * Ballast — optional LLM explanation provider (DECISIONS.md #033).
 *
 * SERVER ONLY. Reads the API key from the server environment; the key is
 * never sent to, or referenced by, the browser.
 *
 * Provider-agnostic by interface. OpenAI is implemented because
 * OPENAI_API_KEY is the credential this project already declares
 * (.env.example) and @langchain/openai is already a dependency — no new
 * service was introduced. As of this writing that variable holds the
 * unfilled template placeholder, so `available` is false and the assistant
 * runs on its deterministic explanation path, reported honestly rather than
 * failing.
 *
 * Filling in a real key is config-only: no code change, no redeploy of
 * logic. Raw fetch is used rather than the LangChain wrapper — one
 * constrained call with strict JSON output needs precise control, and this
 * adds no dependency surface (Cost of Change Principle: simplest option that
 * satisfies the requirement).
 */

import {
  buildUserPrompt,
  SYSTEM_PROMPT,
  type ExplanationProvider,
  type ExplanationRequest,
  type ExplanationResult,
} from "./assistant";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 20_000;

/** A real OpenAI key starts with `sk-` and is far longer than any template
 * placeholder. This is what keeps the unfilled `.env.example` value from
 * being treated as configured. */
function isRealKey(key: string | undefined): key is string {
  return typeof key === "string" && key.startsWith("sk-") && key.length > 40;
}

class UnavailableProvider implements ExplanationProvider {
  readonly name = "none";
  readonly available = false;
  constructor(readonly unavailableReason: string) {}
  async explain(): Promise<ExplanationResult | null> {
    return null;
  }
}

class OpenAIProvider implements ExplanationProvider {
  readonly name = "openai";
  readonly available = true;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async explain(req: ExplanationRequest): Promise<ExplanationResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          // Deterministic-leaning: this layer rephrases fixed facts, so
          // sampling variety has no upside here.
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(req) },
          ],
        }),
      });

      if (!res.ok) {
        console.error(
          `[ballast/assistant] provider HTTP ${res.status}; falling back to deterministic explanation`,
        );
        return null;
      }

      const payload = await res.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string") return null;

      const parsed = JSON.parse(content) as {
        answerable?: unknown;
        answer?: unknown;
        cited_signal_indexes?: unknown;
      };

      return {
        answerable: parsed.answerable !== false,
        answer: typeof parsed.answer === "string" ? parsed.answer : "",
        citedIndexes: Array.isArray(parsed.cited_signal_indexes)
          ? parsed.cited_signal_indexes.filter(
              (n): n is number => typeof n === "number",
            )
          : [],
      };
    } catch (err) {
      // Any transport/parse failure degrades to the deterministic path.
      console.error(
        "[ballast/assistant] provider call failed; falling back to deterministic explanation:",
        err instanceof Error ? err.message : String(err),
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getExplanationProvider(): ExplanationProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!isRealKey(key)) {
    return new UnavailableProvider(
      "No LLM API key is configured (OPENAI_API_KEY is absent or is the " +
        "unfilled template placeholder). Answers are composed deterministically " +
        "from engine output.",
    );
  }
  return new OpenAIProvider(key, process.env.OPENAI_MODEL ?? DEFAULT_MODEL);
}
