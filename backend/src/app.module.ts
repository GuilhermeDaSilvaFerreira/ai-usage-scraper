import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  appConfig,
  databaseConfig,
  llmConfig,
  redisConfig,
  scrapersConfig,
} from './config/index.js';
import { FirmsModule } from './modules/firms/firms.module.js';
import { PeopleModule } from './modules/people/people.module.js';
import { RankingsModule } from './modules/rankings/rankings.module.js';
import { PipelineModule } from './modules/pipeline/pipeline.module.js';
import { ExaModule } from './integrations/exa/exa.module.js';
import { OpenAIModule } from './integrations/openai/openai.module.js';
import { AnthropicModule } from './integrations/anthropic/anthropic.module.js';
import { SecEdgarModule } from './integrations/sec-edgar/sec-edgar.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, llmConfig, databaseConfig, redisConfig, scrapersConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<TypeOrmModuleOptions>('database')!,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    ExaModule,
    OpenAIModule,
    AnthropicModule,
    SecEdgarModule,
    FirmsModule,
    PeopleModule,
    RankingsModule,
    PipelineModule,
  ],
})
export class AppModule {}
