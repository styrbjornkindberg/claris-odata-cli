/**
 * Tests for Output Formatter
 *
 * @module tests/unit/output.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OutputFormatter, type TableColumn } from '../../src/utils/output';
import type { OutputFormat } from '../../src/types';
import { stripAnsi } from '../../src/lib/theme';

describe('OutputFormatter', () => {
  let formatter: OutputFormatter;

  beforeEach(() => {
    formatter = new OutputFormatter('table');
  });

  describe('setFormat', () => {
    it('should change the output format', () => {
      formatter.setFormat('json');
      const data = { name: 'test' };
      const result = formatter.formatData(data);
      expect(result).toContain('"name": "test"');
    });
  });

  describe('JSON format', () => {
    it('should format object as JSON', () => {
      formatter.setFormat('json');
      const data = { name: 'test', value: 123 };
      const result = formatter.formatData(data);
      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 123');
    });

    it('should format array as JSON', () => {
      formatter.setFormat('json');
      const data = [{ name: 'item1' }, { name: 'item2' }];
      const result = formatter.formatData(data);
      expect(result).toContain('"name": "item1"');
      expect(result).toContain('"name": "item2"');
    });
  });

  describe('CSV format', () => {
    it('should format data as CSV', () => {
      formatter.setFormat('csv');
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = formatter.formatData(data);
      expect(result).toContain('id,name');
      expect(result).toContain('1,Alice');
      expect(result).toContain('2,Bob');
    });

    it('should escape values containing commas', () => {
      formatter.setFormat('csv');
      const data = [{ id: 1, name: 'Smith, John' }];
      const result = formatter.formatData(data);
      expect(result).toContain('"Smith, John"');
    });

    it('should escape values containing quotes', () => {
      formatter.setFormat('csv');
      const data = [{ id: 1, name: 'Say "Hello"' }];
      const result = formatter.formatData(data);
      expect(result).toContain('"Say ""Hello"""');
    });
  });

  describe('Table format', () => {
    it('should format data as table', () => {
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = formatter.formatData(data);
      expect(result).toContain('Id');
      expect(result).toContain('Name');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    it('should use column definitions when provided', () => {
      const columns: TableColumn[] = [
        { header: 'ID', key: 'id', width: 5 },
        { header: 'Full Name', key: 'name' },
      ];
      const data = [{ id: 1, name: 'Alice' }];
      const result = formatter.formatData(data, columns);
      expect(result).toContain('ID');
      expect(result).toContain('Full Name');
    });

    it('should return "No data" for empty array', () => {
      const result = formatter.formatData([]);
      expect(stripAnsi(result)).toBe('No data');
    });
  });
});
