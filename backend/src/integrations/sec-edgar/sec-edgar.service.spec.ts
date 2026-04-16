import { ConfigService } from '@nestjs/config';
import { SecEdgarService } from './sec-edgar.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../common/utils/index', () => ({
  secEdgarRateLimiter: {
    wrap: jest.fn((fn: () => Promise<any>) => fn()),
  },
  extractHttpErrorDetails: jest.fn(() => ({ status: 500, message: 'error' })),
}));

describe('SecEdgarService', () => {
  let service: SecEdgarService;
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      get: mockGet,
    } as any);

    const configService = {
      get: jest.fn().mockReturnValue('TestAgent test@example.com'),
    } as unknown as ConfigService;

    service = new SecEdgarService(configService);
  });

  describe('constructor', () => {
    it('should create an axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://efts.sec.gov',
          timeout: 30000,
        }),
      );
    });
  });

  describe('searchFirms', () => {
    it('should return mapped firm info from search results', async () => {
      mockGet.mockResolvedValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  cik: '123456',
                  entity_name: 'Test Capital',
                  entity_type: 'Investment Adviser',
                  sic: '6726',
                  sic_description: 'Investment Offices',
                  street: '123 Main St',
                  city: 'New York',
                  state: 'NY',
                  zip: '10001',
                },
              },
            ],
          },
        },
      });

      const result = await service.searchFirms('Test Capital');

      expect(result).toEqual([
        {
          cik: '123456',
          name: 'Test Capital',
          entityType: 'Investment Adviser',
          sic: '6726',
          sicDescription: 'Investment Offices',
          addresses: {
            business: {
              street: '123 Main St',
              city: 'New York',
              state: 'NY',
              zip: '10001',
            },
          },
          filings: [],
        },
      ]);

      expect(mockGet).toHaveBeenCalledWith('/LATEST/search-index', {
        params: {
          q: 'Test Capital',
          dateRange: 'custom',
          forms: 'ADV',
          from: 0,
          size: 40,
        },
      });
    });

    it('should fall back to display_names when entity_name is missing', async () => {
      mockGet.mockResolvedValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  display_names: ['Fallback Name'],
                },
              },
            ],
          },
        },
      });

      const result = await service.searchFirms('query');
      expect(result[0].name).toBe('Fallback Name');
    });

    it('should handle empty hits array', async () => {
      mockGet.mockResolvedValue({ data: { hits: { hits: [] } } });
      const result = await service.searchFirms('query');
      expect(result).toEqual([]);
    });

    it('should handle missing hits object', async () => {
      mockGet.mockResolvedValue({ data: {} });
      const result = await service.searchFirms('query');
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));
      const result = await service.searchFirms('query');
      expect(result).toEqual([]);
    });

    it('should default missing _source fields to empty strings', async () => {
      mockGet.mockResolvedValue({
        data: { hits: { hits: [{ _source: {} }] } },
      });

      const result = await service.searchFirms('query');
      expect(result[0]).toEqual({
        cik: '',
        name: '',
        entityType: '',
        sic: '',
        sicDescription: '',
        addresses: {
          business: { street: '', city: '', state: '', zip: '' },
        },
        filings: [],
      });
    });

    it('should handle missing _source entirely', async () => {
      mockGet.mockResolvedValue({
        data: { hits: { hits: [{}] } },
      });

      const result = await service.searchFirms('query');
      expect(result[0].cik).toBe('');
      expect(result[0].name).toBe('');
    });
  });

  describe('getCompanyByName', () => {
    it('should return mapped firm info on success', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  cik: '789',
                  entity_name: 'Named Corp',
                  entity_type: 'Corp',
                  sic: '1234',
                  sic_description: 'Desc',
                  street: '456 Ave',
                  city: 'Chicago',
                  state: 'IL',
                  zip: '60601',
                },
              },
            ],
          },
        },
      });

      const result = await service.getCompanyByName('Named Corp');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Named Corp');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('Named%20Corp'),
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('should return empty array when no hits', async () => {
      mockedAxios.get.mockResolvedValue({ data: { hits: { hits: [] } } });
      const result = await service.getCompanyByName('Nobody');
      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Timeout'));
      const result = await service.getCompanyByName('Fail Corp');
      expect(result).toEqual([]);
    });
  });

  describe('getCompanyByCik', () => {
    it('should pad CIK and return full firm info with filings', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          cik: '123',
          name: 'CIK Firm',
          entityType: 'Fund',
          sic: '6726',
          sicDescription: 'Investment',
          addresses: {
            business: {
              street1: '789 Blvd',
              city: 'Boston',
              stateOrCountry: 'MA',
              zipCode: '02101',
            },
          },
          filings: {
            recent: {
              form: ['ADV', '13F'],
              filingDate: ['2024-01-01', '2024-02-01'],
              primaryDocument: ['doc1.htm', 'doc2.htm'],
              cik: '123',
            },
          },
        },
      });

      const result = await service.getCompanyByCik('123');

      expect(result).not.toBeNull();
      expect(result!.cik).toBe('123');
      expect(result!.name).toBe('CIK Firm');
      expect(result!.addresses.business.street).toBe('789 Blvd');
      expect(result!.addresses.business.state).toBe('MA');
      expect(result!.filings).toHaveLength(2);
      expect(result!.filings[0]).toEqual({
        cik: '123',
        companyName: '',
        formType: 'ADV',
        dateFiled: '2024-01-01',
        fileUrl: 'doc1.htm',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://data.sec.gov/submissions/CIK0000000123.json',
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('should pad short CIK to 10 digits', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          cik: '42',
          name: 'Short CIK',
          filings: {},
        },
      });

      await service.getCompanyByCik('42');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://data.sec.gov/submissions/CIK0000000042.json',
        expect.anything(),
      );
    });

    it('should handle missing address data gracefully', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          cik: '100',
          name: 'No Address',
          filings: {},
        },
      });

      const result = await service.getCompanyByCik('100');
      expect(result!.addresses.business).toEqual({
        street: '',
        city: '',
        state: '',
        zip: '',
      });
    });

    it('should handle missing filings.recent', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          cik: '200',
          name: 'No Filings',
          filings: {},
        },
      });

      const result = await service.getCompanyByCik('200');
      expect(result!.filings).toEqual([]);
    });

    it('should limit filings to 20', async () => {
      const forms = Array.from({ length: 30 }, (_, i) => `FORM-${i}`);
      const dates = Array.from({ length: 30 }, () => '2024-01-01');
      const docs = Array.from({ length: 30 }, (_, i) => `doc${i}.htm`);

      mockedAxios.get.mockResolvedValue({
        data: {
          cik: '300',
          name: 'Many Filings',
          filings: {
            recent: {
              form: forms,
              filingDate: dates,
              primaryDocument: docs,
              cik: '300',
            },
          },
        },
      });

      const result = await service.getCompanyByCik('300');
      expect(result!.filings).toHaveLength(20);
    });

    it('should return null on error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('404'));
      const result = await service.getCompanyByCik('999');
      expect(result).toBeNull();
    });
  });

  describe('searchInvestmentAdvisers', () => {
    it('should return mapped results with pagination', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          hits: {
            hits: [
              {
                _source: {
                  cik: '500',
                  entity_name: 'Adviser Inc',
                  entity_type: 'IA',
                  sic: '',
                  sic_description: '',
                },
              },
            ],
          },
        },
      });

      const result = await service.searchInvestmentAdvisers(2, 50);

      expect(result).toHaveLength(1);
      expect(result[0].cik).toBe('500');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://efts.sec.gov/LATEST/search-index',
        expect.objectContaining({
          params: { forms: 'ADV', from: 100, size: 50 },
        }),
      );
    });

    it('should use default pagination values', async () => {
      mockedAxios.get.mockResolvedValue({ data: { hits: { hits: [] } } });

      await service.searchInvestmentAdvisers();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://efts.sec.gov/LATEST/search-index',
        expect.objectContaining({
          params: { forms: 'ADV', from: 0, size: 100 },
        }),
      );
    });

    it('should return empty array on error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Server error'));
      const result = await service.searchInvestmentAdvisers();
      expect(result).toEqual([]);
    });
  });
});
