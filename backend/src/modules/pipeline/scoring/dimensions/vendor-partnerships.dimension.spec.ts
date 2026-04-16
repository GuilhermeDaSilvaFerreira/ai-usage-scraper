import { SignalType } from '../../../../common/enums/signal-type.enum';
import { VendorPartnershipsDimension } from './vendor-partnerships.dimension';

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

describe('VendorPartnershipsDimension', () => {
  let dimension: VendorPartnershipsDimension;

  beforeEach(() => {
    dimension = new VendorPartnershipsDimension();
  });

  it('should have correct name and relevant signal types', () => {
    expect(dimension.name).toBe('vendor_partnerships');
    expect(dimension.relevantSignalTypes).toEqual([
      SignalType.AI_VENDOR_PARTNERSHIP,
      SignalType.TECH_STACK_SIGNAL,
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

  it('should score vendor partnerships at 20pts per unique vendor', () => {
    const signals = [
      createMockSignal({
        id: 'vp1',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'OpenAI' },
      }),
      createMockSignal({
        id: 'vp2',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'Anthropic' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
    expect(result.signalCount).toBe(2);
  });

  it('should count duplicate vendor names only once', () => {
    const signals = [
      createMockSignal({
        id: 'vp1',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'OpenAI' },
      }),
      createMockSignal({
        id: 'vp2',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'OpenAI' },
      }),
      createMockSignal({
        id: 'vp3',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'openai' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(20);
  });

  it('should cap vendor partnership points at 60', () => {
    const vendors = ['OpenAI', 'Anthropic', 'Google', 'Microsoft', 'AWS'];
    const signals = vendors.map((vendor, i) =>
      createMockSignal({
        id: `vp${i}`,
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: vendor },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(60);
  });

  it('should handle missing vendor_name as "unknown"', () => {
    const signals = [
      createMockSignal({
        id: 'vp1',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: {},
      }),
      createMockSignal({
        id: 'vp2',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: {},
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(20);
  });

  it('should score tech stack signals at 10pts each', () => {
    const signals = [
      createMockSignal({
        id: 'ts1',
        signal_type: SignalType.TECH_STACK_SIGNAL,
        signal_data: { tech: 'TensorFlow' },
      }),
      createMockSignal({
        id: 'ts2',
        signal_type: SignalType.TECH_STACK_SIGNAL,
        signal_data: { tech: 'PyTorch' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(20);
    expect(result.signalCount).toBe(2);
  });

  it('should cap tech stack signal points at 40', () => {
    const signals = Array.from({ length: 6 }, (_, i) =>
      createMockSignal({
        id: `ts${i}`,
        signal_type: SignalType.TECH_STACK_SIGNAL,
        signal_data: { tech: `Tech ${i}` },
      }),
    );

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
  });

  it('should combine vendor partnerships and tech stack signals', () => {
    const signals = [
      createMockSignal({
        id: 'vp1',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'OpenAI' },
      }),
      createMockSignal({
        id: 'ts1',
        signal_type: SignalType.TECH_STACK_SIGNAL,
        signal_data: { tech: 'TensorFlow' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(30);
    expect(result.signalCount).toBe(2);
  });

  it('should clamp total to maxPossible=100', () => {
    const signals = [
      ...['OpenAI', 'Anthropic', 'Google'].map((vendor, i) =>
        createMockSignal({
          id: `vp${i}`,
          signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
          signal_data: { vendor_name: vendor },
        }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        createMockSignal({
          id: `ts${i}`,
          signal_type: SignalType.TECH_STACK_SIGNAL,
          signal_data: { tech: `Tech ${i}` },
        }),
      ),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(100);
  });

  it('should handle multiple unique vendors correctly', () => {
    const signals = [
      createMockSignal({
        id: 'vp1',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'Vendor A' },
      }),
      createMockSignal({
        id: 'vp2',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'Vendor B' },
      }),
      createMockSignal({
        id: 'vp3',
        signal_type: SignalType.AI_VENDOR_PARTNERSHIP,
        signal_data: { vendor_name: 'Vendor A' },
      }),
    ];

    const result = dimension.score(signals);

    expect(result.rawScore).toBe(40);
  });

  it('should return zero for empty signals array', () => {
    const result = dimension.score([]);

    expect(result.rawScore).toBe(0);
    expect(result.signalCount).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });
});
