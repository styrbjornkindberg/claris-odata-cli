/**
 * Unit tests for src/mcp-server.ts
 *
 * Tests the createMcpServer() factory. child_process is mocked so no
 * real CLI binary is invoked — these tests are fast and offline.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'child_process';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Import after mock declaration so promisify picks up the mock
import { createMcpServer, parseCommandString, ToolResult } from '../../src/mcp-server';

const mockExecFile = vi.mocked(execFile);

/** Make execFile resolve with the given stdout/stderr via Node-style callback */
function mockExecSuccess(stdout: string, stderr = '') {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: null,
      result: { stdout: string; stderr: string },
    ) => void;
    cb(null, { stdout, stderr });
  });
}

/** Make execFile reject (non-zero exit) via Node-style callback */
function mockExecFailure(message: string) {
  mockExecFile.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: Error) => void;
    cb(new Error(message));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── parseCommandString ───────────────────────────────────────────────────────

describe('parseCommandString()', () => {
  it('splits plain whitespace-separated tokens', () => {
    expect(parseCommandString('list Contacts --server myserver')).toEqual([
      'list', 'Contacts', '--server', 'myserver',
    ]);
  });

  it('preserves double-quoted argument as a single token', () => {
    expect(parseCommandString('get Contacts --filter "Status eq \'Active\'"')).toEqual([
      'get', 'Contacts', '--filter', "Status eq 'Active'",
    ]);
  });

  it('preserves single-quoted argument as a single token', () => {
    expect(parseCommandString("get Contacts --filter 'Name eq John'")).toEqual([
      'get', 'Contacts', '--filter', 'Name eq John',
    ]);
  });

  it('handles quoted JSON data containing spaces', () => {
    expect(parseCommandString('create Contacts --data \'{"Name":"Jane Doe","Age":30}\'')).toEqual([
      'create', 'Contacts', '--data', '{"Name":"Jane Doe","Age":30}',
    ]);
  });

  it('collapses extra whitespace between tokens', () => {
    expect(parseCommandString('list   Contacts')).toEqual(['list', 'Contacts']);
  });

  it('handles empty string', () => {
    expect(parseCommandString('')).toEqual([]);
  });
});

// ─── Test 1: tool registration ────────────────────────────────────────────────

describe('createMcpServer()', () => {
  it('registers exactly 2 tools: fmo_help and fmo_run', () => {
    const { tools } = createMcpServer();
    expect(tools.size).toBe(2);
    expect(tools.has('fmo_help')).toBe(true);
    expect(tools.has('fmo_run')).toBe(true);
  });
});

// ─── Tests 2 & 3: fmo_help ────────────────────────────────────────────────────

describe('fmo_help tool', () => {
  it('calls cli with --help when no command given', async () => {
    mockExecSuccess('fmo CLI help text');
    const { tools } = createMcpServer();

    const result = (await tools.get('fmo_help')!({ command: undefined })) as ToolResult;

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const callArgs = mockExecFile.mock.calls[0];
    // callArgs: ['node', [fmoBin, '--help'], options, cb]
    expect(callArgs[0]).toBe('node');
    expect(callArgs[1]).toEqual([expect.stringContaining('index.js'), '--help']);
    expect(result.content[0].text).toBe('fmo CLI help text');
  });

  it('appends --help after command tokens when command is given', async () => {
    mockExecSuccess('Credentials add help text');
    const { tools } = createMcpServer();

    await tools.get('fmo_help')!({ command: 'credentials add' });

    const callArgs = mockExecFile.mock.calls[0];
    expect(callArgs[1]).toEqual([
      expect.stringContaining('index.js'),
      'credentials',
      'add',
      '--help',
    ]);
  });
});

// ─── Tests 4, 5 & 6: fmo_run ─────────────────────────────────────────────────

describe('fmo_run tool', () => {
  it('returns stdout as text content', async () => {
    mockExecSuccess('record-123  My Record  Active');
    const { tools } = createMcpServer();

    const result = (await tools.get('fmo_run')!({
      command: 'list Contacts --server myserver --json',
    })) as ToolResult;

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('record-123  My Record  Active');
  });

  it('appends stderr under separator when stderr is non-empty', async () => {
    mockExecSuccess('main output', 'some warning');
    const { tools } = createMcpServer();

    const result = (await tools.get('fmo_run')!({
      command: 'list Contacts',
    })) as ToolResult;

    expect(result.content[0].text).toContain('main output');
    expect(result.content[0].text).toContain('--- stderr ---');
    expect(result.content[0].text).toContain('some warning');
  });

  it('passes quoted filter expression as a single argument', async () => {
    mockExecSuccess('filtered results');
    const { tools } = createMcpServer();

    await tools.get('fmo_run')!({
      command: "get Contacts --filter \"Status eq 'Active'\" --server myserver",
    });

    const callArgs = mockExecFile.mock.calls[0];
    // --filter and its value must be separate elements; the value must be whole
    const argsArray = callArgs[1] as string[];
    const filterIdx = argsArray.indexOf('--filter');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(argsArray[filterIdx + 1]).toBe("Status eq 'Active'");
  });

  it('returns isError: true when command exits with non-zero', async () => {
    mockExecFailure('Command failed: fmo list\nError: authentication failed');
    const { tools } = createMcpServer();

    const result = (await tools.get('fmo_run')!({
      command: 'list Contacts --server bad',
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Command failed');
  });
});
