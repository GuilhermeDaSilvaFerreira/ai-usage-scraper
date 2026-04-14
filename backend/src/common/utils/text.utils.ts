import { createHash } from 'crypto';

export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function normalizeFirmName(name: string): string {
  return name
    .replace(
      /\b(LLC|LP|L\.P\.|Inc\.?|Corp\.?|Ltd\.?|Co\.?|Group|Holdings?|Partners?|Capital\s*Management|Capital\s*Advisors?|Capital|Management|Investments?|Fund\s*Management|Asset\s*Management)\b/gi,
      '',
    )
    .replace(/[.,&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function cleanFirmName(raw: string): string | null {
  let name = raw;

  name = name.replace(/[\n\r]+/g, ' ');
  name = name.replace(/\[\d+\]/g, '');
  name = name.replace(/\s+/g, ' ').trim();

  if (/^\d+$/.test(name)) return null;
  if (!name || name.length < 2 || name.length > 200) return null;
  if (!/[A-Za-z]{2,}/.test(name)) return null;

  // Strip leading junk: lowercase fragments before the first word starting
  // with an uppercase letter (e.g. "billion. Edison Partners" -> "Edison Partners").
  // Preserve names that intentionally start with digits like "3i Group".
  const uppercaseStart = name.match(/^(\d+[A-Za-z]|[A-Z])/);
  if (!uppercaseStart) {
    const idx = name.search(/(?:^|[\s.]+)([A-Z])/);
    if (idx > 0) {
      name = name.slice(idx).replace(/^[\s.]+/, '');
    }
  }

  name = name.replace(/^[.,;:!?'"]+|[.,;:!?'"]+$/g, '').trim();

  if (!name || name.length < 2) return null;

  const stopwords = /^(the|a|an|in|on|at|for|to|of|and|or|is|it|by)$/i;
  if (stopwords.test(name)) return null;

  const wordCount = name.split(/\s+/).length;
  if (wordCount > 8) return null;

  return name;
}

export function parseAumString(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').toLowerCase();

  const trillionMatch = cleaned.match(/([\d.]+)\s*(?:t|trillion)/);
  if (trillionMatch) return parseFloat(trillionMatch[1]) * 1_000_000_000_000;

  const billionMatch = cleaned.match(/([\d.]+)\s*(?:b|bn|billion)/);
  if (billionMatch) return parseFloat(billionMatch[1]) * 1_000_000_000;

  const millionMatch = cleaned.match(/([\d.]+)\s*(?:m|mn|mm|million)/);
  if (millionMatch) return parseFloat(millionMatch[1]) * 1_000_000;

  const numericMatch = cleaned.match(/^[\d.]+$/);
  if (numericMatch) return parseFloat(numericMatch[0]);

  return null;
}
