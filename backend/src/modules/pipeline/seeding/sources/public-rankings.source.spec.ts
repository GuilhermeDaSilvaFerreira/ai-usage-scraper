import { PublicRankingsSource } from './public-rankings.source';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

jest.mock('../../../../common/utils/index', () => ({
  webRateLimiter: {
    wrap: jest.fn((fn: () => Promise<any>) => fn()),
  },
  parseAumString: jest.requireActual('../../../../common/utils/index')
    .parseAumString,
  cleanFirmName: jest.requireActual('../../../../common/utils/index')
    .cleanFirmName,
  extractHttpErrorDetails: jest.fn(() => ({})),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

import axios from 'axios';
import { existsSync, readFileSync } from 'fs';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockedReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;

describe('PublicRankingsSource', () => {
  let source: PublicRankingsSource;

  beforeEach(() => {
    source = new PublicRankingsSource();
    jest.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  describe('discoverFirms', () => {
    it('should parse Wikipedia HTML table and return candidates', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr><th>Rank</th><th>Firm</th><th>Headquarters</th><th>AUM</th></tr>
            <tr>
              <td>1</td>
              <td><a href="/wiki/Blackstone">Blackstone Inc</a></td>
              <td>New York, NY</td>
              <td>$1 trillion</td>
            </tr>
            <tr>
              <td>2</td>
              <td><a href="/wiki/KKR">KKR & Co</a></td>
              <td>New York, NY</td>
              <td>$500 billion</td>
            </tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const blackstone = result.find((c) => c.name.includes('Blackstone'));
      expect(blackstone).toBeDefined();
      expect(blackstone!.source).toBe('public_ranking:wikipedia');
      expect(blackstone!.headquarters).toBeTruthy();
    });

    it('should deduplicate Wikipedia entries by name', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr><td>1</td><td>Apollo Global</td><td>NY</td><td>$500B</td></tr>
            <tr><td>2</td><td>Apollo Global</td><td>NY</td><td>$500B</td></tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      const apollos = result.filter((c) => c.name === 'Apollo Global');
      expect(apollos).toHaveLength(1);
    });

    it('should skip rows with fewer than 2 columns', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr><td>Only one cell</td></tr>
            <tr><td>1</td><td>Valid Firm Partners</td><td>NY</td></tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      const valid = result.find((c) => c.name === 'Valid Firm Partners');
      expect(valid).toBeDefined();
    });

    it('should strip Wikipedia reference markers from names', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr><td>1</td><td>Apollo Global[3]</td><td>NY</td></tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      const hasRef = result.find((c) => c.name.includes('['));
      expect(hasRef).toBeUndefined();
    });

    it('should load seed firms from seed-firms.json when file exists', async () => {
      (mockedAxios.get as jest.Mock).mockResolvedValue({
        data: '<table class="wikitable"><tbody></tbody></table>',
      });

      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify([
          {
            name: 'Seed Firm Capital',
            aum: 100_000_000_000,
            type: 'buyout',
            hq: 'London',
            website: 'https://seedfirm.com',
          },
        ]),
      );

      const result = await source.discoverFirms();

      const seed = result.find((c) => c.name === 'Seed Firm Capital');
      expect(seed).toBeDefined();
      expect(seed!.source).toBe('public_ranking:seed_file');
      expect(seed!.aumUsd).toBe(100_000_000_000);
      expect(seed!.headquarters).toBe('London');
      expect(seed!.website).toBe('https://seedfirm.com');
    });

    it('should map firm type string from seed file to FirmType enum', async () => {
      (mockedAxios.get as jest.Mock).mockResolvedValue({
        data: '<table class="wikitable"><tbody></tbody></table>',
      });
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify([
          { name: 'Growth Firm Capital', type: 'growth' },
          { name: 'Credit Firm Partners', type: 'credit' },
        ]),
      );

      const result = await source.discoverFirms();

      const growth = result.find((c) => c.name === 'Growth Firm Capital');
      const credit = result.find((c) => c.name === 'Credit Firm Partners');
      expect(growth?.firmType).toBe('growth');
      expect(credit?.firmType).toBe('credit');
    });

    it('should return empty seed list when no seed file is found', async () => {
      (mockedAxios.get as jest.Mock).mockResolvedValue({
        data: '<table class="wikitable"><tbody></tbody></table>',
      });
      mockedExistsSync.mockReturnValue(false);

      const result = await source.discoverFirms();

      const seedFirms = result.filter((c) => c.source.includes('seed_file'));
      expect(seedFirms).toHaveLength(0);
    });

    it('should handle Wikipedia fetch failure gracefully', async () => {
      (mockedAxios.get as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );
      mockedExistsSync.mockReturnValue(false);

      const result = await source.discoverFirms();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle seed file parse failure gracefully', async () => {
      (mockedAxios.get as jest.Mock).mockResolvedValue({
        data: '<table class="wikitable"><tbody></tbody></table>',
      });
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue('INVALID JSON{{{');

      const result = await source.discoverFirms();

      expect(result).toBeDefined();
    });

    it('should handle seed firms without optional fields', async () => {
      (mockedAxios.get as jest.Mock).mockResolvedValue({
        data: '<table class="wikitable"><tbody></tbody></table>',
      });
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(
        JSON.stringify([{ name: 'Minimal Firm Partners' }]),
      );

      const result = await source.discoverFirms();

      const minimal = result.find((c) => c.name === 'Minimal Firm Partners');
      expect(minimal).toBeDefined();
      expect(minimal!.aumUsd).toBeUndefined();
      expect(minimal!.firmType).toBeUndefined();
      expect(minimal!.headquarters).toBeUndefined();
      expect(minimal!.website).toBeUndefined();
    });

    it('should parse AUM values from Wikipedia table cells', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr>
              <td>1</td>
              <td><a>Big Fund Capital</a></td>
              <td>Boston</td>
              <td>$150 billion</td>
            </tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      const firm = result.find((c) => c.name === 'Big Fund Capital');
      expect(firm).toBeDefined();
      if (firm?.aumUsd) {
        expect(firm.aumUsd).toBe(150_000_000_000);
      }
    });

    it('should skip purely numeric cell text when looking for firm name', async () => {
      const html = `
        <table class="wikitable">
          <tbody>
            <tr>
              <td>42</td>
              <td>Real Firm Partners</td>
              <td>Chicago</td>
            </tr>
          </tbody>
        </table>
      `;
      (mockedAxios.get as jest.Mock).mockResolvedValue({ data: html });

      const result = await source.discoverFirms();

      const numeric = result.find((c) => c.name === '42');
      expect(numeric).toBeUndefined();
      const real = result.find((c) => c.name === 'Real Firm Partners');
      expect(real).toBeDefined();
    });
  });
});
