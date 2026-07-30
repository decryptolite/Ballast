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
const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 20_000;

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Chosen empirically, not from memory (DECISIONS.md #035). Verified against
 * this key's own ListModels output and by a real generateContent call:
 * `gemini-2.5-flash-lite` — the id prior knowledge would have suggested —
 * now returns 404 "no longer available to new users". Flash-Lite is the
 * smallest/fastest tier, which suits a short evidence-explanation task.
 * Overridable via GEMINI_MODEL without a code change.
 */
const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";

/** Response contract shared by every provider: the explanation layer may
 * only produce prose plus indexes into the engine's real signal array. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    answerable: { type: "BOOLEAN" },
    answer: { type: "STRING" },
    cited_signal_indexes: { type: "ARRAY", items: { type: "INTEGER" } },
  },
  required: ["answerable", "answer", "cited_signal_indexes"],
} as const;

function normalizeResult(parsed: {
  answerable?: unknown;
  answer?: unknown;
  cited_signal_indexes?: unknown;
}): ExplanationResult {
  return {
    answerable: parsed.answerable !== false,
    answer: typeof parsed.answer === "string" ? parsed.answer : "",
    citedIndexes: Array.isArray(parsed.cited_signal_indexes)
      ? parsed.cited_signal_indexes.filter(
          (n): n is number => typeof n === "number",
        )
      : [],
  };
}

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

      return normalizeResult(parsed);
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

class GeminiProvider implements ExplanationProvider {
  readonly name = "gemini";
  readonly available = true;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async explain(req: ExplanationRequest): Promise<ExplanationResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `${GEMINI_BASE}/${this.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Header auth, not the `?key=` query parameter the docs show:
            // a secret in a URL leaks into logs, proxies and error strings.
            "x-goog-api-key": this.apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [
              { role: "user", parts: [{ text: buildUserPrompt(req) }] },
            ],
            generationConfig: {
              // This layer rephrases fixed facts; sampling variety has no
              // upside and would undermine reproducible explanations.
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
            },
          }),
        },
      );

      // Status only — never the body, which can echo the request.
      if (!res.ok) {
        console.error(
          `[ballast/assistant] gemini HTTP ${res.status}; falling back to deterministic explanation`,
        );
        return null;
      }

      const payload = await res.json();
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== "string") return null;

      return normalizeResult(JSON.parse(text));
    } catch (err) {
      console.error(
        "[ballast/assistant] gemini call failed; falling back to deterministic explanation:",
        err instanceof Error ? err.message : String(err),
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Gemini keys do not share OpenAI's `sk-` shape; check length and reject the
 * template placeholder pattern instead. */
function isRealGeminiKey(key: string | undefined): key is string {
  return (
    typeof key === "string" &&
    key.length > 20 &&
    !/your-|xxx|placeholder|TODO/i.test(key)
  );
}

/**
 * Provider selection: explicit override first, then whichever key is actually
 * configured (Gemini preferred — it is the project's chosen provider,
 * DECISIONS.md #034/#035), then unavailable.
 *
 * Chosen over hardcoding one provider so that adding or removing a key is
 * pure configuration: no code edit, no redeploy of logic, and the OpenAI
 * implementation stays available rather than being deleted. Set
 * BALLAST_LLM_PROVIDER=gemini|openai|none to force a specific path.
 */
export function getExplanationProvider(): ExplanationProvider {
  const forced = process.env.BALLAST_LLM_PROVIDER?.toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (forced === "none") {
    return new UnavailableProvider(
      "Explanation layer disabled by BALLAST_LLM_PROVIDER=none. Answers are " +
        "composed deterministically from engine output.",
    );
  }

  if (forced !== "openai" && isRealGeminiKey(geminiKey)) {
    return new GeminiProvider(
      geminiKey,
      process.env.GEMINI_MODEL ?? GEMINI_DEFAULT_MODEL,
    );
  }

  if (forced !== "gemini" && isRealKey(openaiKey)) {
    return new OpenAIProvider(
      openaiKey,
      process.env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL,
    );
  }

  return new UnavailableProvider(
    "No LLM API key is configured (checked GEMINI_API_KEY and " +
      "OPENAI_API_KEY). Answers are composed deterministically from engine " +
      "output.",
  );
}
