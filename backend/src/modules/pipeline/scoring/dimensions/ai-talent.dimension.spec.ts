import { SignalType } from '../../../../common/enums/signal-type.enum';
import { AiTalentDimension } from './ai-talent.dimension';

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

describe('AiTalentDimension', () => {
  let dimension: AiTalentDimension;

  beforeEach(() => {
    dimension = new AiTalentDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('ai_talent_density');
    expect(dimension.relevantSignalTypes).toEqual([
      SignalType.AI_TEAM_GROWTH,
      SignalType.AI_HIRING,
    ]);
  });

  it('should return zero score when no relevant signals exist', () => {
    const signals = [
      createMockSignal({ signal_type: SignalType.AI_NEWS_MENTION }),
      createMockSignal({ signal_type: SignalType.AI_PODCAST }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(0);
    expect(result.maxPossible).toBe(100);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('should score senior hires at 15pts each', () => {
    const signals = [
      createMockSignal({
        id: 's1',
        signal_data: { title: 'Chief AI Officer' },
      }),
      createMockSignal({
        id: 's2',
        signal_data: { title: 'Head of Machine Learning' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
    expect(result.signalCount).toBe(2);
  });

  it('should cap senior hire points at 45', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `s${i}`,
        signal_data: { title: 'Chief AI Officer' },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(45);
  });

  it('should score team growth signals at 10pts each', () => {
    const signals = [
      createMockSignal({
        id: 's1',
        signal_type: SignalType.AI_TEAM_GROWTH,
        signal_data: { growth: '20%' },
      }),
      createMockSignal({
        id: 's2',
        signal_type: SignalType.AI_TEAM_GROWTH,
        signal_data: { growth: '15%' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(20);
    expect(result.signalCount).toBe(2);
  });

  it('should cap team growth points at 30', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `s${i}`,
        signal_type: SignalType.AI_TEAM_GROWTH,
        signal_data: { growth: `${i * 10}%` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
  });

  it('should score general hires at 5pts each', () => {
    const signals = [
      createMockSignal({
        id: 's1',
        signal_data: { title: 'ML Engineer' },
      }),
      createMockSignal({
        id: 's2',
        signal_data: { title: 'Data Scientist' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(10);
    expect(result.signalCount).toBe(2);
  });

  it('should cap general hire points at 25', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      createMockSignal({
        id: `s${i}`,
        signal_data: { title: 'ML Engineer' },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(25);
  });

  it('should combine all categories correctly', () => {
    const signals = [
      createMockSignal({
        id: 's1',
        signal_data: { title: 'Chief AI Officer' },
      }),
      createMockSignal({
        id: 's2',
        signal_type: SignalType.AI_TEAM_GROWTH,
        signal_data: { growth: '20%' },
      }),
      createMockSignal({
        id: 's3',
        signal_data: { title: 'ML Engineer' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
    expect(result.signalCount).toBe(3);
  });

  it('should clamp total score to maxPossible=100', () => {
    const signals = [
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `senior-${i}`,
          signal_data: { title: 'Director of AI' },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `growth-${i}`,
          signal_type: SignalType.AI_TEAM_GROWTH,
          signal_data: { growth: '50%' },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        createMockSignal({
          id: `general-${i}`,
          signal_data: { title: 'ML Engineer' },
        }),
      ),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(100);
  });

  it('should detect senior keywords: chief, head of, vp, director', () => {
    const keywords = [
      'Chief',
      'Head of',
      'VP',
      'Director',
      'Managing Director',
    ];

    for (const keyword of keywords) {
      const dim = new AiTalentDimension();
      const signals = [
        createMockSignal({
          id: `s-${keyword}`,
          signal_data: { title: `${keyword} of Data Science` },
        }),
      ];

      const result = dim.score(signals);
      expect(result.rawScore).toBeGreaterThanOrEqual(15);
    }
  });

  it('should generate evidence entries for each signal', () => {
    const signals = [
      createMockSignal({
        id: 's1',
        signal_data: { title: 'Chief AI Officer' },
      }),
      createMockSignal({
        id: 's2',
        signal_data: { title: 'ML Engineer' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.evidence[0].dimension).toBe('ai_talent_density');
  });

  it('should return empty evidence and zero signalCount when signals is empty', () => {
    const result = dimension.score([]);

    expect(result.rawScore).toBe(0);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });
});
