import { registerAs } from '@nestjs/config';

export const pipelineConfig = registerAs('pipeline', () => ({
  autoChain: process.env.PIPELINE_AUTO_CHAIN !== 'false',
  cronSchedule: process.env.PIPELINE_CRON_SCHEDULE || '0 0 * * 0',
  seedTarget: parseInt(process.env.PIPELINE_SEED_TARGET || '50', 10),
}));
