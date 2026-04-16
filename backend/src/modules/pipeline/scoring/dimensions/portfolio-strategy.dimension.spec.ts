import { SignalType } from '../../../../common/enums/signal-type.enum';
import { PortfolioStrategyDimension } from './portfolio-strategy.dimension';

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

describe('PortfolioStrategyDimension', () => {
  let dimension: PortfolioStrategyDimension;

  beforeEach(() => {
    dimension = new PortfolioStrategyDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('portfolio_ai_strategy');
    expect(dimension.relevantSignalTypes).toEqual([
      SignalType.PORTFOLIO_AI_INITIATIVE,
      SignalType.AI_CASE_STUDY,
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

  it('should score portfolio initiatives at 20pts each', () => {
    const signals = [
      createMockSignal({
        id: 'pi1',
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
        signal_data: { initiative: 'AI transformation across portfolio' },
      }),
      createMockSignal({
        id: 'pi2',
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
        signal_data: { initiative: 'AI-driven due diligence' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
    expect(result.signalCount).toBe(2);
  });

  it('should cap portfolio initiative points at 60', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `pi${i}`,
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
        signal_data: { initiative: `Initiative ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(60);
  });

  it('should score case studies with "portfolio" in signal_data at 15pts each', () => {
    const signals = [
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'Portfolio company AI adoption case study' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
    expect(result.signalCount).toBe(1);
  });

  it('should NOT score case studies without "portfolio" in signal_data', () => {
    const signals = [
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'General AI case study' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(0);
    expect(result.signalCount).toBe(1);
  });

  it('should cap portfolio-related case study points at 40', () => {
    const signals = Array.from({ length: 5 }, (_, i) =>
      createMockSignal({
        id: `cs${i}`,
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: `Portfolio AI case study ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
  });

  it('should combine portfolio initiatives and case studies', () => {
    const signals = [
      createMockSignal({
        id: 'pi1',
        signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
        signal_data: { initiative: 'AI initiative' },
      }),
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'Portfolio optimization' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(35);
    expect(result.signalCount).toBe(2);
  });

  it('should clamp total to maxPossible=100', () => {
    const signals = [
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `pi${i}`,
          signal_type: SignalType.PORTFOLIO_AI_INITIATIVE,
          signal_data: { initiative: `Initiative ${i}` },
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        createMockSignal({
          id: `cs${i}`,
          signal_type: SignalType.AI_CASE_STUDY,
          signal_data: { title: `Portfolio case study ${i}` },
        }),
      ),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(100);
  });

  it('should detect "portfolio" case-insensitively in signal_data', () => {
    const signals = [
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'PORTFOLIO Company Transformation' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
  });

  it('should return zero for empty signals array', () => {
    const result = dimension.score([]);

    expect(result.rawScore).toBe(0);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  it('should mix relevant case studies with and without portfolio keyword', () => {
    const signals = [
      createMockSignal({
        id: 'cs1',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'Portfolio AI transformation' },
      }),
      createMockSignal({
        id: 'cs2',
        signal_type: SignalType.AI_CASE_STUDY,
        signal_data: { title: 'General AI adoption' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(15);
    expect(result.signalCount).toBe(2);
  });
});
