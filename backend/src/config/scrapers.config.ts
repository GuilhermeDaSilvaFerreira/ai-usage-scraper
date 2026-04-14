import { registerAs } from '@nestjs/config';

export const scrapersConfig = registerAs('scrapers', () => ({
  exaApiKey: process.env.EXA_API_KEY,
  secEdgarUserAgent: process.env.SEC_EDGAR_USER_AGENT,
}));
