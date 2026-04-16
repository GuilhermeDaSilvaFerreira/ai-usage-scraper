import { SignalType } from '../../../../common/enums/signal-type.enum';
import { HiringSignalsDimension } from './hiring-signals.dimension';

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

describe('HiringSignalsDimension', () => {
  let dimension: HiringSignalsDimension;

  beforeEach(() => {
    dimension = new HiringSignalsDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('ai_hiring_velocity');
    expect(dimension.relevantSignalTypes).toEqual([SignalType.AI_HIRING]);
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

  it('should score recent hires (last 6 months) at 12pts each', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 2);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Software Developer' },
      }),
      createMockSignal({
        id: 'r2',
        collected_at: recentDate,
        signal_data: { title: 'Backend Engineer' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(24);
    expect(result.signalCount).toBe(2);
  });

  it('should cap recent hire points at 50', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);

    const signals = Array.from({ length: 6 }, (_, i) =>
      createMockSignal({
        id: `r${i}`,
        collected_at: recentDate,
        signal_data: { title: `Engineer ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBeGreaterThanOrEqual(50);
    expect(result.rawScore).toBeLessThanOrEqual(100);
  });

  it('should score older hires at 5pts each', () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 12);

    const signals = [
      createMockSignal({
        id: 'o1',
        collected_at: oldDate,
        signal_data: { title: 'AI Researcher' },
      }),
      createMockSignal({
        id: 'o2',
        collected_at: oldDate,
        signal_data: { title: 'Backend Dev' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(10);
    expect(result.signalCount).toBe(2);
  });

  it('should cap older hire points at 25', () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 12);

    const signals = Array.from({ length: 8 }, (_, i) =>
      createMockSignal({
        id: `o${i}`,
        collected_at: oldDate,
        signal_data: { title: `Role ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(25);
  });

  it('should score mixed recent and older hires', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 2);
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 12);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Recent role' },
      }),
      createMockSignal({
        id: 'o1',
        collected_at: oldDate,
        signal_data: { title: 'Old role' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(17);
  });

  it('should add role diversity bonus for distinct role types', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Data Scientist' },
      }),
      createMockSignal({
        id: 'r2',
        collected_at: recentDate,
        signal_data: { title: 'ML Engineer specializing in machine learning' },
      }),
      createMockSignal({
        id: 'r3',
        collected_at: recentDate,
        signal_data: { title: 'Data Engineer' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(51);
  });

  it('should add leadership and analytics to role diversity', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Chief Data Officer' },
      }),
      createMockSignal({
        id: 'r2',
        collected_at: recentDate,
        signal_data: { title: 'Analytics Lead' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(34);
  });

  it('should cap role diversity bonus at 25', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Data Scientist with analytics experience' },
      }),
      createMockSignal({
        id: 'r2',
        collected_at: recentDate,
        signal_data: { title: 'ML Engineer, machine learning specialist' },
      }),
      createMockSignal({
        id: 'r3',
        collected_at: recentDate,
        signal_data: { title: 'Data Engineer' },
      }),
      createMockSignal({
        id: 'r4',
        collected_at: recentDate,
        signal_data: { title: 'Chief AI Officer' },
      }),
      createMockSignal({
        id: 'r5',
        collected_at: recentDate,
        signal_data: { title: 'Head of analytics' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(75);
  });

  it('should clamp total to maxPossible=100', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 12);

    const signals = [
      ...Array.from({ length: 5 }, (_, i) =>
        createMockSignal({
          id: `r${i}`,
          collected_at: recentDate,
          signal_data: {
            title: `Data Scientist ${i}, ML Engineer, machine learning, data engineer, chief, analytics`,
          },
        }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        createMockSignal({
          id: `o${i}`,
          collected_at: oldDate,
          signal_data: { title: `Older role ${i}` },
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

  it('should not add diversity bonus when no recognizable roles are present', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 1);

    const signals = [
      createMockSignal({
        id: 'r1',
        collected_at: recentDate,
        signal_data: { title: 'Software Developer' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(12);
  });
});
