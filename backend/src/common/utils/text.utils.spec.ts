import {
  computeContentHash,
  normalizeFirmName,
  createSlug,
  extractDomain,
  truncate,
  cleanFirmName,
  parseAumString,
} from './text.utils';
import { createHash } from 'crypto';

describe('computeContentHash', () => {
  it('should return a sha256 hex digest', () => {
    const result = computeContentHash('hello');
    const expected = createHash('sha256').update('hello').digest('hex');
    expect(result).toBe(expected);
  });

  it('should return different hashes for different content', () => {
    expect(computeContentHash('a')).not.toBe(computeContentHash('b'));
  });

  it('should return the same hash for identical content', () => {
    expect(computeContentHash('foo')).toBe(computeContentHash('foo'));
  });

  it('should handle empty string', () => {
    const result = computeContentHash('');
    const expected = createHash('sha256').update('').digest('hex');
    expect(result).toBe(expected);
  });

  it('should handle unicode content', () => {
    const result = computeContentHash('日本語テスト');
    expect(result).toHaveLength(64);
  });
});

describe('normalizeFirmName', () => {
  it('should strip LLC suffix', () => {
    expect(normalizeFirmName('Acme LLC')).toBe('acme');
  });

  it('should strip Inc and Inc.', () => {
    expect(normalizeFirmName('Acme Inc')).toBe('acme');
    expect(normalizeFirmName('Acme Inc.')).toBe('acme');
  });

  it('should strip Corp and Corp.', () => {
    expect(normalizeFirmName('Acme Corp')).toBe('acme');
    expect(normalizeFirmName('Acme Corp.')).toBe('acme');
  });

  it('should strip LP', () => {
    expect(normalizeFirmName('Fund LP')).toBe('fund');
  });

  it('should not strip L.P. due to word boundary mismatch', () => {
    expect(normalizeFirmName('Fund L.P.')).toBe('fund lp');
  });

  it('should strip Ltd and Ltd.', () => {
    expect(normalizeFirmName('Firm Ltd')).toBe('firm');
    expect(normalizeFirmName('Firm Ltd.')).toBe('firm');
  });

  it('should strip Co and Co.', () => {
    expect(normalizeFirmName('Firm Co')).toBe('firm');
    expect(normalizeFirmName('Firm Co.')).toBe('firm');
  });

  it('should strip Group, Holdings, Holding', () => {
    expect(normalizeFirmName('Acme Group')).toBe('acme');
    expect(normalizeFirmName('Acme Holdings')).toBe('acme');
    expect(normalizeFirmName('Acme Holding')).toBe('acme');
  });

  it('should strip Partners and Partner', () => {
    expect(normalizeFirmName('Acme Partners')).toBe('acme');
    expect(normalizeFirmName('Acme Partner')).toBe('acme');
  });

  it('should strip Capital Management', () => {
    expect(normalizeFirmName('Acme Capital Management')).toBe('acme');
  });

  it('should strip Capital Advisors and Capital Advisor', () => {
    expect(normalizeFirmName('Acme Capital Advisors')).toBe('acme');
    expect(normalizeFirmName('Acme Capital Advisor')).toBe('acme');
  });

  it('should strip Capital alone', () => {
    expect(normalizeFirmName('Acme Capital')).toBe('acme');
  });

  it('should strip Management', () => {
    expect(normalizeFirmName('Acme Management')).toBe('acme');
  });

  it('should strip Investment and Investments', () => {
    expect(normalizeFirmName('Acme Investment')).toBe('acme');
    expect(normalizeFirmName('Acme Investments')).toBe('acme');
  });

  it('should strip Fund Management and Asset Management', () => {
    expect(normalizeFirmName('Acme Fund Management')).toBe('acme');
    expect(normalizeFirmName('Acme Asset Management')).toBe('acme');
  });

  it('should remove dots, commas, and ampersands', () => {
    expect(normalizeFirmName('A & B, Co.')).toBe('a b');
  });

  it('should collapse whitespace and trim', () => {
    expect(normalizeFirmName('  Acme   Group  ')).toBe('acme');
  });

  it('should lowercase the result', () => {
    expect(normalizeFirmName('BLACKROCK')).toBe('blackrock');
  });

  it('should be case-insensitive when stripping suffixes', () => {
    expect(normalizeFirmName('Acme llc')).toBe('acme');
    expect(normalizeFirmName('Acme LLC')).toBe('acme');
  });

  it('should strip multiple suffixes at once', () => {
    expect(normalizeFirmName('Acme Capital Management LLC')).toBe('acme');
  });
});

describe('createSlug', () => {
  it('should lowercase and replace non-alphanumeric chars with hyphens', () => {
    expect(createSlug('Hello World')).toBe('hello-world');
  });

  it('should strip leading and trailing hyphens', () => {
    expect(createSlug('--hello--')).toBe('hello');
  });

  it('should handle special characters', () => {
    expect(createSlug('Foo & Bar!')).toBe('foo-bar');
  });

  it('should collapse consecutive non-alphanumeric chars', () => {
    expect(createSlug('a   b   c')).toBe('a-b-c');
  });

  it('should handle purely numeric input', () => {
    expect(createSlug('123')).toBe('123');
  });

  it('should handle empty string', () => {
    expect(createSlug('')).toBe('');
  });

  it('should handle uppercase with numbers', () => {
    expect(createSlug('3i Group Holdings')).toBe('3i-group-holdings');
  });
});

describe('extractDomain', () => {
  it('should extract hostname from a valid URL', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
  });

  it('should strip www. prefix', () => {
    expect(extractDomain('https://www.example.com')).toBe('example.com');
  });

  it('should preserve subdomains other than www', () => {
    expect(extractDomain('https://api.example.com')).toBe('api.example.com');
  });

  it('should return null for an invalid URL', () => {
    expect(extractDomain('not-a-url')).toBeNull();
  });

  it('should return null for an empty string', () => {
    expect(extractDomain('')).toBeNull();
  });

  it('should handle http URLs', () => {
    expect(extractDomain('http://example.org')).toBe('example.org');
  });

  it('should handle URLs with port numbers', () => {
    expect(extractDomain('https://example.com:8080/path')).toBe('example.com');
  });

  it('should handle URLs with query params and fragments', () => {
    expect(extractDomain('https://example.com/path?q=1#frag')).toBe(
      'example.com',
    );
  });
});

describe('truncate', () => {
  it('should return the original text if within maxLen', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should return the original text if exactly maxLen', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });

  it('should truncate and append ellipsis when exceeding maxLen', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should handle maxLen of 3 (minimum for ellipsis)', () => {
    expect(truncate('hello', 3)).toBe('...');
  });

  it('should handle empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('cleanFirmName', () => {
  it('should return a valid firm name unchanged', () => {
    expect(cleanFirmName('Acme Corp')).toBe('Acme Corp');
  });

  it('should replace newlines with spaces', () => {
    expect(cleanFirmName('Acme\nCorp')).toBe('Acme Corp');
    expect(cleanFirmName('Acme\r\nCorp')).toBe('Acme Corp');
  });

  it('should strip bracket references like [1]', () => {
    expect(cleanFirmName('Acme[1] Corp[2]')).toBe('Acme Corp');
  });

  it('should collapse whitespace', () => {
    expect(cleanFirmName('Acme    Corp')).toBe('Acme Corp');
  });

  it('should return null for purely numeric strings', () => {
    expect(cleanFirmName('12345')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(cleanFirmName('')).toBeNull();
  });

  it('should return null for single character', () => {
    expect(cleanFirmName('A')).toBeNull();
  });

  it('should return null for strings longer than 200 characters', () => {
    expect(cleanFirmName('A'.repeat(201))).toBeNull();
  });

  it('should return null if no 2+ consecutive alpha chars', () => {
    expect(cleanFirmName('1-2-3')).toBeNull();
  });

  it('should strip leading lowercase junk before first uppercase', () => {
    expect(cleanFirmName('billion. Edison Partners')).toBe('Edison Partners');
  });

  it('should preserve names starting with digit+letter like "3i Group"', () => {
    expect(cleanFirmName('3i Group')).toBe('3i Group');
  });

  it('should preserve names starting with uppercase', () => {
    expect(cleanFirmName('Blackstone Group')).toBe('Blackstone Group');
  });

  it('should strip leading dots and trailing punctuation', () => {
    expect(cleanFirmName('...Acme Corp...')).toBe('Acme Corp');
  });

  it('should strip trailing punctuation when name starts uppercase', () => {
    expect(cleanFirmName('Acme Corp...')).toBe('Acme Corp');
    expect(cleanFirmName("Acme Corp'")).toBe('Acme Corp');
  });

  it('should strip leading junk before non-dot/space punctuation', () => {
    expect(cleanFirmName('"Acme Corp"')).toBe('Corp');
    expect(cleanFirmName(',Acme Corp,')).toBe('Corp');
  });

  it('should return null for stopwords', () => {
    expect(cleanFirmName('the')).toBeNull();
    expect(cleanFirmName('The')).toBeNull();
    expect(cleanFirmName('and')).toBeNull();
    expect(cleanFirmName('or')).toBeNull();
    expect(cleanFirmName('is')).toBeNull();
    expect(cleanFirmName('it')).toBeNull();
    expect(cleanFirmName('by')).toBeNull();
    expect(cleanFirmName('in')).toBeNull();
    expect(cleanFirmName('on')).toBeNull();
    expect(cleanFirmName('at')).toBeNull();
    expect(cleanFirmName('for')).toBeNull();
    expect(cleanFirmName('to')).toBeNull();
    expect(cleanFirmName('of')).toBeNull();
    expect(cleanFirmName('a')).toBeNull();
    expect(cleanFirmName('an')).toBeNull();
  });

  it('should return null for names with more than 8 words', () => {
    expect(
      cleanFirmName('One Two Three Four Five Six Seven Eight Nine'),
    ).toBeNull();
  });

  it('should allow names with exactly 8 words', () => {
    expect(cleanFirmName('One Two Three Four Five Six Seven Eight')).toBe(
      'One Two Three Four Five Six Seven Eight',
    );
  });

  it('should return null when stripping makes name too short', () => {
    expect(cleanFirmName('.A')).toBeNull();
  });

  it('should handle string that becomes empty after bracket removal', () => {
    expect(cleanFirmName('[1][2]')).toBeNull();
  });
});

describe('parseAumString', () => {
  it('should parse trillion values', () => {
    expect(parseAumString('1.5t')).toBe(1_500_000_000_000);
    expect(parseAumString('$2 trillion')).toBe(2_000_000_000_000);
    expect(parseAumString('1.5T')).toBe(1_500_000_000_000);
  });

  it('should parse billion values', () => {
    expect(parseAumString('5b')).toBe(5_000_000_000);
    expect(parseAumString('3.2bn')).toBe(3_200_000_000);
    expect(parseAumString('$10 billion')).toBe(10_000_000_000);
    expect(parseAumString('1.5B')).toBe(1_500_000_000);
  });

  it('should parse million values', () => {
    expect(parseAumString('500m')).toBe(500_000_000);
    expect(parseAumString('250mn')).toBe(250_000_000);
    expect(parseAumString('100mm')).toBe(100_000_000);
    expect(parseAumString('$75 million')).toBe(75_000_000);
    expect(parseAumString('1.5M')).toBe(1_500_000);
  });

  it('should parse plain numeric strings', () => {
    expect(parseAumString('1000000')).toBe(1_000_000);
    expect(parseAumString('3.14')).toBe(3.14);
  });

  it('should strip dollar signs, commas, and spaces', () => {
    expect(parseAumString('$1,000,000')).toBe(1_000_000);
    expect(parseAumString('$ 500 m')).toBe(500_000_000);
  });

  it('should return null for unparseable strings', () => {
    expect(parseAumString('unknown')).toBeNull();
    expect(parseAumString('N/A')).toBeNull();
    expect(parseAumString('')).toBeNull();
  });

  it('should handle decimal values in multiplied formats', () => {
    expect(parseAumString('1.25b')).toBe(1_250_000_000);
    expect(parseAumString('0.5t')).toBe(500_000_000_000);
  });
});
