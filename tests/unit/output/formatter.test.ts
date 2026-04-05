/**
 * Unit Tests for OutputFormatter
 *
 * Tests output formatting for JSON, JSONL, CSV, and table formats.
 *
 * @module tests/unit/output/formatter.test
 */

import { describe, it, expect } from 'vitest';
import { OutputFormatter, createFormatter } from '../../../src/output/formatter';
import type { TableColumn } from '../../../src/output/formatter';

describe('OutputFormatter', () => {
  describe('constructor', () => {
    it('creates formatter with default format', () => {
      const formatter = new OutputFormatter();
      expect(formatter).toBeDefined();
    });

    it('creates formatter with specified format', () => {
      const formatter = new OutputFormatter('json');
      expect(formatter).toBeDefined();
    });

    it('creates formatter with columns', () => {
      const columns: TableColumn[] = [
        { header: 'ID', key: 'id' },
        { header: 'Name', key: 'name' },
      ];
      const formatter = new OutputFormatter('table', columns);
      expect(formatter).toBeDefined();
    });
  });

  describe('setFormat', () => {
    it('changes output format', () => {
      const formatter = new OutputFormatter('table');
      formatter.setFormat('json');
      const result = formatter.format({ id: 1, name: 'Test' });
      expect(result).toContain('"id"');
      expect(result).toContain('"name"');
    });
  });

  describe('setColumns', () => {
    it('changes column definitions', () => {
      const formatter = new OutputFormatter('table');
      const columns: TableColumn[] = [
        { header: 'ID', key: 'id', width: 10 },
      ];
      formatter.setColumns(columns);
      const result = formatter.format([{ id: 1, name: 'Test' }]);
      expect(result).toContain('ID');
    });
  });

  describe('formatJson', () => {
    it('formats object as JSON', () => {
      const formatter = new OutputFormatter('json');
      const data = { id: 1, name: 'Test' };
      const result = formatter.formatJson(data);

      expect(result).toContain('"id": 1');
      expect(result).toContain('"name": "Test"');
    });

    it('formats array as JSON', () => {
      const formatter = new OutputFormatter('json');
      const data = [{ id: 1 }, { id: 2 }];
      const result = formatter.formatJson(data);

      expect(result).toContain('"id": 1');
      expect(result).toContain('"id": 2');
    });

    it('sorts keys alphabetically', () => {
      const formatter = new OutputFormatter('json');
      const data = { zebra: 'z', apple: 'a', banana: 'b' };
      const result = formatter.formatJson(data);

      // Keys should be sorted: apple, banana, zebra
      const appleIndex = result.indexOf('"apple"');
      const bananaIndex = result.indexOf('"banana"');
      const zebraIndex = result.indexOf('"zebra"');

      expect(appleIndex).toBeLessThan(bananaIndex);
      expect(bananaIndex).toBeLessThan(zebraIndex);
    });

    it('handles nested objects with sorted keys', () => {
      const formatter = new OutputFormatter('json');
      const data = {
        outer: {
          zebra: 'z',
          apple: 'a',
        },
      };
      const result = formatter.formatJson(data);

      // Nested keys should also be sorted
      const appleIndex = result.indexOf('"apple"');
      const zebraIndex = result.indexOf('"zebra"');

      expect(appleIndex).toBeLessThan(zebraIndex);
    });

    it('handles null values', () => {
      const formatter = new OutputFormatter('json');
      const data = { id: 1, name: null };
      const result = formatter.formatJson(data);

      expect(result).toContain('"id": 1');
      expect(result).toContain('"name": null');
    });

    it('handles undefined values', () => {
      const formatter = new OutputFormatter('json');
      const data = { id: 1, name: undefined };
      const result = formatter.formatJson(data);

      expect(result).toContain('"id": 1');
      // undefined should be omitted
      expect(result).not.toContain('"name"');
    });
  });

  describe('formatJsonl', () => {
    it('formats array as JSONL', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = formatter.formatJsonl(data);

      const lines = result.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('{"id":1}');
      expect(lines[1]).toBe('{"id":2}');
      expect(lines[2]).toBe('{"id":3}');
    });

    it('sorts keys in each line', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = [{ zebra: 'z', apple: 'a' }];
      const result = formatter.formatJsonl(data);

      expect(result).toBe('{"apple":"a","zebra":"z"}');
    });

    it('handles empty array', () => {
      const formatter = new OutputFormatter('jsonl');
      const result = formatter.formatJsonl([]);

      expect(result).toBe('');
    });

    it('handles complex objects', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = [{ id: 1, name: 'Test', nested: { key: 'value' } }];
      const result = formatter.formatJsonl(data);

      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ id: 1, name: 'Test', nested: { key: 'value' } });
    });
  });

  describe('formatTable', () => {
    it('formats single record', () => {
      const formatter = new OutputFormatter('table');
      const data = [{ id: 1, name: 'Test' }];
      const result = formatter.formatTable(data);

      expect(result).toContain('Id');
      expect(result).toContain('Name');
      expect(result).toContain('1');
      expect(result).toContain('Test');
    });

    it('formats multiple records', () => {
      const formatter = new OutputFormatter('table');
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = formatter.formatTable(data);

      expect(result).toContain('1');
      expect(result).toContain('Alice');
      expect(result).toContain('2');
      expect(result).toContain('Bob');
    });

    it('uses column definitions', () => {
      const columns: TableColumn[] = [
        { header: 'Identifier', key: 'id', width: 10 },
        { header: 'Full Name', key: 'name', width: 20 },
      ];
      const formatter = new OutputFormatter('table', columns);
      const data = [{ id: 1, name: 'Test' }];
      const result = formatter.formatTable(data);

      expect(result).toContain('Identifier');
      expect(result).toContain('Full Name');
    });

    it('handles empty data', () => {
      const formatter = new OutputFormatter('table');
      const result = formatter.formatTable([]);

      expect(result).toContain('No data');
    });

    it('handles null values', () => {
      const formatter = new OutputFormatter('table');
      const data = [{ id: 1, name: null }];
      const result = formatter.formatTable(data);

      expect(result).toContain('1');
      // null should display as empty
    });
  });

  describe('formatCsv', () => {
    it('formats array as CSV', () => {
      const formatter = new OutputFormatter('csv');
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      const result = formatter.formatCsv(data);

      const lines = result.split('\n');
      expect(lines[0]).toBe('id,name');
      expect(lines[1]).toBe('1,Alice');
      expect(lines[2]).toBe('2,Bob');
    });

    it('escapes commas in values', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ id: 1, name: 'Smith, John' }];
      const result = formatter.formatCsv(data);

      expect(result).toContain('"Smith, John"');
    });

    it('escapes quotes in values', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ id: 1, name: 'John "The Boss" Smith' }];
      const result = formatter.formatCsv(data);

      expect(result).toContain('"John ""The Boss"" Smith"');
    });

    it('escapes newlines in values', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ id: 1, name: 'Line 1\nLine 2' }];
      const result = formatter.formatCsv(data);

      expect(result).toContain('"Line 1\nLine 2"');
    });

    it('uses column definitions for header order', () => {
      const columns: TableColumn[] = [
        { header: 'Name', key: 'name' },
        { header: 'ID', key: 'id' },
      ];
      const formatter = new OutputFormatter('csv', columns);
      const data = [{ id: 1, name: 'Test' }];
      const result = formatter.formatCsv(data);

      const lines = result.split('\n');
      // Column order should be name, id (from columns definition)
      expect(lines[0]).toBe('name,id');
    });

    it('handles empty data', () => {
      const formatter = new OutputFormatter('csv');
      const result = formatter.formatCsv([]);

      expect(result).toBe('');
    });
  });

  describe('format', () => {
    it('formats as JSON when format is json', () => {
      const formatter = new OutputFormatter('json');
      const data = { id: 1 };
      const result = formatter.format(data);

      expect(result).toContain('"id"');
    });

    it('formats as JSONL when format is jsonl', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = [{ id: 1 }, { id: 2 }];
      const result = formatter.format(data);

      expect(result.split('\n').length).toBe(2);
    });

    it('formats as CSV when format is csv', () => {
      const formatter = new OutputFormatter('csv');
      const data = [{ id: 1 }];
      const result = formatter.format(data);

      expect(result).toContain('id');
    });

    it('formats as table when format is table', () => {
      const formatter = new OutputFormatter('table');
      const data = [{ id: 1 }];
      const result = formatter.format(data);

      expect(result).toContain('Id');
    });

    it('formats single object as JSON', () => {
      const formatter = new OutputFormatter('json');
      const data = { id: 1 };
      const result = formatter.format(data);

      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('wraps single object in array for JSONL', () => {
      const formatter = new OutputFormatter('jsonl');
      const data = { id: 1 };
      const result = formatter.format(data);

      // Single object is formatted as a single JSONL line
      expect(result).toBe('{"id":1}');
    });
  });

  describe('createFormatter', () => {
    it('creates formatter with default format', () => {
      const formatter = createFormatter();
      expect(formatter).toBeInstanceOf(OutputFormatter);
    });

    it('creates formatter with specified format', () => {
      const formatter = createFormatter('json');
      expect(formatter).toBeInstanceOf(OutputFormatter);
    });

    it('creates formatter with columns', () => {
      const columns: TableColumn[] = [{ header: 'ID', key: 'id' }];
      const formatter = createFormatter('table', columns);
      expect(formatter).toBeInstanceOf(OutputFormatter);
    });
  });
});