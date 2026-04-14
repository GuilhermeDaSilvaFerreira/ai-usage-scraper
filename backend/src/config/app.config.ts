import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  extractionConfidenceThreshold: parseFloat(
    process.env.EXTRACTION_CONFIDENCE_THRESHOLD || '0.5',
  ),
}));
