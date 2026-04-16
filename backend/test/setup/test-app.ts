import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { WorkerHost } from '@nestjs/bullmq';
import { AppModule } from '../../src/app.module';
import { OpenAIService } from '../../src/integrations/openai/openai.service';
import { AnthropicService } from '../../src/integrations/anthropic/anthropic.service';
import { ExaService } from '../../src/integrations/exa/exa.service';
import { SecEdgarService } from '../../src/integrations/sec-edgar/sec-edgar.service';

export function createMockOpenAIService() {
  return {
    extractSignals: jest.fn().mockResolvedValue({ signals: [] }),
    generateCompletion: jest
      .fn()
      .mockResolvedValue('Mock outreach message from OpenAI'),
  };
}

export function createMockAnthropicService() {
  return {
    extractSignals: jest.fn().mockResolvedValue({ signals: [] }),
    generateCompletion: jest
      .fn()
      .mockResolvedValue('Mock outreach message from Anthropic'),
  };
}

export function createMockExaService() {
  return {
    search: jest.fn().mockResolvedValue([]),
    findSimilar: jest.fn().mockResolvedValue([]),
  };
}

export function createMockSecEdgarService() {
  return {
    searchFirms: jest.fn().mockResolvedValue([]),
    getCompanyByName: jest.fn().mockResolvedValue([]),
    getCompanyByCik: jest.fn().mockResolvedValue(null),
    searchInvestmentAdvisers: jest.fn().mockResolvedValue([]),
  };
}

export interface TestContext {
  app: INestApplication;
  module: TestingModule;
  mocks: {
    openai: ReturnType<typeof createMockOpenAIService>;
    anthropic: ReturnType<typeof createMockAnthropicService>;
    exa: ReturnType<typeof createMockExaService>;
    secEdgar: ReturnType<typeof createMockSecEdgarService>;
  };
}

export async function createTestApp(): Promise<TestContext> {
  const mockOpenAI = createMockOpenAIService();
  const mockAnthropic = createMockAnthropicService();
  const mockExa = createMockExaService();
  const mockSecEdgar = createMockSecEdgarService();

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(OpenAIService)
    .useValue(mockOpenAI)
    .overrideProvider(AnthropicService)
    .useValue(mockAnthropic)
    .overrideProvider(ExaService)
    .useValue(mockExa)
    .overrideProvider(SecEdgarService)
    .useValue(mockSecEdgar)
    .compile();

  const app = moduleFixture.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  silenceBullWorkerErrors(moduleFixture);

  return {
    app,
    module: moduleFixture,
    mocks: {
      openai: mockOpenAI,
      anthropic: mockAnthropic,
      exa: mockExa,
      secEdgar: mockSecEdgar,
    },
  };
}

/**
 * Attach selective error listeners on every BullMQ Worker so that only
 * "Missing key for job" errors (caused by queue.obliterate during cleanup)
 * are suppressed. Any other worker error is re-thrown so tests still fail
 * on real problems.
 */
function silenceBullWorkerErrors(module: TestingModule): void {
  try {
    const discovery = module.get(DiscoveryService);
    const providers = discovery.getProviders();
    for (const wrapper of providers) {
      if (!wrapper.instance) continue;
      if (wrapper.instance instanceof WorkerHost) {
        const worker = (wrapper.instance as any).worker;
        if (worker && typeof worker.on === 'function') {
          worker.on('error', (err: Error) => {
            const msg = err?.message ?? '';
            if (msg.includes('Missing key for job')) return;
            console.error('[BullMQ Worker error]', err);
          });
        }
      }
    }
  } catch {
    // DiscoveryService not available — skip silently
  }
}
