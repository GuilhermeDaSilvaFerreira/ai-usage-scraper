import { SignalType } from '../../../../common/enums/signal-type.enum';
import { ThoughtLeadershipDimension } from './thought-leadership.dimension';

function createMockSignal(overrides: Partial<any> = {}): any {
  return {
    id: 'sig-1',
    firm_id: 'firm-1',
    signal_type: SignalType.AI_HIRING,
    signal_data: {},
    extraction_confidence: 0.8,
    collected_at: new Date(),
    ...overrides,
  };
}

describe('ThoughtLeadershipDimension', () => {
  let dimension: ThoughtLeadershipDimension;

  beforeEach(() => {
    dimension = new ThoughtLeadershipDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('thought_leadership');
    expect(dimension.relevantSignalTypes).toEqual([
      SignalType.AI_CONFERENCE_TALK,
      SignalType.AI_PODCAST,
      SignalType.AI_RESEARCH,
    ]);
  });

  it('should return zero score when no relevant signals exist', () => {
    const signals = [
      createMockSignal({ signal_type: SignalType.AI_HIRING }),
      createMockSignal({ signal_type: SignalType.AI_NEWS_MENTION }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(0);
    expect(result.maxPossible).toBe(100);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('should score conference talks at 15pts each', () => {
    const signals = [
      createMockSignal({
        id: 'ct1',
        signal_type: SignalType.AI_CONFERENCE_TALK,
        signal_data: { title: 'AI Summit 2025' },
      }),
      createMockSignal({
        id: 'ct2',
        signal_type: SignalType.AI_CONFERENCE_TALK,
        signal_data: { title: 'MLConf keynote' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
    expect(result.signalCount).toBe(2);
  });

  it('should cap conference talk points at 40', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `ct${i}`,
        signal_type: SignalType.AI_CONFERENCE_TALK,
        signal_data: { title: `Conference ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
  });

  it('should score podcasts at 12pts each', () => {
    const signals = [
      createMockSignal({
        id: 'p1',
        signal_type: SignalType.AI_PODCAST,
        signal_data: { title: 'AI Podcast Episode' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(12);
    expect(result.signalCount).toBe(1);
  });

  it('should cap podcast points at 30', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `p${i}`,
        signal_type: SignalType.AI_PODCAST,
        signal_data: { title: `Podcast ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
  });

  it('should score research at 15pts each', () => {
    const signals = [
      createMockSignal({
        id: 'r1',
        signal_type: SignalType.AI_RESEARCH,
        signal_data: { title: 'AI Research Paper' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
  });

  it('should cap research points at 30', () => {
    const signals = Array.from({ length: 4 }, (_, i) =>
      createMockSignal({
        id: `r${i}`,
        signal_type: SignalType.AI_RESEARCH,
        signal_data: { title: `Research ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
  });

  it('should combine all categories correctly', () => {
    const signals = [
      createMockSignal({
        id: 'ct1',
        signal_type: SignalType.AI_CONFERENCE_TALK,
        signal_data: { title: 'Conference talk' },
      }),
      createMockSignal({
        id: 'p1',
        signal_type: SignalType.AI_PODCAST,
        signal_data: { title: 'Podcast' },
      }),
      createMockSignal({
        id: 'r1',
        signal_type: SignalType.AI_RESEARCH,
        signal_data: { title: 'Research' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(42);
    expect(result.signalCount).toBe(3);
  });

  it('should clamp total to maxPossible=100', () => {
    const signals = [
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `ct${i}`,
          signal_type: SignalType.AI_CONFERENCE_TALK,
          signal_data: { title: `Conference ${i}` },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `p${i}`,
          signal_type: SignalType.AI_PODCAST,
          signal_data: { title: `Podcast ${i}` },
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        createMockSignal({
          id: `r${i}`,
          signal_type: SignalType.AI_RESEARCH,
          signal_data: { title: `Research ${i}` },
        }),
      ),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(100);
  });

  it('should return zero for empty signals array', () => {
    const result = dimension.score([]);

    expect(result.rawScore).toBe(0);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });
});
