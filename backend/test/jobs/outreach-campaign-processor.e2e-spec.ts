import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { createTestApp, TestContext } from '../setup/test-app';
import { truncateAllTables, getRepo } from '../setup/test-db';
import {
  createFirm,
  createPerson,
  createOutreachCampaign,
  OutreachStatus,
  RoleCategory,
} from '../setup/fixtures';
import { OutreachCampaign } from '../../src/database/entities/outreach-campaign.entity';
import { OutreachService } from '../../src/modules/sales-pipeline/outreach/outreach.service';

describe('OutreachCampaignProcessor / createDefaultCampaignsForFirm E2E', () => {
  let app: INestApplication;
  let module: TestingModule;
  let outreachService: OutreachService;

  beforeAll(async () => {
    const ctx: TestContext = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    outreachService = module.get(OutreachService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
  });

  describe('createDefaultCampaignsForFirm', () => {
    it('should create campaigns for all people when none exist', async () => {
      const firm = await createFirm(module);
      const person1 = await createPerson(module, firm.id);
      const person2 = await createPerson(module, firm.id);
      const person3 = await createPerson(module, firm.id);

      const created = await outreachService.createDefaultCampaignsForFirm(
        firm.id,
      );

      expect(created).toBe(3);

      const repo = getRepo(module, OutreachCampaign);
      const campaigns = await repo.find({
        where: { firm_id: firm.id },
        order: { created_at: 'ASC' },
      });

      expect(campaigns).toHaveLength(3);

      const personIds = campaigns.map((c) => c.person_id).sort();
      expect(personIds).toEqual([person1.id, person2.id, person3.id].sort());

      for (const campaign of campaigns) {
        expect(campaign.firm_id).toBe(firm.id);
        expect(campaign.status).toBe(OutreachStatus.NOT_CONTACTED);
      }
    });

    it('should skip people who already have campaigns', async () => {
      const firm = await createFirm(module);
      const person1 = await createPerson(module, firm.id);
      const person2 = await createPerson(module, firm.id);
      const person3 = await createPerson(module, firm.id);

      await createOutreachCampaign(module, firm.id, person1.id);

      const created = await outreachService.createDefaultCampaignsForFirm(
        firm.id,
      );

      expect(created).toBe(2);

      const repo = getRepo(module, OutreachCampaign);
      const campaigns = await repo.find({ where: { firm_id: firm.id } });

      expect(campaigns).toHaveLength(3);

      const newCampaignPersonIds = campaigns
        .filter((c) => c.person_id !== person1.id)
        .map((c) => c.person_id)
        .sort();
      expect(newCampaignPersonIds).toEqual([person2.id, person3.id].sort());
    });

    it('should return 0 when the firm has no people', async () => {
      const firm = await createFirm(module);

      const created = await outreachService.createDefaultCampaignsForFirm(
        firm.id,
      );

      expect(created).toBe(0);

      const repo = getRepo(module, OutreachCampaign);
      const count = await repo.count({ where: { firm_id: firm.id } });
      expect(count).toBe(0);
    });

    it('should return 0 when all people already have campaigns', async () => {
      const firm = await createFirm(module);
      const person1 = await createPerson(module, firm.id);
      const person2 = await createPerson(module, firm.id);

      await createOutreachCampaign(module, firm.id, person1.id);
      await createOutreachCampaign(module, firm.id, person2.id);

      const created = await outreachService.createDefaultCampaignsForFirm(
        firm.id,
      );

      expect(created).toBe(0);

      const repo = getRepo(module, OutreachCampaign);
      const campaigns = await repo.find({ where: { firm_id: firm.id } });
      expect(campaigns).toHaveLength(2);
    });

    it('should not interfere with campaigns from other firms', async () => {
      const firm1 = await createFirm(module, { name: 'Firm Alpha' });
      const firm2 = await createFirm(module, { name: 'Firm Beta' });

      const person1a = await createPerson(module, firm1.id);
      const person1b = await createPerson(module, firm1.id);
      const person2a = await createPerson(module, firm2.id);

      const existingCampaign = await createOutreachCampaign(
        module,
        firm2.id,
        person2a.id,
        { status: OutreachStatus.FIRST_CONTACT_SENT },
      );

      const created = await outreachService.createDefaultCampaignsForFirm(
        firm1.id,
      );

      expect(created).toBe(2);

      const repo = getRepo(module, OutreachCampaign);

      const firm1Campaigns = await repo.find({
        where: { firm_id: firm1.id },
      });
      expect(firm1Campaigns).toHaveLength(2);

      const firm1PersonIds = firm1Campaigns.map((c) => c.person_id).sort();
      expect(firm1PersonIds).toEqual([person1a.id, person1b.id].sort());

      for (const campaign of firm1Campaigns) {
        expect(campaign.status).toBe(OutreachStatus.NOT_CONTACTED);
      }

      const firm2Campaigns = await repo.find({
        where: { firm_id: firm2.id },
      });
      expect(firm2Campaigns).toHaveLength(1);
      expect(firm2Campaigns[0].id).toBe(existingCampaign.id);
      expect(firm2Campaigns[0].person_id).toBe(person2a.id);
      expect(firm2Campaigns[0].status).toBe(OutreachStatus.FIRST_CONTACT_SENT);
    });
  });
});
