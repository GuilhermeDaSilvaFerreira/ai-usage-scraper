import {
  toDimensionScoreJson,
  toScoringParametersJson,
  DimensionScore,
  ScoringConfig,
  DEFAULT_SCORING_CONFIG,
} from './scoring.interfaces';

describe('toDimensionScoreJson', () => {
  it('should map camelCase fields to snake_case', () => {
    const input: DimensionScore = {
      dimension: 'ai_talent_density',
      rawScore: 8.5,
      weightedScore: 2.125,
      signalCount: 3,
      maxPossible: 10,
    };

    const result = toDimensionScoreJson(input);

    expect(result).toEqual({
      dimension: 'ai_talent_density',
      raw_score: 8.5,
      weighted_score: 2.125,
      signal_count: 3,
      max_possible: 10,
    });
  });

  it('should handle zero values', () => {
    const input: DimensionScore = {
      dimension: 'vendor_partnerships',
      rawScore: 0,
      weightedScore: 0,
      signalCount: 0,
      maxPossible: 0,
    };

    const result = toDimensionScoreJson(input);

    expect(result.raw_score).toBe(0);
    expect(result.weighted_score).toBe(0);
    expect(result.signal_count).toBe(0);
    expect(result.max_possible).toBe(0);
  });

  it('should handle decimal values', () => {
    const input: DimensionScore = {
      dimension: 'public_ai_activity',
      rawScore: 3.333,
      weightedScore: 0.667,
      signalCount: 1,
      maxPossible: 5.5,
    };

    const result = toDimensionScoreJson(input);

    expect(result.raw_score).toBe(3.333);
    expect(result.weighted_score).toBe(0.667);
    expect(result.max_possible).toBe(5.5);
  });

  it('should preserve the dimension string as-is', () => {
    const input: DimensionScore = {
      dimension: 'custom_dimension',
      rawScore: 1,
      weightedScore: 0.5,
      signalCount: 2,
      maxPossible: 10,
    };

    expect(toDimensionScoreJson(input).dimension).toBe('custom_dimension');
  });
});

describe('toScoringParametersJson', () => {
  it('should map ScoringConfig to ScoringParametersJson format', () => {
    const config: ScoringConfig = {
      version: 'v1.0',
      weights: {
        aiTalentDensity: 0.25,
        publicAIActivity: 0.2,
        aiHiringVelocity: 0.2,
        thoughtLeadership: 0.15,
        vendorPartnerships: 0.1,
        portfolioAIStrategy: 0.1,
      },
      thresholds: {
        minSignalsForScore: 1,
        highConfidenceThreshold: 0.7,
      },
    };

    const result = toScoringParametersJson(config);

    expect(result.weights).toEqual({
      ai_talent_density: 0.25,
      public_ai_activity: 0.2,
      ai_hiring_velocity: 0.2,
      thought_leadership: 0.15,
      vendor_partnerships: 0.1,
      portfolio_ai_strategy: 0.1,
    });
    expect(result.thresholds).toEqual({
      min_signals_for_score: 1,
      high_confidence_threshold: 0.7,
    });
  });

  it('should correctly convert the DEFAULT_SCORING_CONFIG', () => {
    const result = toScoringParametersJson(DEFAULT_SCORING_CONFIG);

    expect(result.weights.ai_talent_density).toBe(0.25);
    expect(result.weights.public_ai_activity).toBe(0.2);
    expect(result.weights.ai_hiring_velocity).toBe(0.2);
    expect(result.weights.thought_leadership).toBe(0.15);
    expect(result.weights.vendor_partnerships).toBe(0.1);
    expect(result.weights.portfolio_ai_strategy).toBe(0.1);
    expect(result.thresholds.min_signals_for_score).toBe(1);
    expect(result.thresholds.high_confidence_threshold).toBe(0.7);
  });

  it('should handle zero weights', () => {
    const config: ScoringConfig = {
      version: 'v2.0',
      weights: {
        aiTalentDensity: 0,
        publicAIActivity: 0,
        aiHiringVelocity: 0,
        thoughtLeadership: 0,
        vendorPartnerships: 0,
        portfolioAIStrategy: 0,
      },
      thresholds: {
        minSignalsForScore: 0,
        highConfidenceThreshold: 0,
      },
    };

    const result = toScoringParametersJson(config);

    expect(Object.values(result.weights).every((v) => v === 0)).toBe(true);
    expect(result.thresholds.min_signals_for_score).toBe(0);
    expect(result.thresholds.high_confidence_threshold).toBe(0);
  });

  it('should handle high precision decimal weights', () => {
    const config: ScoringConfig = {
      version: 'v1.1',
      weights: {
        aiTalentDensity: 0.166666,
        publicAIActivity: 0.166666,
        aiHiringVelocity: 0.166666,
        thoughtLeadership: 0.166666,
        vendorPartnerships: 0.166666,
        portfolioAIStrategy: 0.16667,
      },
      thresholds: {
        minSignalsForScore: 3,
        highConfidenceThreshold: 0.85,
      },
    };

    const result = toScoringParametersJson(config);

    expect(result.weights.ai_talent_density).toBe(0.166666);
    expect(result.thresholds.high_confidence_threshold).toBe(0.85);
  });

  it('should not include the version field in the output', () => {
    const result = toScoringParametersJson(DEFAULT_SCORING_CONFIG);
    expect(result).not.toHaveProperty('version');
  });
});
