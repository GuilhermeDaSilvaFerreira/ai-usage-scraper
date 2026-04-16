import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { JobLogger } from './job-logger';

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockedMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockedWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;

describe('JobLogger', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('constructor with file logging disabled', () => {
    it('should not create directory or file when NODE_ENV != ev', () => {
      process.env.NODE_ENV = 'development';
      new JobLogger('test-job');

      expect(mockedMkdirSync).not.toHaveBeenCalled();
      expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('should set filePath to null when file logging is disabled', () => {
      process.env.NODE_ENV = 'production';
      const logger = new JobLogger('test-job');

      expect(logger.getFilePath()).toBeNull();
    });
  });

  describe('constructor with file logging enabled', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'ev';
    });

    it('should create directory if it does not exist', () => {
      mockedExistsSync.mockReturnValue(false);
      new JobLogger('test-job', '/tmp/logs');

      expect(mockedMkdirSync).toHaveBeenCalledWith('/tmp/logs', {
        recursive: true,
      });
    });

    it('should not create directory if it already exists', () => {
      mockedExistsSync.mockReturnValue(true);
      new JobLogger('test-job', '/tmp/logs');

      expect(mockedMkdirSync).not.toHaveBeenCalled();
    });

    it('should create initial empty JSON file', () => {
      mockedExistsSync.mockReturnValue(true);
      new JobLogger('test-job', '/tmp/logs');

      expect(mockedWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('test-job_'),
        '[]',
        'utf-8',
      );
    });

    it('should set filePath to a non-null value', () => {
      mockedExistsSync.mockReturnValue(true);
      const logger = new JobLogger('test-job', '/tmp/logs');

      expect(logger.getFilePath()).not.toBeNull();
      expect(logger.getFilePath()).toContain('test-job_');
    });

    it('should use default logs directory when logsDir is not provided', () => {
      mockedExistsSync.mockReturnValue(false);
      new JobLogger('test-job');

      expect(mockedMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true },
      );
    });
  });

  describe('log methods with file logging enabled', () => {
    let logger: JobLogger;

    beforeEach(() => {
      process.env.NODE_ENV = 'ev';
      mockedExistsSync.mockReturnValue(true);
      mockedWriteFileSync.mockClear();
      logger = new JobLogger('test-job', '/tmp/logs');
      mockedWriteFileSync.mockClear();
    });

    it('log() should append an entry and flush to file', () => {
      logger.log('test message');

      expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written).toHaveLength(1);
      expect(written[0].level).toBe('log');
      expect(written[0].message).toBe('test message');
      expect(written[0].timestamp).toBeDefined();
    });

    it('log() should include data when provided', () => {
      logger.log('with data', { key: 'value' });

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written[0].data).toEqual({ key: 'value' });
    });

    it('log() should omit data field when data is undefined', () => {
      logger.log('no data');

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written[0]).not.toHaveProperty('data');
    });

    it('warn() should append a warn-level entry', () => {
      logger.warn('warning message');

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written[0].level).toBe('warn');
      expect(written[0].message).toBe('warning message');
    });

    it('error() should append an error-level entry', () => {
      logger.error('error message');

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written[0].level).toBe('error');
      expect(written[0].message).toBe('error message');
    });

    it('debug() should append a debug-level entry', () => {
      logger.debug('debug message');

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[0][1] as string,
      );
      expect(written[0].level).toBe('debug');
      expect(written[0].message).toBe('debug message');
    });

    it('should accumulate multiple entries', () => {
      logger.log('first');
      logger.warn('second');
      logger.error('third');

      const written = JSON.parse(
        mockedWriteFileSync.mock.calls[2][1] as string,
      );
      expect(written).toHaveLength(3);
      expect(written[0].message).toBe('first');
      expect(written[1].message).toBe('second');
      expect(written[2].message).toBe('third');
    });
  });

  describe('log methods with file logging disabled', () => {
    let logger: JobLogger;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = new JobLogger('test-job');
      mockedWriteFileSync.mockClear();
    });

    it('log() should not write to file', () => {
      logger.log('test message');
      expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('warn() should not write to file', () => {
      logger.warn('test message');
      expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('error() should not write to file', () => {
      logger.error('test message');
      expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('debug() should not write to file', () => {
      logger.debug('test message');
      expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('error handling in flush', () => {
    it('should not throw when writeFileSync fails during flush', () => {
      process.env.NODE_ENV = 'ev';
      mockedExistsSync.mockReturnValue(true);
      const logger = new JobLogger('test-job', '/tmp/logs');

      mockedWriteFileSync.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      expect(() => logger.log('test')).not.toThrow();
    });
  });

  describe('getFilePath', () => {
    it('should return null when file logging is disabled', () => {
      process.env.NODE_ENV = 'development';
      const logger = new JobLogger('test-job');
      expect(logger.getFilePath()).toBeNull();
    });

    it('should return the file path when file logging is enabled', () => {
      process.env.NODE_ENV = 'ev';
      mockedExistsSync.mockReturnValue(true);
      const logger = new JobLogger('test-job', '/tmp/logs');
      const filePath = logger.getFilePath();

      expect(filePath).not.toBeNull();
      expect(filePath).toMatch(/test-job_.*\.json$/);
    });
  });
});
