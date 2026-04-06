/**
 * Tests for Logger
 *
 * @module tests/unit/logger.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger({ timestamps: false, colors: false });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('setLevel', () => {
    it('should change minimum log level', () => {
      logger.setLevel('warn');

      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should appear');

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('WARN');
      expect(call).toContain('should appear');
    });
  });

  describe('debug', () => {
    it('should log debug messages at debug level', () => {
      logger.setLevel('debug');
      logger.debug('test message');

      expect(stderrSpy).toHaveBeenCalled();
      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('DEBUG');
      expect(call).toContain('test message');
    });

    it('should not log debug at info level', () => {
      logger.setLevel('info');
      logger.debug('test message');

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages to stderr', () => {
      logger.info('test message');

      expect(stderrSpy).toHaveBeenCalled();
      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('INFO');
      expect(call).toContain('test message');
    });

    it('should include data when provided', () => {
      logger.info('test message', { key: 'value' });

      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('"key":"value"');
    });
  });

  describe('warn', () => {
    it('should log warning messages to stderr', () => {
      logger.warn('test message');

      expect(stderrSpy).toHaveBeenCalled();
      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('WARN');
    });
  });

  describe('error', () => {
    it('should log error messages to stderr', () => {
      logger.error('test message');

      expect(stderrSpy).toHaveBeenCalled();
      const call = stderrSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('ERROR');
      expect(call).toContain('test message');
    });
  });
});
