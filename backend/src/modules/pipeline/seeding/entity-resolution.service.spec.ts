import { EntityResolutionService } from './entity-resolution.service';
import { SeedFirmCandidate } from './sources/sec-edgar.source';
import { FirmType } from '../../../common/enums';

describe('EntityResolutionService', () => {
  let service: EntityResolutionService;

  beforeEach(() => {
    service = new EntityResolutionService();
  });

  describe('deduplicate', () => {
    it('should return empty array for empty candidates', () => {
      const result = service.deduplicate([]);
      expect(result).toEqual([]);
    });

    it('should return one merged result for a single candidate', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Apollo Global Management', source: 'sec_edgar' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Apollo Global Management');
      expect(result[0].aliases).toEqual(['Apollo Global Management']);
      expect(result[0].sources).toEqual(['sec_edgar']);
    });

    it('should merge two candidates with the same normalized name', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Apollo Global Management LLC',
          website: 'https://apollo.com',
          source: 'sec_edgar',
        },
        {
          name: 'Apollo Global Management, Inc.',
          headquarters: 'New York, NY',
          source: 'exa:url1',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aliases).toContain('Apollo Global Management LLC');
      expect(result[0].aliases).toContain('Apollo Global Management, Inc.');
      expect(result[0].sources).toContain('sec_edgar');
      expect(result[0].sources).toContain('exa:url1');
    });

    it('should merge two candidates with the same domain', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Blackstone Group',
          website: 'https://www.blackstone.com',
          source: 'sec_edgar',
        },
        {
          name: 'Blackstone Inc',
          website: 'https://blackstone.com/about',
          source: 'exa:url2',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aliases).toContain('Blackstone Group');
      expect(result[0].aliases).toContain('Blackstone Inc');
    });

    it('should merge two candidates with similar names via Levenshtein', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Warburg Pincus', source: 'sec_edgar' },
        { name: 'Warburg Pincu', source: 'exa:url3' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aliases).toContain('Warburg Pincus');
      expect(result[0].aliases).toContain('Warburg Pincu');
    });

    it('should NOT merge two completely different candidates', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Apollo Global', source: 'sec_edgar' },
        { name: 'Blackstone Group', source: 'exa:url4' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Apollo Global');
      expect(result[1].name).toBe('Blackstone Group');
    });

    it('should fill in missing fields during merge', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'KKR Capital',
          source: 'sec_edgar',
          firmType: FirmType.BUYOUT,
        },
        {
          name: 'KKR Capital LLC',
          website: 'https://kkr.com',
          headquarters: 'New York, NY',
          secCrdNumber: '12345',
          aumUsd: 500_000_000_000,
          source: 'exa:url5',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].website).toBe('https://kkr.com');
      expect(result[0].headquarters).toBe('New York, NY');
      expect(result[0].secCrdNumber).toBe('12345');
      expect(result[0].aumUsd).toBe(500_000_000_000);
      expect(result[0].firmType).toBe(FirmType.BUYOUT);
    });

    it('should take higher aumUsd when both have values', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Carlyle Group',
          aumUsd: 300_000_000_000,
          source: 'sec_edgar',
        },
        {
          name: 'Carlyle Group LP',
          aumUsd: 400_000_000_000,
          source: 'exa:url6',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aumUsd).toBe(400_000_000_000);
    });

    it('should NOT overwrite existing aumUsd with a lower value', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Carlyle Group',
          aumUsd: 400_000_000_000,
          source: 'sec_edgar',
        },
        {
          name: 'Carlyle Group LP',
          aumUsd: 300_000_000_000,
          source: 'exa:url7',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aumUsd).toBe(400_000_000_000);
    });

    it('should skip candidates with invalid name (normalized empty)', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: '', source: 'sec_edgar' },
        { name: 'A', source: 'exa:url8' },
        { name: 'Apollo Global', source: 'sec_edgar' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Apollo Global');
    });

    it('should skip candidate whose normalized name is a single char', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'LP', source: 'sec_edgar' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(0);
    });

    it('should merge via alias name matching', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'TPG Capital', source: 'sec_edgar' },
        { name: 'Totally Different Firm', source: 'exa:url9' },
        { name: 'TPG Capital Management', source: 'public_ranking:wiki' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(2);
      const tpg = result.find((r) => r.name === 'TPG Capital');
      expect(tpg).toBeDefined();
      expect(tpg!.aliases).toContain('TPG Capital');
      expect(tpg!.aliases).toContain('TPG Capital Management');
    });

    it('should not add duplicate alias when merging same-name candidate', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Bain Capital', source: 'sec_edgar' },
        { name: 'Bain Capital', source: 'exa:url10' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].aliases).toEqual(['Bain Capital']);
    });

    it('should not add duplicate source when merging', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Bain Capital', source: 'sec_edgar' },
        { name: 'Bain Capital LLC', source: 'sec_edgar' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].sources).toEqual(['sec_edgar']);
    });

    it('should not overwrite existing website during merge', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Silver Lake',
          website: 'https://silverlake.com',
          source: 'sec_edgar',
        },
        {
          name: 'Silver Lake Partners',
          website: 'https://other-silverlake.com',
          source: 'exa:url11',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].website).toBe('https://silverlake.com');
    });

    it('should not overwrite existing firmType during merge', () => {
      const candidates: SeedFirmCandidate[] = [
        {
          name: 'Advent International',
          firmType: FirmType.BUYOUT,
          source: 'sec_edgar',
        },
        {
          name: 'Advent International LP',
          firmType: FirmType.GROWTH,
          source: 'exa:url12',
        },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].firmType).toBe(FirmType.BUYOUT);
    });

    it('should handle multiple groups with merges and non-merges', () => {
      const candidates: SeedFirmCandidate[] = [
        { name: 'Apollo Global', source: 'sec_edgar' },
        { name: 'Blackstone Group', source: 'sec_edgar' },
        { name: 'Apollo Global Management', source: 'exa:url13' },
        { name: 'KKR Partners', source: 'exa:url14' },
        { name: 'Blackstone Inc', source: 'public_ranking:wiki' },
      ];

      const result = service.deduplicate(candidates);

      expect(result).toHaveLength(3);
      const apolloMerged = result.find((r) => r.name === 'Apollo Global');
      expect(apolloMerged!.aliases).toContain('Apollo Global Management');
    });
  });
});
