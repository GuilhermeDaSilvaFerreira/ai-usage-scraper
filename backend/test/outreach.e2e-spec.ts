import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { truncateAllTables, getRepo } from './setup/test-db';
import {
  createFirm,
  createPerson,
  createFirmSignal,
  createFirmScore,
  createOutreachCampaign,
  createDataSource,
  OutreachStatus,
  ContactPlatform,
  FirmType,
  RoleCategory,
  SignalType,
} from './setup/fixtures';
import { OutreachCampaign } from '../src/database/entities/outreach-campaign.entity';

describe('Outreach (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let ctx: TestContext;
  let server: App;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    module = ctx.module;
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(module);
    jest.clearAllMocks();
  });

  describe('GET /api/outreach', () => {
    it('should return empty paginated list when no campaigns exist', async () => {
      const { body } = await request(server).get('/api/outreach').expect(200);

      expect(body).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        total_pages: 0,
      });
    });

    it('should return campaigns with firm and person relations', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server).get('/api/outreach').expect(200);

      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].firm).toBeDefined();
      expect(body.items[0].firm.id).toBe(firm.id);
      expect(body.items[0].person).toBeDefined();
      expect(body.items[0].person.id).toBe(person.id);
    });

    it('should paginate results', async () => {
      const firm = await createFirm(module);
      for (let i = 0; i < 3; i++) {
        const person = await createPerson(module, firm.id);
        await createOutreachCampaign(module, firm.id, person.id);
      }

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(2);
      expect(body.total_pages).toBe(2);

      const { body: page2 } = await request(server)
        .get('/api/outreach')
        .query({ page: 2, limit: 2 })
        .expect(200);

      expect(page2.items).toHaveLength(1);
      expect(page2.page).toBe(2);
    });

    it('should filter by search (person full_name ILIKE)', async () => {
      const firm = await createFirm(module);
      const alice = await createPerson(module, firm.id, {
        full_name: 'Alice Johnson',
      });
      const bob = await createPerson(module, firm.id, {
        full_name: 'Bob Smith',
      });
      await createOutreachCampaign(module, firm.id, alice.id);
      await createOutreachCampaign(module, firm.id, bob.id);

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ search: 'alice' })
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0].person.full_name).toBe('Alice Johnson');
    });

    it('should filter by firm_name (ILIKE)', async () => {
      const firmA = await createFirm(module, { name: 'Acme Capital' });
      const firmB = await createFirm(module, { name: 'Beta Ventures' });
      const personA = await createPerson(module, firmA.id);
      const personB = await createPerson(module, firmB.id);
      await createOutreachCampaign(module, firmA.id, personA.id);
      await createOutreachCampaign(module, firmB.id, personB.id);

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ firm_name: 'acme' })
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0].firm.name).toBe('Acme Capital');
    });

    it('should filter by status', async () => {
      const firm = await createFirm(module);
      const p1 = await createPerson(module, firm.id);
      const p2 = await createPerson(module, firm.id);
      await createOutreachCampaign(module, firm.id, p1.id, {
        status: OutreachStatus.NOT_CONTACTED,
      });
      await createOutreachCampaign(module, firm.id, p2.id, {
        status: OutreachStatus.REPLIED,
      });

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ status: OutreachStatus.REPLIED })
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0].status).toBe(OutreachStatus.REPLIED);
    });

    it('should filter by contact_platform', async () => {
      const firm = await createFirm(module);
      const p1 = await createPerson(module, firm.id);
      const p2 = await createPerson(module, firm.id);
      await createOutreachCampaign(module, firm.id, p1.id, {
        contact_platform: ContactPlatform.EMAIL,
      });
      await createOutreachCampaign(module, firm.id, p2.id, {
        contact_platform: ContactPlatform.LINKEDIN,
      });

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ contact_platform: ContactPlatform.EMAIL })
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0].contact_platform).toBe(ContactPlatform.EMAIL);
    });

    it('should filter by firm_id', async () => {
      const firmA = await createFirm(module);
      const firmB = await createFirm(module);
      const personA = await createPerson(module, firmA.id);
      const personB = await createPerson(module, firmB.id);
      await createOutreachCampaign(module, firmA.id, personA.id);
      await createOutreachCampaign(module, firmB.id, personB.id);

      const { body } = await request(server)
        .get('/api/outreach')
        .query({ firm_id: firmA.id })
        .expect(200);

      expect(body.total).toBe(1);
      expect(body.items[0].firm_id).toBe(firmA.id);
    });

    it('should order by updated_at DESC', async () => {
      const firm = await createFirm(module);
      const p1 = await createPerson(module, firm.id);
      const p2 = await createPerson(module, firm.id);
      const older = await createOutreachCampaign(module, firm.id, p1.id);
      const newer = await createOutreachCampaign(module, firm.id, p2.id);

      const { body } = await request(server).get('/api/outreach').expect(200);

      expect(body.items[0].id).toBe(newer.id);
      expect(body.items[1].id).toBe(older.id);
    });
  });

  describe('GET /api/outreach/stats', () => {
    it('should return all statuses defaulting to 0', async () => {
      const { body } = await request(server)
        .get('/api/outreach/stats')
        .expect(200);

      for (const status of Object.values(OutreachStatus)) {
        expect(body[status]).toBe(0);
      }
    });

    it('should return correct counts per status', async () => {
      const firm = await createFirm(module);
      const p1 = await createPerson(module, firm.id);
      const p2 = await createPerson(module, firm.id);
      const p3 = await createPerson(module, firm.id);
      await createOutreachCampaign(module, firm.id, p1.id, {
        status: OutreachStatus.NOT_CONTACTED,
      });
      await createOutreachCampaign(module, firm.id, p2.id, {
        status: OutreachStatus.NOT_CONTACTED,
      });
      await createOutreachCampaign(module, firm.id, p3.id, {
        status: OutreachStatus.REPLIED,
      });

      const { body } = await request(server)
        .get('/api/outreach/stats')
        .expect(200);

      expect(body[OutreachStatus.NOT_CONTACTED]).toBe(2);
      expect(body[OutreachStatus.REPLIED]).toBe(1);
      expect(body[OutreachStatus.FIRST_CONTACT_SENT]).toBe(0);
      expect(body[OutreachStatus.CLOSED_WON]).toBe(0);
    });
  });

  describe('GET /api/outreach/firms/:firmId', () => {
    it('should return campaigns for a firm with person relation', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .get(`/api/outreach/firms/${firm.id}`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].firm_id).toBe(firm.id);
      expect(body[0].person).toBeDefined();
      expect(body[0].person.id).toBe(person.id);
    });

    it('should return empty array when firm has no campaigns', async () => {
      const firm = await createFirm(module);

      const { body } = await request(server)
        .get(`/api/outreach/firms/${firm.id}`)
        .expect(200);

      expect(body).toEqual([]);
    });

    it('should order by updated_at DESC', async () => {
      const firm = await createFirm(module);
      const p1 = await createPerson(module, firm.id);
      const p2 = await createPerson(module, firm.id);
      const older = await createOutreachCampaign(module, firm.id, p1.id);
      const newer = await createOutreachCampaign(module, firm.id, p2.id);

      const { body } = await request(server)
        .get(`/api/outreach/firms/${firm.id}`)
        .expect(200);

      expect(body[0].id).toBe(newer.id);
      expect(body[1].id).toBe(older.id);
    });

    it('should not include campaigns from other firms', async () => {
      const firmA = await createFirm(module);
      const firmB = await createFirm(module);
      const personA = await createPerson(module, firmA.id);
      const personB = await createPerson(module, firmB.id);
      await createOutreachCampaign(module, firmA.id, personA.id);
      await createOutreachCampaign(module, firmB.id, personB.id);

      const { body } = await request(server)
        .get(`/api/outreach/firms/${firmA.id}`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].firm_id).toBe(firmA.id);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server).get('/api/outreach/firms/not-a-uuid').expect(400);
    });
  });

  describe('GET /api/outreach/people/:personId/campaign', () => {
    it('should return campaign with firm and person relations', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .get(`/api/outreach/people/${person.id}/campaign`)
        .expect(200);

      expect(body.id).toBe(campaign.id);
      expect(body.firm).toBeDefined();
      expect(body.firm.id).toBe(firm.id);
      expect(body.person).toBeDefined();
      expect(body.person.id).toBe(person.id);
    });

    it('should return 404 when no campaign exists for person', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);

      await request(server)
        .get(`/api/outreach/people/${person.id}/campaign`)
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server)
        .get('/api/outreach/people/not-a-uuid/campaign')
        .expect(400);
    });
  });

  describe('POST /api/outreach/:id/generate-message', () => {
    it('should generate and save an outreach message', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const dataSource = await createDataSource(module);
      await createFirmSignal(module, firm.id, {
        data_source_id: dataSource.id,
      });
      await createFirmScore(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .post(`/api/outreach/${campaign.id}/generate-message`)
        .expect(201);

      expect(body.outreach_message).toBe(
        'Mock outreach message from Anthropic',
      );
      expect(body.firm).toBeDefined();
      expect(body.person).toBeDefined();

      expect(ctx.mocks.anthropic.generateCompletion).toHaveBeenCalledTimes(1);
      expect(ctx.mocks.anthropic.generateCompletion).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(person.full_name),
      );

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.outreach_message).toBe(
        'Mock outreach message from Anthropic',
      );
    });

    it('should return 404 for non-existent campaign', async () => {
      await request(server)
        .post(
          '/api/outreach/00000000-0000-0000-0000-000000000000/generate-message',
        )
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server)
        .post('/api/outreach/not-a-uuid/generate-message')
        .expect(400);
    });
  });

  describe('GET /api/outreach/:id', () => {
    it('should return a single campaign with firm and person relations', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(
        module,
        firm.id,
        person.id,
        {
          contact_platform: ContactPlatform.EMAIL,
          notes: 'Initial outreach',
        },
      );

      const { body } = await request(server)
        .get(`/api/outreach/${campaign.id}`)
        .expect(200);

      expect(body.id).toBe(campaign.id);
      expect(body.status).toBe(OutreachStatus.NOT_CONTACTED);
      expect(body.contact_platform).toBe(ContactPlatform.EMAIL);
      expect(body.notes).toBe('Initial outreach');
      expect(body.firm).toBeDefined();
      expect(body.firm.id).toBe(firm.id);
      expect(body.person).toBeDefined();
      expect(body.person.id).toBe(person.id);
    });

    it('should return 404 for non-existent campaign', async () => {
      await request(server)
        .get('/api/outreach/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server).get('/api/outreach/not-a-uuid').expect(400);
    });
  });

  describe('POST /api/outreach', () => {
    it('should create a campaign with default status NOT_CONTACTED', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);

      const { body } = await request(server)
        .post('/api/outreach')
        .send({
          firm_id: firm.id,
          person_id: person.id,
        })
        .expect(201);

      expect(body.firm_id).toBe(firm.id);
      expect(body.person_id).toBe(person.id);
      expect(body.status).toBe(OutreachStatus.NOT_CONTACTED);
      expect(body.firm).toBeDefined();
      expect(body.person).toBeDefined();

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: body.id });
      expect(saved).toBeDefined();
      expect(saved!.status).toBe(OutreachStatus.NOT_CONTACTED);
      expect(saved!.firm_id).toBe(firm.id);
      expect(saved!.person_id).toBe(person.id);
    });

    it('should create a campaign with optional fields', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);

      const { body } = await request(server)
        .post('/api/outreach')
        .send({
          firm_id: firm.id,
          person_id: person.id,
          contacted_by: 'John Doe',
          contact_platform: ContactPlatform.LINKEDIN,
          notes: 'Met at conference',
        })
        .expect(201);

      expect(body.contacted_by).toBe('John Doe');
      expect(body.contact_platform).toBe(ContactPlatform.LINKEDIN);
      expect(body.notes).toBe('Met at conference');

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: body.id });
      expect(saved!.contacted_by).toBe('John Doe');
      expect(saved!.contact_platform).toBe(ContactPlatform.LINKEDIN);
      expect(saved!.notes).toBe('Met at conference');
    });

    it('should return 400 when firm_id is missing', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);

      await request(server)
        .post('/api/outreach')
        .send({ person_id: person.id })
        .expect(400);
    });

    it('should return 400 when person_id is missing', async () => {
      const firm = await createFirm(module);

      await request(server)
        .post('/api/outreach')
        .send({ firm_id: firm.id })
        .expect(400);
    });

    it('should return 400 for invalid UUID in firm_id', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);

      await request(server)
        .post('/api/outreach')
        .send({ firm_id: 'not-uuid', person_id: person.id })
        .expect(400);
    });
  });

  describe('PATCH /api/outreach/:id', () => {
    it('should update campaign status', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.REPLIED })
        .expect(200);

      expect(body.status).toBe(OutreachStatus.REPLIED);
      expect(body.last_status_change_at).toBeDefined();

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.status).toBe(OutreachStatus.REPLIED);
      expect(saved!.last_status_change_at).not.toBeNull();
    });

    it('should set first_contact_at when status changes to FIRST_CONTACT_SENT', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.FIRST_CONTACT_SENT })
        .expect(200);

      expect(body.first_contact_at).toBeDefined();
      expect(body.last_status_change_at).toBeDefined();

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.first_contact_at).not.toBeNull();
    });

    it('should not overwrite first_contact_at on subsequent FIRST_CONTACT_SENT updates', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.FIRST_CONTACT_SENT })
        .expect(200);

      const repo = getRepo(module, OutreachCampaign);
      const afterFirst = await repo.findOneBy({ id: campaign.id });
      const originalContactAt = afterFirst!.first_contact_at;

      await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.FIRST_CONTACT_SENT })
        .expect(200);

      const afterSecond = await repo.findOneBy({ id: campaign.id });
      expect(afterSecond!.first_contact_at!.getTime()).toBe(
        originalContactAt!.getTime(),
      );
    });

    it('should update contact_platform', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ contact_platform: ContactPlatform.PHONE })
        .expect(200);

      expect(body.contact_platform).toBe(ContactPlatform.PHONE);
    });

    it('should set contacted_by only if not already set', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(
        module,
        firm.id,
        person.id,
        { contacted_by: 'Original Analyst' },
      );

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ contacted_by: 'New Analyst' })
        .expect(200);

      expect(body.contacted_by).toBe('Original Analyst');

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.contacted_by).toBe('Original Analyst');
    });

    it('should set contacted_by when it was previously null', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ contacted_by: 'New Analyst' })
        .expect(200);

      expect(body.contacted_by).toBe('New Analyst');

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.contacted_by).toBe('New Analyst');
    });

    it('should update notes', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ notes: 'Follow up next week' })
        .expect(200);

      expect(body.notes).toBe('Follow up next week');
    });

    it('should update outreach_message', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ outreach_message: 'Custom outreach message content' })
        .expect(200);

      expect(body.outreach_message).toBe('Custom outreach message content');

      const repo = getRepo(module, OutreachCampaign);
      const saved = await repo.findOneBy({ id: campaign.id });
      expect(saved!.outreach_message).toBe('Custom outreach message content');
    });

    it('should set last_status_change_at on every status change', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.FIRST_CONTACT_SENT })
        .expect(200);

      const repo = getRepo(module, OutreachCampaign);
      const afterFirst = await repo.findOneBy({ id: campaign.id });
      const firstChangeAt = afterFirst!.last_status_change_at;

      await new Promise((r) => setTimeout(r, 50));

      await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: OutreachStatus.FOLLOW_UP_SENT })
        .expect(200);

      const afterSecond = await repo.findOneBy({ id: campaign.id });
      expect(afterSecond!.last_status_change_at!.getTime()).toBeGreaterThan(
        firstChangeAt!.getTime(),
      );
    });

    it('should return campaign with firm and person relations', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      const { body } = await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ notes: 'test' })
        .expect(200);

      expect(body.firm).toBeDefined();
      expect(body.firm.id).toBe(firm.id);
      expect(body.person).toBeDefined();
      expect(body.person.id).toBe(person.id);
    });

    it('should return 404 for non-existent campaign', async () => {
      await request(server)
        .patch('/api/outreach/00000000-0000-0000-0000-000000000000')
        .send({ status: OutreachStatus.REPLIED })
        .expect(404);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server)
        .patch('/api/outreach/not-a-uuid')
        .send({ status: OutreachStatus.REPLIED })
        .expect(400);
    });

    it('should return 400 for invalid status value', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id);
      const campaign = await createOutreachCampaign(module, firm.id, person.id);

      await request(server)
        .patch(`/api/outreach/${campaign.id}`)
        .send({ status: 'invalid_status' })
        .expect(400);
    });
  });
});
