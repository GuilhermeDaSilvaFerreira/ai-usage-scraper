import { SignalType } from '../../../common/enums/signal-type.enum';
import {
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
} from '../../../common/interfaces/scoring.interfaces';
import { ScoringEngine } from './scoring-engine';
import { AiTalentDimension } from './dimensions/ai-talent.dimension';
import { PublicActivityDimension } from './dimensions/public-activity.dimension';
import { HiringSignalsDimension } from './dimensions/hiring-signals.dimension';
import { ThoughtLeadershipDimension } from './dimensions/thought-leadership.dimension';
import { VendorPartnershipsDimension } from './dimensions/vendor-partnerships.dimension';
import { PortfolioStrategyDimension } from './dimensions/portfolio-strategy.dimension';

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

function createMockDimension(
  name: string,
  scoreResult = {
    rawScore: 50,
    maxPossible: 100,
    signalCount: 1,
    evidence: [],
  },
) {
  return {
    name,
    relevantSignalTypes: [],
    score: jest.fn().mockReturnValue(scoreResult),
    filterRelevant: jest.fn(),
    clamp: jest.fn(),
    buildCappedEvidence: jest.fn(),
    confidenceWeightedCount: jest.fn(),
  };
}

/**
 * The engine looks up weights using `(weights as Record<string, number>)[dimensionKey]`
 * where dimensionKey is snake_case (e.g. 'ai_talent_density'). Since the DimensionWeight
 * interface uses camelCase keys, we need to provide a config with snake_case keys when
 * testing weight application, or rely on the `?? 0` fallback.
 */
function createSnakeCaseWeightConfig(
  overrides: Partial<Record<string, any>> = {},
): ScoringConfig {
  return {
    version: 'test-v1',
    weights: {
      ai_talent_density: 0.25,
      public_ai_activity: 0.2,
      ai_hiring_velocity: 0.2,
      thought_leadership: 0.15,
      vendor_partnerships: 0.1,
      portfolio_ai_strategy: 0.1,
      ...overrides,
    } as any,
    thresholds: {
      minSignalsForScore: 1,
      highConfidenceThreshold: 0.7,
    },
  };
}

describe('ScoringEngine', () => {
  let engine: ScoringEngine;
  let mockAiTalent: any;
  let mockPublicActivity: any;
  let mockHiringSignals: any;
  let mockThoughtLeadership: any;
  let mockVendorPartnerships: any;
  let mockPortfolioStrategy: any;

  beforeEach(() => {
    mockAiTalent = createMockDimension('ai_talent_density');
    mockPublicActivity = createMockDimension('public_ai_activity');
    mockHiringSignals = createMockDimension('ai_hiring_velocity');
    mockThoughtLeadership = createMockDimension('thought_leadership');
    mockVendorPartnerships = createMockDimension('vendor_partnerships');
    mockPortfolioStrategy = createMockDimension('portfolio_ai_strategy');

    engine = new ScoringEngine(
      mockAiTalent as unknown as AiTalentDimension,
      mockPublicActivity as unknown as PublicActivityDimension,
      mockHiringSignals as unknown as HiringSignalsDimension,
      mockThoughtLeadership as unknown as ThoughtLeadershipDimension,
      mockVendorPartnerships as unknown as VendorPartnershipsDimension,
      mockPortfolioStrategy as unknown as PortfolioStrategyDimension,
    );
  });

  it('should return zero score with empty dimensions when signals < minSignalsForScore', () => {
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      thresholds: { minSignalsForScore: 5, highConfidenceThreshold: 0.7 },
    };
    const signals = [createMockSignal(), createMockSignal({ id: 's2' })];

    const result = engine.scoreFirm(signals, config);

    expect(result.overallScore).toBe(0);
    expect(result.dimensions).toEqual([]);
    expect(result.signalCount).toBe(2);
    expect(result.evidence).toEqual([]);
    expect(mockAiTalent.score).not.toHaveBeenCalled();
  });

  it('should call all dimension scorers and compute weighted scores', () => {
    const config = createSnakeCaseWeightConfig();
    const signals = [createMockSignal(), createMockSignal({ id: 's2' })];

    const result = engine.scoreFirm(signals, config);

    expect(mockAiTalent.score).toHaveBeenCalledWith(signals);
    expect(mockPublicActivity.score).toHaveBeenCalledWith(signals);
    expect(mockHiringSignals.score).toHaveBeenCalledWith(signals);
    expect(mockThoughtLeadership.score).toHaveBeenCalledWith(signals);
    expect(mockVendorPartnerships.score).toHaveBeenCalledWith(signals);
    expect(mockPortfolioStrategy.score).toHaveBeenCalledWith(signals);

    expect(result.dimensions).toHaveLength(6);
    expect(result.signalCount).toBe(2);
  });

  it('should compute correct overall score from dimension weights', () => {
    mockAiTalent.score.mockReturnValue({
      rawScore: 80,
      maxPossible: 100,
      signalCount: 2,
      evidence: [],
    });
    mockPublicActivity.score.mockReturnValue({
      rawScore: 60,
      maxPossible: 100,
      signalCount: 1,
      evidence: [],
    });
    mockHiringSignals.score.mockReturnValue({
      rawScore: 40,
      maxPossible: 100,
      signalCount: 3,
      evidence: [],
    });
    mockThoughtLeadership.score.mockReturnValue({
      rawScore: 20,
      maxPossible: 100,
      signalCount: 1,
      evidence: [],
    });
    mockVendorPartnerships.score.mockReturnValue({
      rawScore: 50,
      maxPossible: 100,
      signalCount: 2,
      evidence: [],
    });
    mockPortfolioStrategy.score.mockReturnValue({
      rawScore: 30,
      maxPossible: 100,
      signalCount: 1,
      evidence: [],
    });

    const config = createSnakeCaseWeightConfig();
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    expect(result.overallScore).toBe(51);
  });

  it('should handle custom config weights', () => {
    mockAiTalent.score.mockReturnValue({
      rawScore: 100,
      maxPossible: 100,
      signalCount: 1,
      evidence: [],
    });
    const zeroResult = {
      rawScore: 0,
      maxPossible: 100,
      signalCount: 0,
      evidence: [],
    };
    mockPublicActivity.score.mockReturnValue(zeroResult);
    mockHiringSignals.score.mockReturnValue(zeroResult);
    mockThoughtLeadership.score.mockReturnValue(zeroResult);
    mockVendorPartnerships.score.mockReturnValue(zeroResult);
    mockPortfolioStrategy.score.mockReturnValue(zeroResult);

    const config = createSnakeCaseWeightConfig({
      ai_talent_density: 1.0,
      public_ai_activity: 0,
      ai_hiring_velocity: 0,
      thought_leadership: 0,
      vendor_partnerships: 0,
      portfolio_ai_strategy: 0,
    });
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    expect(result.overallScore).toBe(100);
  });

  it('should handle zero maxPossible edge case (avoids division by zero)', () => {
    mockAiTalent.score.mockReturnValue({
      rawScore: 50,
      maxPossible: 0,
      signalCount: 1,
      evidence: [],
    });
    const normalResult = {
      rawScore: 0,
      maxPossible: 100,
      signalCount: 0,
      evidence: [],
    };
    mockPublicActivity.score.mockReturnValue(normalResult);
    mockHiringSignals.score.mockReturnValue(normalResult);
    mockThoughtLeadership.score.mockReturnValue(normalResult);
    mockVendorPartnerships.score.mockReturnValue(normalResult);
    mockPortfolioStrategy.score.mockReturnValue(normalResult);

    const config = createSnakeCaseWeightConfig();
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    const aiTalentDim = result.dimensions.find(
      (d) => d.dimension === 'ai_talent_density',
    );
    expect(aiTalentDim!.rawScore).toBe(0);
    expect(aiTalentDim!.weightedScore).toBe(0);
  });

  it('should aggregate evidence from all dimensions', () => {
    const evidence1 = [
      {
        signalId: 's1',
        dimension: 'ai_talent_density',
        weightApplied: 10,
        pointsContributed: 10,
        reasoning: 'test',
      },
    ];
    const evidence2 = [
      {
        signalId: 's2',
        dimension: 'public_ai_activity',
        weightApplied: 8,
        pointsContributed: 8,
        reasoning: 'test2',
      },
    ];
    mockAiTalent.score.mockReturnValue({
      rawScore: 10,
      maxPossible: 100,
      signalCount: 1,
      evidence: evidence1,
    });
    mockPublicActivity.score.mockReturnValue({
      rawScore: 8,
      maxPossible: 100,
      signalCount: 1,
      evidence: evidence2,
    });

    const zeroResult = {
      rawScore: 0,
      maxPossible: 100,
      signalCount: 0,
      evidence: [],
    };
    mockHiringSignals.score.mockReturnValue(zeroResult);
    mockThoughtLeadership.score.mockReturnValue(zeroResult);
    mockVendorPartnerships.score.mockReturnValue(zeroResult);
    mockPortfolioStrategy.score.mockReturnValue(zeroResult);

    const config = createSnakeCaseWeightConfig();
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    expect(result.evidence).toHaveLength(2);
    expect(result.evidence).toEqual(
      expect.arrayContaining([...evidence1, ...evidence2]),
    );
  });

  it('should round dimension rawScore and weightedScore to 2 decimal places', () => {
    mockAiTalent.score.mockReturnValue({
      rawScore: 33,
      maxPossible: 100,
      signalCount: 1,
      evidence: [],
    });
    const zeroResult = {
      rawScore: 0,
      maxPossible: 100,
      signalCount: 0,
      evidence: [],
    };
    mockPublicActivity.score.mockReturnValue(zeroResult);
    mockHiringSignals.score.mockReturnValue(zeroResult);
    mockThoughtLeadership.score.mockReturnValue(zeroResult);
    mockVendorPartnerships.score.mockReturnValue(zeroResult);
    mockPortfolioStrategy.score.mockReturnValue(zeroResult);

    const config = createSnakeCaseWeightConfig({ ai_talent_density: 0.33 });
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    const dim = result.dimensions.find(
      (d) => d.dimension === 'ai_talent_density',
    );
    expect(dim!.rawScore).toBe(33);
    expect(dim!.weightedScore).toBe(10.89);
  });

  it('should use DEFAULT_SCORING_CONFIG when no config is provided', () => {
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals);

    expect(result.dimensions).toHaveLength(6);
    expect(mockAiTalent.score).toHaveBeenCalled();
  });

  it('should set maxPossible to 100 for each dimension in the result', () => {
    const config = createSnakeCaseWeightConfig();
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    for (const dim of result.dimensions) {
      expect(dim.maxPossible).toBe(100);
    }
  });

  it('should use weight 0 for unknown dimension keys via fallback', () => {
    const config: ScoringConfig = {
      version: 'test',
      weights: {
        aiTalentDensity: 0,
        publicAIActivity: 0,
        aiHiringVelocity: 0,
        thoughtLeadership: 0,
        vendorPartnerships: 0,
        portfolioAIStrategy: 0,
      },
      thresholds: { minSignalsForScore: 1, highConfidenceThreshold: 0.7 },
    };
    const signals = [createMockSignal()];

    const result = engine.scoreFirm(signals, config);

    expect(result.overallScore).toBe(0);
    for (const dim of result.dimensions) {
      expect(dim.weightedScore).toBe(0);
    }
  });
});
