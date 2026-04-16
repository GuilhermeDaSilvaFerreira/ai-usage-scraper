import { SignalType } from '../../../../common/enums/signal-type.enum';
import { PublicActivityDimension } from './public-activity.dimension';

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

describe('PublicActivityDimension', () => {
  let dimension: PublicActivityDimension;

  beforeEach(() => {
    dimension = new PublicActivityDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('public_ai_activity');
    expect(dimension.relevantSignalTypes).toEqual([
      SignalType.AI_NEWS_MENTION,
      SignalType.AI_CASE_STUDY,
      SignalType.LINKEDIN_AI_ACTIVITY,
    ]);
  });

  it('should return zero score when no relevant signals exist', () => {
    const signals = [
      createMockSignal({ signal_type: SignalType.AI_HIRING }),
      createMockSignal({ signal_type: SignalType.AI_PODCAST }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(0);
    expect(result.maxPossible).toBe(100);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('should score news mentions at 8pts each', () => {
    const signals = [
      createMockSignal({
        id: 'n1',
        signal_type: SignalType.AI_NEWS_MENTION,
        signal_data: { headline: 'Firm adopts AI' },
      }),
      createMockSignal({
        id: 'n2',
        signal_type: SignalType.AI_NEWS_MENTION,
        signal_data: { headline: 'AI expansion' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(16);
    expect(result.signalCount).toBe(2);
  });

  it('should cap news mention points at 40', () => {
    const signals = Array.from({ length: 7 }, (_, i) =>
      createMockSignal({
        id: `n${i}`,
        signal_type: SignalType.AI_NEWS_MENTION,
        signal_data: { headline: `News ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
  });

  it('should score case studies at 15pts each', () => {
    const signals = [
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'Case Study 1' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
    expect(result.signalCount).toBe(1);
  });

  it('should cap case study points at 35', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `cs${i}`,
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: `Case Study ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(35);
  });

  it('should score LinkedIn activity at 5pts each', () => {
    const signals = [
      createMockSignal({
        id: 'li1',
        signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
        signal_data: { post: 'AI update' },
      }),
      createMockSignal({
        id: 'li2',
        signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
        signal_data: { post: 'ML thoughts' },
      }),
      createMockSignal({
        id: 'li3',
        signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
        signal_data: { post: 'Data Science article' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
  });

  it('should cap LinkedIn activity points at 25', () => {
    const signals = Array.from({ length: 8 }, (_, i) =>
      createMockSignal({
        id: `li${i}`,
        signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
        signal_data: { post: `Post ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(25);
  });

  it('should combine all categories correctly', () => {
    const signals = [
      createMockSignal({
        id: 'n1',
        signal_type: SignalType.AI_NEWS_MENTION,
        signal_data: { headline: 'AI news' },
      }),
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'Case study' },
      }),
      createMockSignal({
        id: 'li1',
        signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
        signal_data: { post: 'LinkedIn post' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(28);
    expect(result.signalCount).toBe(3);
  });

  it('should clamp total to maxPossible=100', () => {
    const signals = [
      ...Array.from({ length: 5 }, (_, i) =>
        createMockSignal({
          id: `n${i}`,
          signal_type: SignalType.AI_NEWS_MENTION,
          signal_data: { headline: `News ${i}` },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `cs${i}`,
          signal_type: SignalType.AI_CASE_STUDY,
          signal_data: { title: `Case ${i}` },
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        createMockSignal({
          id: `li${i}`,
          signal_type: SignalType.LINKEDIN_AI_ACTIVITY,
          signal_data: { post: `Post ${i}` },
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
