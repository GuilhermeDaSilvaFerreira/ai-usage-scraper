import { registerAs } from '@nestjs/config';

export const llmConfig = registerAs('llm', () => ({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  provider: process.env.LLM_PROVIDER,
}));
