/**
 * Tests for Logger
 *
 * @module tests/unit/logger.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../src/utils/logger';
import type { LogLevel } from '../../src/types';

describe('Logger', () => {
  let logger: Logger;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger({ timestamps: false, colors: false });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  describe('setLevel', () => {
    it('should change minimum log level', () => {
      logger.setLevel('warn');

      logger.debug('should not appear');
      logger.info('should not appear');
      logger.warn('should appear');

      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalled();
    });
  });

  describe('debug', () => {
    it('should log debug messages at debug level', () => {
      logger.setLevel('debug');
      logger.debug('test message');

      expect(stdoutSpy).toHaveBeenCalled();
      const call = stdoutSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('DEBUG');
      expect(call).toContain('test message');
    });

    it('should not log debug at info level', () => {
      logger.setLevel('info');
      logger.debug('test message');

      expect(stdoutSpy).not.toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('test message');

      expect(stdoutSpy).toHaveBeenCalled();
      const call = stdoutSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('INFO');
      expect(call).toContain('test message');
    });

    it('should include data when provided', () => {
      logger.info('test message', { key: 'value' });

      const call = stdoutSpy.mock.calls[0]?.[0] ?? '';
      expect(call).toContain('"key":"value"');
    });
  });

  describe('warn', () => {
    it('should log warning messages to stdout', () => {
      logger.warn('test message');

      expect(stdoutSpy).toHaveBeenCalled();
      const call = stdoutSpy.mock.calls[0]?.[0] ?? '';
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
