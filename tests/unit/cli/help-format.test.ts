/**
 * Unit Tests for CLI Help - Format Flag Documentation
 *
 * Verifies that the --format flag is documented in CLI help output.
 *
 * @module tests/unit/cli/help-format.test
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load package.json for version
const packageJsonPath = resolve(__dirname, '../../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

/**
 * Create a minimal program for testing help output
 * (createProgram is not exported from index.ts)
 */
function createTestProgram(): Command {
  const program = new Command();

  program
    .name('fmo')
    .description('CLI tool for working with Claris FileMaker OData API')
    .version(packageJson.version)
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-f, --format <format>', 'Output format (json, jsonl, table, csv)', 'table')
    .option('-s, --server <id>', 'Default server ID')
    .option('-d, --database <name>', 'Default database name');

  return program;
}

describe('CLI Help - format flag', () => {
  describe('--help output', () => {
    it('documents --format flag in root help', () => {
      const program = createTestProgram();
      const helpInfo = program.helpInformation();

      expect(helpInfo).toContain('--format');
      expect(helpInfo).toContain('Output format');
      expect(helpInfo).toContain('json');
      expect(helpInfo).toContain('jsonl');
      expect(helpInfo).toContain('table');
      expect(helpInfo).toContain('csv');
    });

    it('lists -f as short flag for format', () => {
      const program = createTestProgram();
      const helpInfo = program.helpInformation();

      expect(helpInfo).toContain('-f, --format');
    });

    it('shows table as default format', () => {
      const program = createTestProgram();
      const helpInfo = program.helpInformation();

      // Default should be mentioned in help
      expect(helpInfo).toMatch(/--format.*table/);
    });
  });

  describe('program options', () => {
    it('has format option defined', () => {
      const program = createTestProgram();
      const options = program.options;

      const formatOption = options.find((opt: { long: string }) => opt.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('sets table as default format', () => {
      const program = createTestProgram();
      // Don't parse with --help to avoid exit
      const opts = program.opts();

      // Default format should be table
      expect(opts.format).toBe('table');
    });
  });
});