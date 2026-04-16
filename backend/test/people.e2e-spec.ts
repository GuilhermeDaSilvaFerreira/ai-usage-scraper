import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { truncateAllTables, getRepo } from './setup/test-db';
import {
  createFirm,
  createPerson,
  createDataSource,
  RoleCategory,
} from './setup/fixtures';
import { Person } from '../src/database/entities/person.entity';

describe('People E2E', () => {
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

  describe('PeopleController - GET /api/people', () => {
    it('should return empty paginated result when no people exist', async () => {
      const { body } = await request(server).get('/api/people').expect(200);

      expect(body).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        total_pages: 0,
      });
    });

    it('should return people with firm and data_source relations', async () => {
      const firm = await createFirm(module);
      const ds = await createDataSource(module);
      const person = await createPerson(module, firm.id, {
        data_source_id: ds.id,
      });

      const { body } = await request(server).get('/api/people').expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe(person.id);
      expect(body.items[0].full_name).toBe(person.full_name);
      expect(body.items[0].firm).toBeDefined();
      expect(body.items[0].firm.id).toBe(firm.id);
      expect(body.items[0].data_source).toBeDefined();
      expect(body.items[0].data_source.id).toBe(ds.id);
    });

    it('should return people ordered by full_name ASC', async () => {
      const firm = await createFirm(module);
      await createPerson(module, firm.id, { full_name: 'Zara Williams' });
      await createPerson(module, firm.id, { full_name: 'Alice Smith' });
      await createPerson(module, firm.id, { full_name: 'Mike Johnson' });

      const { body } = await request(server).get('/api/people').expect(200);

      expect(body.items).toHaveLength(3);
      expect(body.items[0].full_name).toBe('Alice Smith');
      expect(body.items[1].full_name).toBe('Mike Johnson');
      expect(body.items[2].full_name).toBe('Zara Williams');
    });

    describe('pagination', () => {
      it('should use default page=1, limit=25', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id);

        const { body } = await request(server).get('/api/people').expect(200);

        expect(body.page).toBe(1);
        expect(body.limit).toBe(25);
      });

      it('should paginate with custom page and limit', async () => {
        const firm = await createFirm(module);
        for (let i = 0; i < 5; i++) {
          await createPerson(module, firm.id, {
            full_name: `Person ${String.fromCharCode(65 + i)}`,
          });
        }

        const { body: page1 } = await request(server)
          .get('/api/people')
          .query({ page: 1, limit: 2 })
          .expect(200);

        expect(page1.items).toHaveLength(2);
        expect(page1.total).toBe(5);
        expect(page1.page).toBe(1);
        expect(page1.limit).toBe(2);
        expect(page1.total_pages).toBe(3);
        expect(page1.items[0].full_name).toBe('Person A');
        expect(page1.items[1].full_name).toBe('Person B');

        const { body: page2 } = await request(server)
          .get('/api/people')
          .query({ page: 2, limit: 2 })
          .expect(200);

        expect(page2.items).toHaveLength(2);
        expect(page2.items[0].full_name).toBe('Person C');
        expect(page2.items[1].full_name).toBe('Person D');

        const { body: page3 } = await request(server)
          .get('/api/people')
          .query({ page: 3, limit: 2 })
          .expect(200);

        expect(page3.items).toHaveLength(1);
        expect(page3.items[0].full_name).toBe('Person E');
      });

      it('should return empty items for page beyond total_pages', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id);

        const { body } = await request(server)
          .get('/api/people')
          .query({ page: 99 })
          .expect(200);

        expect(body.items).toHaveLength(0);
        expect(body.total).toBe(1);
      });
    });

    describe('search filter', () => {
      it('should filter by search term (ILIKE on full_name)', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, { full_name: 'John Doe' });
        await createPerson(module, firm.id, { full_name: 'Jane Smith' });
        await createPerson(module, firm.id, { full_name: 'Bob Johnson' });

        const { body } = await request(server)
          .get('/api/people')
          .query({ search: 'john' })
          .expect(200);

        expect(body.items).toHaveLength(2);
        const names = body.items.map((p: any) => p.full_name);
        expect(names).toContain('John Doe');
        expect(names).toContain('Bob Johnson');
        expect(names).not.toContain('Jane Smith');
      });

      it('should be case-insensitive', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, { full_name: 'Alice WONDER' });

        const { body } = await request(server)
          .get('/api/people')
          .query({ search: 'alice wonder' })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].full_name).toBe('Alice WONDER');
      });

      it('should return empty when search matches nothing', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, { full_name: 'John Doe' });

        const { body } = await request(server)
          .get('/api/people')
          .query({ search: 'zzzznotfound' })
          .expect(200);

        expect(body.items).toHaveLength(0);
        expect(body.total).toBe(0);
      });
    });

    describe('role_category filter', () => {
      it('should filter by role_category', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, {
          full_name: 'Data Lead',
          role_category: RoleCategory.HEAD_OF_DATA,
        });
        await createPerson(module, firm.id, {
          full_name: 'Tech Lead',
          role_category: RoleCategory.HEAD_OF_TECH,
        });
        await createPerson(module, firm.id, {
          full_name: 'AI Person',
          role_category: RoleCategory.AI_HIRE,
        });

        const { body } = await request(server)
          .get('/api/people')
          .query({ role_category: RoleCategory.HEAD_OF_DATA })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].full_name).toBe('Data Lead');
        expect(body.items[0].role_category).toBe(RoleCategory.HEAD_OF_DATA);
      });

      it('should return empty when no people match role_category', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, {
          role_category: RoleCategory.OTHER,
        });

        const { body } = await request(server)
          .get('/api/people')
          .query({ role_category: RoleCategory.SPEAKER })
          .expect(200);

        expect(body.items).toHaveLength(0);
        expect(body.total).toBe(0);
      });
    });

    describe('firm_id filter', () => {
      it('should filter by firm_id', async () => {
        const firmA = await createFirm(module, { name: 'Firm A' });
        const firmB = await createFirm(module, { name: 'Firm B' });
        await createPerson(module, firmA.id, { full_name: 'Person at A' });
        await createPerson(module, firmB.id, { full_name: 'Person at B' });

        const { body } = await request(server)
          .get('/api/people')
          .query({ firm_id: firmA.id })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].full_name).toBe('Person at A');
        expect(body.items[0].firm_id).toBe(firmA.id);
      });
    });

    describe('combined filters', () => {
      it('should combine search and role_category', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id, {
          full_name: 'Alice Data',
          role_category: RoleCategory.HEAD_OF_DATA,
        });
        await createPerson(module, firm.id, {
          full_name: 'Alice Tech',
          role_category: RoleCategory.HEAD_OF_TECH,
        });
        await createPerson(module, firm.id, {
          full_name: 'Bob Data',
          role_category: RoleCategory.HEAD_OF_DATA,
        });

        const { body } = await request(server)
          .get('/api/people')
          .query({ search: 'Alice', role_category: RoleCategory.HEAD_OF_DATA })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].full_name).toBe('Alice Data');
      });

      it('should combine search, role_category, and firm_id', async () => {
        const firmA = await createFirm(module);
        const firmB = await createFirm(module);
        await createPerson(module, firmA.id, {
          full_name: 'Alice Data',
          role_category: RoleCategory.HEAD_OF_DATA,
        });
        await createPerson(module, firmB.id, {
          full_name: 'Alice Data Clone',
          role_category: RoleCategory.HEAD_OF_DATA,
        });

        const { body } = await request(server)
          .get('/api/people')
          .query({
            search: 'Alice',
            role_category: RoleCategory.HEAD_OF_DATA,
            firm_id: firmA.id,
          })
          .expect(200);

        expect(body.items).toHaveLength(1);
        expect(body.items[0].firm_id).toBe(firmA.id);
      });
    });

    describe('DB state assertions', () => {
      it('should reflect the correct number of records in the database', async () => {
        const firm = await createFirm(module);
        await createPerson(module, firm.id);
        await createPerson(module, firm.id);
        await createPerson(module, firm.id);

        const repo = getRepo(module, Person);
        const count = await repo.count();
        expect(count).toBe(3);

        const { body } = await request(server).get('/api/people').expect(200);

        expect(body.total).toBe(count);
      });
    });
  });

  describe('FirmPeopleController - GET /api/firms/:firmId/people', () => {
    it('should return people for a specific firm', async () => {
      const firm = await createFirm(module);
      const person = await createPerson(module, firm.id, {
        full_name: 'Firm Member',
      });

      const { body } = await request(server)
        .get(`/api/firms/${firm.id}/people`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(person.id);
      expect(body[0].full_name).toBe('Firm Member');
      expect(body[0].firm_id).toBe(firm.id);
    });

    it('should include data_source relation', async () => {
      const firm = await createFirm(module);
      const ds = await createDataSource(module);
      await createPerson(module, firm.id, { data_source_id: ds.id });

      const { body } = await request(server)
        .get(`/api/firms/${firm.id}/people`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].data_source).toBeDefined();
      expect(body[0].data_source.id).toBe(ds.id);
    });

    it('should return only people belonging to the specified firm', async () => {
      const firmA = await createFirm(module);
      const firmB = await createFirm(module);
      await createPerson(module, firmA.id, { full_name: 'Person at A' });
      await createPerson(module, firmB.id, { full_name: 'Person at B' });

      const { body } = await request(server)
        .get(`/api/firms/${firmA.id}/people`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].full_name).toBe('Person at A');

      const repo = getRepo(module, Person);
      const totalPeople = await repo.count();
      expect(totalPeople).toBe(2);
    });

    it('should return people ordered by role_category ASC, then full_name ASC', async () => {
      const firm = await createFirm(module);
      await createPerson(module, firm.id, {
        full_name: 'Zara',
        role_category: RoleCategory.AI_HIRE,
      });
      await createPerson(module, firm.id, {
        full_name: 'Alice',
        role_category: RoleCategory.AI_HIRE,
      });
      await createPerson(module, firm.id, {
        full_name: 'Mike',
        role_category: RoleCategory.HEAD_OF_DATA,
      });

      const { body } = await request(server)
        .get(`/api/firms/${firm.id}/people`)
        .expect(200);

      expect(body).toHaveLength(3);
      const names = body.map((p: any) => p.full_name);
      expect(names).toEqual(['Mike', 'Alice', 'Zara']);
    });

    it('should return empty array when firm has no people', async () => {
      const firm = await createFirm(module);

      const { body } = await request(server)
        .get(`/api/firms/${firm.id}/people`)
        .expect(200);

      expect(body).toEqual([]);
    });

    it('should return empty array for a valid UUID with no matching firm', async () => {
      const { body } = await request(server)
        .get('/api/firms/00000000-0000-0000-0000-000000000000/people')
        .expect(200);

      expect(body).toEqual([]);
    });

    it('should return 400 for invalid UUID', async () => {
      await request(server).get('/api/firms/not-a-uuid/people').expect(400);
    });

    it('should return 400 for malformed UUID format', async () => {
      const { body } = await request(server)
        .get('/api/firms/12345/people')
        .expect(400);

      expect(body.statusCode).toBe(400);
      expect(body.message).toBeDefined();
    });
  });
});
