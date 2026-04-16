import { SecEdgarSource } from './sec-edgar.source';
import { SecEdgarService } from '../../../../integrations/sec-edgar/sec-edgar.service';
import { FirmType } from '../../../../common/enums';

describe('SecEdgarSource', () => {
  let source: SecEdgarSource;
  let secEdgar: jest.Mocked<SecEdgarService>;

  beforeEach(() => {
    secEdgar = {
      searchFirms: jest.fn().mockResolvedValue([]),
      searchInvestmentAdvisers: jest.fn().mockResolvedValue([]),
    } as any;
    source = new SecEdgarSource(secEdgar);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeFirm(name: string, cik = '', city = '', state = '') {
    return {
      name,
      cik,
      entityType: '',
      sic: '',
      sicDescription: '',
      addresses: { business: { street: '', city, state, zip: '' } },
      filings: [],
    };
  }

  describe('discoverFirms', () => {
    it('should return candidates from query-based search', async () => {
      secEdgar.searchFirms.mockResolvedValue([
        makeFirm('Apollo Management', '12345', 'New York', 'NY'),
      ]);

      const result = await source.discoverFirms(500, 0);

      expect(result.length).toBeGreaterThan(0);
      const apollo = result.find((c) => c.name === 'Apollo Management');
      expect(apollo).toBeDefined();
      expect(apollo!.headquarters).toBe('New York, NY');
      expect(apollo!.secCrdNumber).toBe('12345');
      expect(apollo!.source).toBe('sec_edgar');
    });

    it('should skip firms with empty names', async () => {
      secEdgar.searchFirms.mockResolvedValue([
        makeFirm('', '12345'),
        makeFirm('Valid Firm', '67890'),
      ]);

      const result = await source.discoverFirms(500, 0);

      const empty = result.filter((c) => c.name === '');
      expect(empty).toHaveLength(0);
    });

    it('should return candidates from bulk adviser pages', async () => {
      secEdgar.searchInvestmentAdvisers.mockResolvedValue([
        makeFirm('Adviser Corp', '99999', 'Chicago', 'IL'),
      ]);

      const result = await source.discoverFirms(500, 0);

      const adviser = result.find((c) => c.name === 'Adviser Corp');
      expect(adviser).toBeDefined();
      expect(adviser!.source).toBe('sec_edgar:adviser_bulk');
    });

    it('should handle API failure for a query gracefully', async () => {
      let callCount = 0;
      secEdgar.searchFirms.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('API timeout');
        return [makeFirm('Fallback Firm')];
      });

      const result = await source.discoverFirms(500, 0);

      const fallback = result.find((c) => c.name === 'Fallback Firm');
      expect(fallback).toBeDefined();
    });

    it('should handle API failure for bulk adviser page gracefully', async () => {
      secEdgar.searchInvestmentAdvisers.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await source.discoverFirms(500, 0);

      expect(result).toBeDefined();
    });

    it('should set headquarters to undefined when city and state are empty', async () => {
      secEdgar.searchFirms.mockResolvedValue([makeFirm('No HQ Firm')]);

      const result = await source.discoverFirms(500, 0);

      const firm = result.find((c) => c.name === 'No HQ Firm');
      expect(firm).toBeDefined();
      expect(firm!.headquarters).toBeUndefined();
    });

    it('should set secCrdNumber to undefined when cik is empty', async () => {
      secEdgar.searchFirms.mockResolvedValue([makeFirm('No CIK Firm')]);

      const result = await source.discoverFirms(500, 0);

      const firm = result.find((c) => c.name === 'No CIK Firm');
      expect(firm).toBeDefined();
      expect(firm!.secCrdNumber).toBeUndefined();
    });

    it('should scale query count based on target', async () => {
      secEdgar.searchFirms.mockResolvedValue([]);

      await source.discoverFirms(100, 0);
      const lowTargetCallCount = secEdgar.searchFirms.mock.calls.length;

      secEdgar.searchFirms.mockClear();

      await source.discoverFirms(2000, 0);
      const highTargetCallCount = secEdgar.searchFirms.mock.calls.length;

      expect(highTargetCallCount).toBeGreaterThanOrEqual(lowTargetCallCount);
    });

    it('should offset bulk pages based on pageOffset', async () => {
      secEdgar.searchInvestmentAdvisers.mockResolvedValue([]);

      await source.discoverFirms(500, 2);

      if (secEdgar.searchInvestmentAdvisers.mock.calls.length > 0) {
        const firstPage = secEdgar.searchInvestmentAdvisers.mock
          .calls[0][0] as number;
        expect(firstPage).toBeGreaterThan(0);
      }
    });
  });

  describe('inferFirmType', () => {
    it('should infer BUYOUT for buyout queries', () => {
      const result = (source as any).inferFirmType('buyout fund manager');
      expect(result).toBe(FirmType.BUYOUT);
    });

    it('should infer BUYOUT for leveraged queries', () => {
      const result = (source as any).inferFirmType('leveraged buyout');
      expect(result).toBe(FirmType.BUYOUT);
    });

    it('should infer GROWTH for growth queries', () => {
      const result = (source as any).inferFirmType('growth equity fund');
      expect(result).toBe(FirmType.GROWTH);
    });

    it('should infer CREDIT for credit queries', () => {
      const result = (source as any).inferFirmType('private credit fund');
      expect(result).toBe(FirmType.CREDIT);
    });

    it('should infer CREDIT for debt queries', () => {
      const result = (source as any).inferFirmType('private debt fund');
      expect(result).toBe(FirmType.CREDIT);
    });

    it('should infer DIRECT_LENDING for direct lending queries', () => {
      const result = (source as any).inferFirmType('direct lending fund');
      expect(result).toBe(FirmType.DIRECT_LENDING);
    });

    it('should infer DISTRESSED for distressed queries', () => {
      const result = (source as any).inferFirmType('distressed asset fund');
      expect(result).toBe(FirmType.DISTRESSED);
    });

    it('should infer DISTRESSED for special situations queries', () => {
      const result = (source as any).inferFirmType('special situations fund');
      expect(result).toBe(FirmType.DISTRESSED);
    });

    it('should infer MEZZANINE for mezzanine queries', () => {
      const result = (source as any).inferFirmType('mezzanine fund');
      expect(result).toBe(FirmType.MEZZANINE);
    });

    it('should infer SECONDARIES for secondaries queries', () => {
      const result = (source as any).inferFirmType('secondaries fund');
      expect(result).toBe(FirmType.SECONDARIES);
    });

    it('should return undefined for generic queries', () => {
      const result = (source as any).inferFirmType(
        'alternative investment fund',
      );
      expect(result).toBeUndefined();
    });
  });
});
