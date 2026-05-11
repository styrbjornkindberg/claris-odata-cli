/**
 * Unit Tests for BaseCommand.formatError
 */

import { describe, it, expect } from 'vitest';
import { BaseCommand } from '../../../src/cli/index';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ODataError,
} from '../../../src/api/errors';
import type { CommandResult } from '../../../src/types';

class TestCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    return { success: true };
  }
  callFormatError(error: unknown): string {
    return this.formatError(error);
  }
}

describe('BaseCommand.formatError', () => {
  const cmd = new TestCommand({});

  it('AuthenticationError → Authentication failed', () => {
    expect(cmd.callFormatError(new AuthenticationError('x', {}))).toBe('Authentication failed');
  });

  it('AuthorizationError → Authorization failed', () => {
    expect(cmd.callFormatError(new AuthorizationError('x', {}))).toBe('Authorization failed');
  });

  it('NotFoundError → Not found', () => {
    expect(cmd.callFormatError(new NotFoundError('x', {}))).toBe('Not found');
  });

  it('ODataError 500 with ECONNREFUSED → Connection refused', () => {
    expect(cmd.callFormatError(new ODataError('connect ECONNREFUSED 127.0.0.1:443', 500))).toBe(
      'Connection refused'
    );
  });

  it('ODataError 500 with ETIMEDOUT → Connection timeout', () => {
    expect(cmd.callFormatError(new ODataError('connect ETIMEDOUT 10.0.0.1:443', 500))).toBe(
      'Connection timeout'
    );
  });

  it('ODataError 500 with ENOTFOUND → Host not found', () => {
    expect(cmd.callFormatError(new ODataError('getaddrinfo ENOTFOUND host', 500))).toBe(
      'Host not found'
    );
  });

  it('ODataError 500 with CERT_HAS_EXPIRED → Certificate expired', () => {
    expect(cmd.callFormatError(new ODataError('CERT_HAS_EXPIRED', 500))).toBe(
      'Certificate expired'
    );
  });

  it('ODataError 500 generic → Server error', () => {
    expect(cmd.callFormatError(new ODataError('Internal server error', 500))).toBe('Server error');
  });

  it('ODataError non-500 → message', () => {
    expect(cmd.callFormatError(new ODataError('Bad request', 400))).toBe('Bad request');
  });

  it('plain Error → message', () => {
    expect(cmd.callFormatError(new Error('something broke'))).toBe('something broke');
  });

  it('unknown value → Unknown error', () => {
    expect(cmd.callFormatError('oops')).toBe('Unknown error');
  });
});
