import { DataSource as TypeOrmDataSource, Repository } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

const TABLE_NAMES = [
  'score_evidence',
  'firm_scores',
  'firm_signals',
  'outreach_campaigns',
  'scrape_jobs',
  'firm_aliases',
  'people',
  'data_sources',
  'firms',
];

export async function truncateAllTables(module: TestingModule): Promise<void> {
  const dataSource = module.get<TypeOrmDataSource>(getDataSourceToken());
  await dataSource.query(`TRUNCATE TABLE ${TABLE_NAMES.join(', ')} CASCADE`);
}

export function getRepo<T extends object>(
  module: TestingModule,
  entity: new (...args: any[]) => T,
): Repository<T> {
  return module.get<Repository<T>>(getRepositoryToken(entity));
}
