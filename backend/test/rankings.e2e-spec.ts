import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { truncateAllTables } from './setup/test-db';
import { createFirm, createFirmScore, FirmType } from './setup/fixtures';

const DIMENSIONS = [
  'ai_talent_density',
  'public_ai_activity',
  'ai_hiring_velocity',
  'thought_leadership',
  'vendor_partnerships',
  'portfolio_ai_strategy',
] as const;

function makeDimensionScores(
  overrides: Partial<
    Record<(typeof DIMENSIONS)[number], { raw_score: number }>
  > = {},
) {
  const base: Record<string, unknown> = {};
  for (const dim of DIMENSIONS) {
    const raw_score = overrides[dim]?.raw_score ?? 50;
    base[dim] = {
      dimension: dim,
      raw_score,
      weighted_score: raw_score * 0.2,
      signal_count: 3,
      max_possible: 100,
    };
  }
  return base;
}

describe('Rankings (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let server: App;

  beforeAll(async () => {
    const ctx: TestContext = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
  });

  describe('GET /api/rankings', () => {
    it('should return empty results when no scores exist', async () => {
      const { body } = await request(server).get('/api/rankings').expect(200);

      expect(body).toMatchObject({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        total_pages: 0,
        score_version: 'v1.0',
      });
    });

    it('should return firms ranked by descending overall_score', async () => {
      const firmLow = await createFirm(module, { name: 'Low Scorer' });
      const firmMid = await createFirm(module, { name: 'Mid Scorer' });
      const firmHigh = await createFirm(module, { name: 'High Scorer' });

      await createFirmScore(module, firmLow.id, { overall_score: 30 });
      await createFirmScore(module, firmMid.id, { overall_score: 60 });
      await createFirmScore(module, firmHigh.id, { overall_score: 90 });

      const { body } = await request(server).get('/api/rankings').expect(200);

      expect(body.items).toHaveLength(3);
      expect(body.total).toBe(3);

      expect(body.items[0].firm_name).toBe('High Scorer');
      expect(body.items[0].overall_score).toBe(90);
      expect(body.items[0].rank).toBe(1);

      expect(body.items[1].firm_name).toBe('Mid Scorer');
      expect(body.items[1].overall_score).toBe(60);
      expect(body.items[1].rank).toBe(2);

      expect(body.items[2].firm_name).toBe('Low Scorer');
      expect(body.items[2].overall_score).toBe(30);
      expect(body.items[2].rank).toBe(3);
    });

    it('should include all expected fields on each ranking item', async () => {
      const firm = await createFirm(module, {
        name: 'Full Fields Firm',
        firm_type: FirmType.BUYOUT,
        aum_usd: 5_000_000_000,
      });
      const dimScores = makeDimensionScores();
      await createFirmScore(module, firm.id, {
        overall_score: 85,
        signal_count: 12,
        dimension_scores: dimScores as any,
      });

      const { body } = await request(server).get('/api/rankings').expect(200);

      const item = body.items[0];
      expect(item.firm_id).toBe(firm.id);
      expect(item.firm_name).toBe('Full Fields Firm');
      expect(item.firm_type).toBe(FirmType.BUYOUT);
      expect(item.overall_score).toBe(85);
      expect(item.signal_count).toBe(12);
      expect(item.score_version).toBe('v1.0');
      expect(item.scored_at).toBeDefined();
      expect(item.dimension_scores).toEqual(dimScores);
      expect(item.rank).toBe(1);
    });

    it('should only include active firms', async () => {
      const activeFirm = await createFirm(module, {
        name: 'Active Firm',
        is_active: true,
      });
      const inactiveFirm = await createFirm(module, {
        name: 'Inactive Firm',
        is_active: false,
      });

      await createFirmScore(module, activeFirm.id, { overall_score: 50 });
      await createFirmScore(module, inactiveFirm.id, { overall_score: 99 });

      const { body } = await request(server).get('/api/rankings').expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.items[0].firm_id).toBe(activeFirm.id);
    });

    it('should filter by firm_type', async () => {
      const buyoutFirm = await createFirm(module, {
        name: 'Buyout Fund',
        firm_type: FirmType.BUYOUT,
      });
      const creditFirm = await createFirm(module, {
        name: 'Credit Fund',
        firm_type: FirmType.CREDIT,
      });

      await createFirmScore(module, buyoutFirm.id, { overall_score: 70 });
      await createFirmScore(module, creditFirm.id, { overall_score: 80 });

      const { body } = await request(server)
        .get('/api/rankings')
        .query({ firm_type: FirmType.BUYOUT })
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.items[0].firm_id).toBe(buyoutFirm.id);
      expect(body.items[0].firm_type).toBe(FirmType.BUYOUT);
    });

    it('should filter by score_version', async () => {
      const firm = await createFirm(module);

      await createFirmScore(module, firm.id, {
        overall_score: 60,
        score_version: 'v1.0',
      });

      const firmB = await createFirm(module);
      await createFirmScore(module, firmB.id, {
        overall_score: 80,
        score_version: 'v2.0',
      });

      const { body: bodyV1 } = await request(server)
        .get('/api/rankings')
        .query({ score_version: 'v1.0' })
        .expect(200);

      expect(bodyV1.items).toHaveLength(1);
      expect(bodyV1.score_version).toBe('v1.0');
      expect(bodyV1.items[0].firm_id).toBe(firm.id);

      const { body: bodyV2 } = await request(server)
        .get('/api/rankings')
        .query({ score_version: 'v2.0' })
        .expect(200);

      expect(bodyV2.items).toHaveLength(1);
      expect(bodyV2.score_version).toBe('v2.0');
      expect(bodyV2.items[0].firm_id).toBe(firmB.id);
    });

    it('should default to score_version v1.0 when not specified', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, {
        overall_score: 50,
        score_version: 'v1.0',
      });

      const { body } = await request(server).get('/api/rankings').expect(200);

      expect(body.score_version).toBe('v1.0');
      expect(body.items).toHaveLength(1);
    });

    describe('pagination', () => {
      it('should paginate results with custom page and limit', async () => {
        const firms = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            createFirm(module, { name: `Firm ${i}` }),
          ),
        );

        await Promise.all(
          firms.map((f, i) =>
            createFirmScore(module, f.id, {
              overall_score: 100 - i * 10,
            }),
          ),
        );

        const { body: page1 } = await request(server)
          .get('/api/rankings')
          .query({ page: 1, limit: 2 })
          .expect(200);

        expect(page1.items).toHaveLength(2);
        expect(page1.total).toBe(5);
        expect(page1.page).toBe(1);
        expect(page1.limit).toBe(2);
        expect(page1.total_pages).toBe(3);
        expect(page1.items[0].rank).toBe(1);
        expect(page1.items[1].rank).toBe(2);

        const { body: page2 } = await request(server)
          .get('/api/rankings')
          .query({ page: 2, limit: 2 })
          .expect(200);

        expect(page2.items).toHaveLength(2);
        expect(page2.page).toBe(2);
        expect(page2.items[0].rank).toBe(3);
        expect(page2.items[1].rank).toBe(4);

        const { body: page3 } = await request(server)
          .get('/api/rankings')
          .query({ page: 3, limit: 2 })
          .expect(200);

        expect(page3.items).toHaveLength(1);
        expect(page3.items[0].rank).toBe(5);
      });

      it('should return empty items for a page beyond total_pages', async () => {
        const firm = await createFirm(module);
        await createFirmScore(module, firm.id, { overall_score: 50 });

        const { body } = await request(server)
          .get('/api/rankings')
          .query({ page: 99, limit: 10 })
          .expect(200);

        expect(body.items).toHaveLength(0);
        expect(body.total).toBe(1);
      });

      it('should default to page 1 and limit 50', async () => {
        const firm = await createFirm(module);
        await createFirmScore(module, firm.id, { overall_score: 50 });

        const { body } = await request(server).get('/api/rankings').expect(200);

        expect(body.page).toBe(1);
        expect(body.limit).toBe(50);
      });
    });

    it('should compute ranks correctly across pages', async () => {
      const firms = await Promise.all(
        Array.from({ length: 4 }, (_, i) =>
          createFirm(module, { name: `Ranked ${i}` }),
        ),
      );

      await Promise.all(
        firms.map((f, i) =>
          createFirmScore(module, f.id, {
            overall_score: 100 - i * 20,
          }),
        ),
      );

      const { body: p1 } = await request(server)
        .get('/api/rankings')
        .query({ page: 1, limit: 2 })
        .expect(200);

      const { body: p2 } = await request(server)
        .get('/api/rankings')
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(p1.items.map((i: any) => i.rank)).toEqual([1, 2]);
      expect(p2.items.map((i: any) => i.rank)).toEqual([3, 4]);
    });
  });

  describe('GET /api/rankings/dimensions', () => {
    it('should return all 6 dimensions', async () => {
      const firm = await createFirm(module);
      await createFirmScore(module, firm.id, {
        overall_score: 80,
        dimension_scores: makeDimensionScores() as any,
      });

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      expect(body).toHaveLength(6);
      const returnedDimensions = body.map((d: any) => d.dimension);
      for (const dim of DIMENSIONS) {
        expect(returnedDimensions).toContain(dim);
      }
    });

    it('should return top_firms sorted by dimension raw_score descending', async () => {
      const firmA = await createFirm(module, { name: 'Dim Leader A' });
      const firmB = await createFirm(module, { name: 'Dim Leader B' });
      const firmC = await createFirm(module, { name: 'Dim Leader C' });

      await createFirmScore(module, firmA.id, {
        overall_score: 70,
        dimension_scores: makeDimensionScores({
          ai_talent_density: { raw_score: 95 },
        }) as any,
      });
      await createFirmScore(module, firmB.id, {
        overall_score: 80,
        dimension_scores: makeDimensionScores({
          ai_talent_density: { raw_score: 60 },
        }) as any,
      });
      await createFirmScore(module, firmC.id, {
        overall_score: 60,
        dimension_scores: makeDimensionScores({
          ai_talent_density: { raw_score: 85 },
        }) as any,
      });

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      const talentDim = body.find(
        (d: any) => d.dimension === 'ai_talent_density',
      );
      expect(talentDim).toBeDefined();
      expect(talentDim.top_firms.length).toBeGreaterThanOrEqual(3);

      const firmNames = talentDim.top_firms.map((f: any) => f.firm_name);
      expect(firmNames).toContain('Dim Leader A');
      expect(firmNames).toContain('Dim Leader B');
      expect(firmNames).toContain('Dim Leader C');

      const leaderA = talentDim.top_firms.find(
        (f: any) => f.firm_name === 'Dim Leader A',
      );
      expect(leaderA.dimension_score).toBe(95);
    });

    it('should include firm_id, firm_name, dimension_score, overall_score in top_firms', async () => {
      const firm = await createFirm(module, { name: 'Detail Firm' });
      await createFirmScore(module, firm.id, {
        overall_score: 77,
        dimension_scores: makeDimensionScores({
          vendor_partnerships: { raw_score: 88 },
        }) as any,
      });

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      const vendorDim = body.find(
        (d: any) => d.dimension === 'vendor_partnerships',
      );
      const entry = vendorDim.top_firms.find((f: any) => f.firm_id === firm.id);

      expect(entry).toBeDefined();
      expect(entry.firm_name).toBe('Detail Firm');
      expect(entry.dimension_score).toBe(88);
      expect(entry.overall_score).toBe(77);
    });

    it('should limit top_firms to at most 10 per dimension', async () => {
      const firms = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          createFirm(module, { name: `Bulk Firm ${i}` }),
        ),
      );

      await Promise.all(
        firms.map((f, i) =>
          createFirmScore(module, f.id, {
            overall_score: 100 - i,
            dimension_scores: makeDimensionScores({
              thought_leadership: { raw_score: 100 - i },
            }) as any,
          }),
        ),
      );

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      for (const dim of body) {
        expect(dim.top_firms.length).toBeLessThanOrEqual(10);
      }
    });

    it('should filter by score_version', async () => {
      const firmV1 = await createFirm(module, { name: 'V1 Firm' });
      await createFirmScore(module, firmV1.id, {
        overall_score: 70,
        score_version: 'v1.0',
        dimension_scores: makeDimensionScores() as any,
      });

      const firmV2 = await createFirm(module, { name: 'V2 Firm' });
      await createFirmScore(module, firmV2.id, {
        overall_score: 90,
        score_version: 'v2.0',
        dimension_scores: makeDimensionScores() as any,
      });

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .query({ score_version: 'v2.0' })
        .expect(200);

      for (const dim of body) {
        const firmIds = dim.top_firms.map((f: any) => f.firm_id);
        expect(firmIds).toContain(firmV2.id);
        expect(firmIds).not.toContain(firmV1.id);
      }
    });

    it('should return empty top_firms when no scores exist', async () => {
      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      expect(body).toHaveLength(6);
      for (const dim of body) {
        expect(dim.top_firms).toEqual([]);
      }
    });

    it('should omit a dimension from top_firms if a firm has no score for it', async () => {
      const firm = await createFirm(module, { name: 'Partial Dims' });
      await createFirmScore(module, firm.id, {
        overall_score: 60,
        dimension_scores: {
          ai_talent_density: {
            dimension: 'ai_talent_density',
            raw_score: 90,
            weighted_score: 22.5,
            signal_count: 2,
            max_possible: 100,
          },
        } as any,
      });

      const { body } = await request(server)
        .get('/api/rankings/dimensions')
        .expect(200);

      const talentDim = body.find(
        (d: any) => d.dimension === 'ai_talent_density',
      );
      expect(talentDim.top_firms.some((f: any) => f.firm_id === firm.id)).toBe(
        true,
      );

      const hiringDim = body.find(
        (d: any) => d.dimension === 'ai_hiring_velocity',
      );
      expect(hiringDim.top_firms.some((f: any) => f.firm_id === firm.id)).toBe(
        false,
      );
    });
  });
});
