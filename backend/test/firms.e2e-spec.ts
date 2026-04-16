import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { truncateAllTables, getRepo } from './setup/test-db';
import {
  createFirm,
  createFirmSignal,
  createFirmScore,
  createScoreEvidence,
  createFirmAlias,
  createDataSource,
  createPerson,
  FirmType,
  SignalType,
  ExtractionMethod,
} from './setup/fixtures';
import { Firm } from '../src/database/entities/firm.entity';
import { FirmSignal } from '../src/database/entities/firm-signal.entity';
import { FirmScore } from '../src/database/entities/firm-score.entity';

describe('FirmsController (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    module = ctx.module;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
  });

  describe('GET /api/firms', () => {
    it('should return empty paginated result when no firms exist', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/api/firms')
        .expect(200);

      expect(body).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        total_pages: 0,
      });
    });

    it('should return firms with default pagination', async () => {
      const firm = await createFirm(module, { name: 'Apollo Global' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms')
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(25);
      expect(body.total_pages).toBe(1);
      expect(body.items[0].id).toBe(firm.id);
      expect(body.items[0].name).toBe('Apollo Global');
    });

    it('should return correct response structure for firm items', async () => {
      await createFirm(module, {
        name: 'Ares Management',
        website: 'https://ares.com',
        aum_usd: 5_000_000_000,
        firm_type: FirmType.CREDIT,
        headquarters: 'Los Angeles',
        founded_year: 1997,
        description: 'Alternative investment manager',
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms')
        .expect(200);

      const item = body.items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name', 'Ares Management');
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('website', 'https://ares.com');
      expect(item).toHaveProperty('firm_type', FirmType.CREDIT);
      expect(item).toHaveProperty('headquarters', 'Los Angeles');
      expect(item).toHaveProperty('founded_year', 1997);
      expect(item).toHaveProperty('is_active', true);
      expect(item).toHaveProperty('created_at');
      expect(item).toHaveProperty('updated_at');
    });

    it('should paginate results correctly', async () => {
      for (let i = 0; i < 5; i++) {
        await createFirm(module, {
          name: `Firm ${String.fromCharCode(65 + i)}`,
        });
      }

      const { body: page1 } = await request(app.getHttpServer())
        .get('/api/firms?page=1&limit=2')
        .expect(200);

      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);
      expect(page1.total_pages).toBe(3);

      const { body: page3 } = await request(app.getHttpServer())
        .get('/api/firms?page=3&limit=2')
        .expect(200);

      expect(page3.items).toHaveLength(1);
      expect(page3.page).toBe(3);
    });

    it('should return empty items for page beyond total_pages', async () => {
      await createFirm(module);

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?page=99')
        .expect(200);

      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(1);
      expect(body.page).toBe(99);
    });

    it('should filter firms by search (case-insensitive)', async () => {
      await createFirm(module, { name: 'Blackstone Group' });
      await createFirm(module, { name: 'KKR Capital' });
      await createFirm(module, { name: 'Blackrock Partners' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?search=black')
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      const names = body.items.map((i: any) => i.name);
      expect(names).toContain('Blackstone Group');
      expect(names).toContain('Blackrock Partners');
    });

    it('should return empty results for search with no matches', async () => {
      await createFirm(module, { name: 'Apollo Capital' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?search=nonexistent')
        .expect(200);

      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('should filter firms by firm_type', async () => {
      await createFirm(module, {
        name: 'Buyout Firm',
        firm_type: FirmType.BUYOUT,
      });
      await createFirm(module, {
        name: 'Credit Firm',
        firm_type: FirmType.CREDIT,
      });
      await createFirm(module, {
        name: 'Growth Firm',
        firm_type: FirmType.GROWTH,
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?firm_type=credit')
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Credit Firm');
      expect(body.items[0].firm_type).toBe(FirmType.CREDIT);
    });

    it('should filter firms by min_aum', async () => {
      await createFirm(module, { name: 'Small Fund', aum_usd: 500_000_000 });
      await createFirm(module, { name: 'Big Fund', aum_usd: 5_000_000_000 });
      await createFirm(module, { name: 'Mega Fund', aum_usd: 50_000_000_000 });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?min_aum=1000000000')
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(2);
      const names = body.items.map((i: any) => i.name);
      expect(names).toContain('Big Fund');
      expect(names).toContain('Mega Fund');
    });

    it('should apply multiple filters simultaneously', async () => {
      await createFirm(module, {
        name: 'Ares Credit',
        firm_type: FirmType.CREDIT,
        aum_usd: 10_000_000_000,
      });
      await createFirm(module, {
        name: 'Small Credit',
        firm_type: FirmType.CREDIT,
        aum_usd: 100_000_000,
      });
      await createFirm(module, {
        name: 'Ares Buyout',
        firm_type: FirmType.BUYOUT,
        aum_usd: 10_000_000_000,
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?search=ares&firm_type=credit&min_aum=1000000000')
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Ares Credit');
    });

    it('should sort by name ASC by default', async () => {
      await createFirm(module, { name: 'Zebra Capital' });
      await createFirm(module, { name: 'Alpha Partners' });
      await createFirm(module, { name: 'Meridian Fund' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms')
        .expect(200);

      expect(body.items[0].name).toBe('Alpha Partners');
      expect(body.items[1].name).toBe('Meridian Fund');
      expect(body.items[2].name).toBe('Zebra Capital');
    });

    it('should sort by name DESC', async () => {
      await createFirm(module, { name: 'Zebra Capital' });
      await createFirm(module, { name: 'Alpha Partners' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?sort_by=name&sort_order=DESC')
        .expect(200);

      expect(body.items[0].name).toBe('Zebra Capital');
      expect(body.items[1].name).toBe('Alpha Partners');
    });

    it('should sort by aum_usd ASC', async () => {
      await createFirm(module, { name: 'Big', aum_usd: 10_000_000_000 });
      await createFirm(module, { name: 'Small', aum_usd: 500_000_000 });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?sort_by=aum_usd&sort_order=ASC')
        .expect(200);

      expect(body.items[0].name).toBe('Small');
      expect(body.items[1].name).toBe('Big');
    });

    it('should sort by aum_usd DESC', async () => {
      await createFirm(module, { name: 'Big', aum_usd: 10_000_000_000 });
      await createFirm(module, { name: 'Small', aum_usd: 500_000_000 });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?sort_by=aum_usd&sort_order=DESC')
        .expect(200);

      expect(body.items[0].name).toBe('Big');
      expect(body.items[1].name).toBe('Small');
    });

    it('should sort by created_at DESC', async () => {
      const older = await createFirm(module, { name: 'Older Firm' });
      await new Promise((r) => setTimeout(r, 50));
      const newer = await createFirm(module, { name: 'Newer Firm' });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms?sort_by=created_at&sort_order=DESC')
        .expect(200);

      expect(body.items[0].id).toBe(newer.id);
      expect(body.items[1].id).toBe(older.id);
    });

    it('should match DB state accurately', async () => {
      const firm = await createFirm(module, {
        name: 'DB Check Firm',
        firm_type: FirmType.GROWTH,
        aum_usd: 2_000_000_000,
      });

      const { body } = await request(app.getHttpServer())
        .get('/api/firms')
        .expect(200);

      const repo = getRepo(module, Firm);
      const dbFirm = await repo.findOneByOrFail({ id: firm.id });

      expect(body.items[0].id).toBe(dbFirm.id);
      expect(body.items[0].name).toBe(dbFirm.name);
      expect(body.items[0].firm_type).toBe(dbFirm.firm_type);
    });
  });

  describe('GET /api/firms/:id', () => {
    it('should return firm detail with relations', async () => {
      const firm = await createFirm(module, { name: 'Detail Firm' });
      await createFirmAlias(module, firm.id, 'DF Holdings');
      await createPerson(module, firm.id, { full_name: 'Jane Doe' });
      const score = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 85,
      });
      const signal = await createFirmSignal(module, firm.id);
      await createScoreEvidence(module, score.id, signal.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}`)
        .expect(200);

      expect(body.id).toBe(firm.id);
      expect(body.name).toBe('Detail Firm');
      expect(body.aliases).toHaveLength(1);
      expect(body.aliases[0].alias_name).toBe('DF Holdings');
      expect(body.people).toHaveLength(1);
      expect(body.people[0].full_name).toBe('Jane Doe');
      expect(body.scores).toHaveLength(1);
      expect(body.latest_score).toBeDefined();
      expect(body.latest_score.id).toBe(score.id);
      expect(body.latest_score.overall_score).toBe(85);
      expect(body.latest_score.evidence).toHaveLength(1);
    });

    it('should return latest_score as most recent by scored_at', async () => {
      const firm = await createFirm(module);
      const olderDate = new Date('2024-01-01');
      const newerDate = new Date('2025-06-15');

      await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 60,
        scored_at: olderDate,
      });
      const latestScore = await createFirmScore(module, firm.id, {
        score_version: 'v2.0',
        overall_score: 90,
        scored_at: newerDate,
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}`)
        .expect(200);

      expect(body.scores).toHaveLength(2);
      expect(body.latest_score.id).toBe(latestScore.id);
      expect(body.latest_score.score_version).toBe('v2.0');
      expect(body.latest_score.overall_score).toBe(90);
    });

    it('should return latest_score as null when firm has no scores', async () => {
      const firm = await createFirm(module);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}`)
        .expect(200);

      expect(body.scores).toHaveLength(0);
      expect(body.latest_score).toBeNull();
    });

    it('should return empty arrays for aliases and people when none exist', async () => {
      const firm = await createFirm(module);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}`)
        .expect(200);

      expect(body.aliases).toEqual([]);
      expect(body.people).toEqual([]);
    });

    it('should return 404 for non-existent firm', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await request(app.getHttpServer())
        .get(`/api/firms/${fakeId}`)
        .expect(404);
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/firms/not-a-uuid')
        .expect(400);
    });

    it('should match DB state for firm detail', async () => {
      const firm = await createFirm(module, { name: 'DB Detail' });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}`)
        .expect(200);

      const repo = getRepo(module, Firm);
      const dbFirm = await repo.findOneByOrFail({ id: firm.id });

      expect(body.id).toBe(dbFirm.id);
      expect(body.name).toBe(dbFirm.name);
      expect(body.slug).toBe(dbFirm.slug);
    });
  });

  describe('GET /api/firms/:id/signals', () => {
    it('should return paginated signals for a firm', async () => {
      const firm = await createFirm(module);
      const ds = await createDataSource(module);
      const signal = await createFirmSignal(module, firm.id, {
        data_source_id: ds.id,
        signal_type: SignalType.AI_NEWS_MENTION,
        extraction_method: ExtractionMethod.HEURISTIC,
        extraction_confidence: 0.9,
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals`)
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.items[0].id).toBe(signal.id);
      expect(body.items[0].firm_id).toBe(firm.id);
      expect(body.items[0].signal_type).toBe(SignalType.AI_NEWS_MENTION);
      expect(body.items[0].extraction_method).toBe(ExtractionMethod.HEURISTIC);
      expect(body.items[0].extraction_confidence).toBe(0.9);
      expect(body.items[0].data_source).toBeDefined();
      expect(body.items[0].data_source.id).toBe(ds.id);
    });

    it('should paginate signals correctly', async () => {
      const firm = await createFirm(module);
      for (let i = 0; i < 5; i++) {
        await createFirmSignal(module, firm.id);
      }

      const { body: page1 } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals?page=1&limit=2`)
        .expect(200);

      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(2);

      const { body: page3 } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals?page=3&limit=2`)
        .expect(200);

      expect(page3.items).toHaveLength(1);
    });

    it('should return signals ordered by collected_at DESC', async () => {
      const firm = await createFirm(module);
      const older = await createFirmSignal(module, firm.id, {
        collected_at: new Date('2024-01-01'),
      });
      const newer = await createFirmSignal(module, firm.id, {
        collected_at: new Date('2025-06-01'),
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals`)
        .expect(200);

      expect(body.items[0].id).toBe(newer.id);
      expect(body.items[1].id).toBe(older.id);
    });

    it('should return empty results when firm has no signals', async () => {
      const firm = await createFirm(module);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals`)
        .expect(200);

      expect(body.items).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('should not return signals from another firm', async () => {
      const firmA = await createFirm(module);
      const firmB = await createFirm(module);
      await createFirmSignal(module, firmA.id);
      await createFirmSignal(module, firmB.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firmA.id}/signals`)
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].firm_id).toBe(firmA.id);
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/firms/bad-id/signals')
        .expect(400);
    });

    it('should match DB signal count', async () => {
      const firm = await createFirm(module);
      await createFirmSignal(module, firm.id);
      await createFirmSignal(module, firm.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/signals`)
        .expect(200);

      const repo = getRepo(module, FirmSignal);
      const dbCount = await repo.count({ where: { firm_id: firm.id } });

      expect(body.total).toBe(dbCount);
      expect(body.items).toHaveLength(dbCount);
    });
  });

  describe('GET /api/firms/:id/scores', () => {
    it('should return all scores for a firm', async () => {
      const firm = await createFirm(module);
      const score1 = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 70,
        scored_at: new Date('2024-01-01'),
      });
      const score2 = await createFirmScore(module, firm.id, {
        score_version: 'v2.0',
        overall_score: 85,
        scored_at: new Date('2025-01-01'),
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores`)
        .expect(200);

      expect(body).toHaveLength(2);
      expect(body[0].id).toBe(score2.id);
      expect(body[0].score_version).toBe('v2.0');
      expect(body[0].overall_score).toBe(85);
      expect(body[1].id).toBe(score1.id);
      expect(body[1].score_version).toBe('v1.0');
    });

    it('should return empty array when firm has no scores', async () => {
      const firm = await createFirm(module);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores`)
        .expect(200);

      expect(body).toEqual([]);
    });

    it('should not include scores from another firm', async () => {
      const firmA = await createFirm(module);
      const firmB = await createFirm(module);
      await createFirmScore(module, firmA.id, { score_version: 'v1.0' });
      await createFirmScore(module, firmB.id, { score_version: 'v1.0' });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firmA.id}/scores`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].firm_id).toBe(firmA.id);
    });

    it('should return correct score structure', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 75.5,
        rank: 3,
        signal_count: 10,
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores`)
        .expect(200);

      const score = body[0];
      expect(score).toHaveProperty('id');
      expect(score).toHaveProperty('firm_id', firm.id);
      expect(score).toHaveProperty('score_version', 'v1.0');
      expect(score).toHaveProperty('overall_score', 75.5);
      expect(score).toHaveProperty('rank', 3);
      expect(score).toHaveProperty('signal_count', 10);
      expect(score).toHaveProperty('dimension_scores');
      expect(score).toHaveProperty('scoring_parameters');
      expect(score).toHaveProperty('scored_at');
      expect(score).toHaveProperty('created_at');
    });

    it('should return 400 for invalid UUID format', async () => {
      await request(app.getHttpServer())
        .get('/api/firms/invalid/scores')
        .expect(400);
    });

    it('should match DB state', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, { score_version: 'v1.0' });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores`)
        .expect(200);

      const repo = getRepo(module, FirmScore);
      const dbScores = await repo.find({ where: { firm_id: firm.id } });

      expect(body).toHaveLength(dbScores.length);
      expect(body[0].id).toBe(dbScores[0].id);
    });
  });

  describe('GET /api/firms/:id/scores/:version', () => {
    it('should return a specific score version with evidence', async () => {
      const firm = await createFirm(module);
      const signal = await createFirmSignal(module, firm.id);
      const score = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 80,
      });
      const evidence = await createScoreEvidence(module, score.id, signal.id, {
        dimension: 'ai_talent_density',
        weight_applied: 0.25,
        points_contributed: 15,
        reasoning: 'Strong AI hiring signals',
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(200);

      expect(body.id).toBe(score.id);
      expect(body.score_version).toBe('v1.0');
      expect(body.overall_score).toBe(80);
      expect(body.evidence).toHaveLength(1);
      expect(body.evidence[0].id).toBe(evidence.id);
      expect(body.evidence[0].dimension).toBe('ai_talent_density');
      expect(body.evidence[0].weight_applied).toBe(0.25);
      expect(body.evidence[0].points_contributed).toBe(15);
      expect(body.evidence[0].reasoning).toBe('Strong AI hiring signals');
    });

    it('should include signal relation in evidence', async () => {
      const firm = await createFirm(module);
      const signal = await createFirmSignal(module, firm.id, {
        signal_type: SignalType.AI_NEWS_MENTION,
      });
      const score = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
      });
      await createScoreEvidence(module, score.id, signal.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(200);

      expect(body.evidence[0].signal).toBeDefined();
      expect(body.evidence[0].signal.id).toBe(signal.id);
      expect(body.evidence[0].signal.signal_type).toBe(
        SignalType.AI_NEWS_MENTION,
      );
    });

    it('should return score with empty evidence array when no evidence exists', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
        overall_score: 50,
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(200);

      expect(body.score_version).toBe('v1.0');
      expect(body.evidence).toEqual([]);
    });

    it('should return 404 for non-existent version', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, { score_version: 'v1.0' });

      await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v99.0`)
        .expect(404);
    });

    it('should return 404 when firm exists but has no scores at all', async () => {
      const firm = await createFirm(module);

      await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(404);
    });

    it('should return 400 for invalid UUID format on firm id', async () => {
      await request(app.getHttpServer())
        .get('/api/firms/not-uuid/scores/v1.0')
        .expect(400);
    });

    it('should return multiple evidence entries for a single score', async () => {
      const firm = await createFirm(module);
      const signal1 = await createFirmSignal(module, firm.id);
      const signal2 = await createFirmSignal(module, firm.id);
      const score = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
      });
      await createScoreEvidence(module, score.id, signal1.id, {
        dimension: 'ai_talent_density',
      });
      await createScoreEvidence(module, score.id, signal2.id, {
        dimension: 'public_ai_activity',
      });

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(200);

      expect(body.evidence).toHaveLength(2);
      const dimensions = body.evidence.map((e: any) => e.dimension);
      expect(dimensions).toContain('ai_talent_density');
      expect(dimensions).toContain('public_ai_activity');
    });

    it('should match DB state for score and evidence', async () => {
      const firm = await createFirm(module);
      const signal = await createFirmSignal(module, firm.id);
      const score = await createFirmScore(module, firm.id, {
        score_version: 'v1.0',
      });
      await createScoreEvidence(module, score.id, signal.id);

      const { body } = await request(app.getHttpServer())
        .get(`/api/firms/${firm.id}/scores/v1.0`)
        .expect(200);

      const scoreRepo = getRepo(module, FirmScore);
      const dbScore = await scoreRepo.findOneOrFail({
        where: { id: score.id },
        relations: ['evidence'],
      });

      expect(body.id).toBe(dbScore.id);
      expect(body.overall_score).toBe(dbScore.overall_score);
      expect(body.evidence).toHaveLength(dbScore.evidence.length);
    });
  });
});
