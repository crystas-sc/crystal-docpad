export interface PromptLanguageModelSession {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
  contextUsage?: number;
  contextWindow?: number;
  measureContextUsage?: (input: string) => Promise<number>;
  inputUsage?: number;
  inputQuota?: number;
  measureInputUsage?: (input: string) => Promise<number>;
}

export interface PromptLanguageModelStatic {
  availability: () => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  create: (options?: {
    systemPrompt?: string;
    initialPrompts?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  }) => Promise<PromptLanguageModelSession>;
}

declare global {
  interface Window {
    LanguageModel?: PromptLanguageModelStatic;
    ai?: {
      languageModel?: PromptLanguageModelStatic;
    };
  }
}

export function getPromptApi(): PromptLanguageModelStatic | null {
  if (typeof window === 'undefined') return null;
  if (window.LanguageModel && typeof window.LanguageModel.availability === 'function') {
    return window.LanguageModel;
  }
  if (window.ai?.languageModel && typeof window.ai.languageModel.availability === 'function') {
    return window.ai.languageModel;
  }
  return null;
}

export async function promptWithStats(
  session: PromptLanguageModelSession,
  input: string,
  label: string,
): Promise<string> {
  const usageBefore = session.contextUsage ?? session.inputUsage ?? 0;
  const contextWindow = session.contextWindow ?? session.inputQuota;
  const measureFn = session.measureContextUsage ?? session.measureInputUsage;
  const promptTokens = measureFn ? await measureFn.call(session, input) : undefined;

  const startTime = performance.now();
  const reply = await session.prompt(input);
  const durationMs = Math.round(performance.now() - startTime);

  const sessionUsedTokens = session.contextUsage ?? session.inputUsage;
  const turnTokens =
    sessionUsedTokens !== undefined ? sessionUsedTokens - usageBefore : undefined;

  console.log(`[PromptAPI:${label}] reply:`, reply);
  console.table({
    durationMs,
    promptTokens,
    turnTokens,
    sessionUsedTokens,
    contextWindow,
    remainingTokens:
      contextWindow !== undefined && sessionUsedTokens !== undefined
        ? contextWindow - sessionUsedTokens
        : undefined,
  });

  return reply;
}
