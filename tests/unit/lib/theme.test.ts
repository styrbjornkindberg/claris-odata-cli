/**
 * Unit Tests for Theme
 *
 * Tests the centralized theme module with Claris brand colors.
 */

import { describe, it, expect } from 'vitest';
import { c, stripAnsi, padEnd, kv, box, tableHeader, tableRow } from '../../../src/lib/theme';

describe('Theme', () => {
  describe('c.brand', () => {
    it('should be a function', () => {
      expect(typeof c.brand).toBe('function');
    });

    it('should apply brand color to text', () => {
      const result = c.brand('Hello');
      expect(result).toContain('Hello');
    });
  });

  describe('c.success', () => {
    it('should apply success color', () => {
      const result = c.success('Success');
      expect(result).toContain('Success');
    });
  });

  describe('c.error', () => {
    it('should apply error color', () => {
      const result = c.error('Error');
      expect(result).toContain('Error');
    });
  });

  describe('c.warn', () => {
    it('should apply warn color', () => {
      const result = c.warn('Warning');
      expect(result).toContain('Warning');
    });
  });

  describe('c.info', () => {
    it('should apply info color', () => {
      const result = c.info('Info');
      expect(result).toContain('Info');
    });
  });

  describe('c.muted', () => {
    it('should apply muted color', () => {
      const result = c.muted('Muted');
      expect(result).toContain('Muted');
    });
  });

  describe('c.ok', () => {
    it('should return success checkmark', () => {
      expect(c.ok).toContain('✓');
    });
  });

  describe('c.fail', () => {
    it('should return error X', () => {
      expect(c.fail).toContain('✗');
    });
  });

  describe('c.arrow', () => {
    it('should return arrow symbol', () => {
      expect(c.arrow).toContain('→');
    });
  });

  describe('c.bullet', () => {
    it('should return bullet symbol', () => {
      expect(c.bullet).toContain('•');
    });
  });

  describe('c.bold', () => {
    it('should return bold text', () => {
      const result = c.bold('Bold');
      expect(result).toContain('Bold');
    });
  });

  describe('c.dim', () => {
    it('should return dim text', () => {
      const result = c.dim('Dim');
      expect(result).toContain('Dim');
    });
  });

  describe('c.heading', () => {
    it('should apply heading style', () => {
      const result = c.heading('Heading');
      expect(result).toContain('Heading');
    });
  });

  describe('c.label', () => {
    it('should apply label style', () => {
      const result = c.label('Label');
      expect(result).toContain('Label');
    });
  });

  describe('c.value', () => {
    it('should apply value style', () => {
      const result = c.value('Value');
      expect(result).toContain('Value');
    });
  });

  describe('c.id', () => {
    it('should apply id style', () => {
      const result = c.id('ID');
      expect(result).toContain('ID');
    });
  });

  describe('c.tag', () => {
    it('should apply tag background', () => {
      const result = c.tag('tag');
      expect(result).toContain('tag');
    });
  });

  describe('c.resource', () => {
    it('should have server formatter', () => {
      expect(typeof c.resource.server).toBe('function');
      expect(c.resource.server('Server')).toContain('Server');
    });

    it('should have database formatter', () => {
      expect(typeof c.resource.database).toBe('function');
      expect(c.resource.database('DB')).toContain('DB');
    });

    it('should have table formatter', () => {
      expect(typeof c.resource.table).toBe('function');
      expect(c.resource.table('Table')).toContain('Table');
    });

    it('should have record formatter', () => {
      expect(typeof c.resource.record).toBe('function');
      expect(c.resource.record('Record')).toContain('Record');
    });
  });

  describe('c.status', () => {
    it('should have created formatter', () => {
      expect(typeof c.status.created).toBe('function');
    });

    it('should have updated formatter', () => {
      expect(typeof c.status.updated).toBe('function');
    });

    it('should have deleted formatter', () => {
      expect(typeof c.status.deleted).toBe('function');
    });

    it('should have error formatter', () => {
      expect(typeof c.status.error).toBe('function');
    });
  });

  describe('c.dryRun', () => {
    it('should apply dry run style', () => {
      const result = c.dryRun('DRY-RUN');
      expect(result).toContain('DRY-RUN');
    });
  });

  describe('c.danger', () => {
    it('should apply danger style', () => {
      const result = c.danger('DANGER');
      expect(result).toContain('DANGER');
    });
  });

  describe('c.safe', () => {
    it('should apply safe style', () => {
      const result = c.safe('SAFE');
      expect(result).toContain('SAFE');
    });
  });

  describe('c.header', () => {
    it('should return header formatted text', () => {
      const result = c.header('Column');
      expect(result).toContain('Column');
    });
  });

  describe('c.separator', () => {
    it('should return separator string', () => {
      const result = c.separator();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('c.divider', () => {
    it('should return divider character', () => {
      const result = c.divider();
      expect(result).toBe('│');
    });
  });

  describe('c.added', () => {
    it('should format added text', () => {
      const result = c.added('line');
      expect(result).toContain('line');
    });
  });

  describe('c.removed', () => {
    it('should format removed text', () => {
      const result = c.removed('line');
      expect(result).toContain('line');
    });
  });

  describe('c.changed', () => {
    it('should format changed text', () => {
      const result = c.changed('line');
      expect(result).toContain('line');
    });
  });

  describe('stripAnsi', () => {
    it('should remove ANSI codes', () => {
      const colored = c.brand('Hello');
      const stripped = stripAnsi(colored);
      expect(stripped).toBe('Hello');
    });

    it('should return original string if no ANSI codes', () => {
      expect(stripAnsi('Plain')).toBe('Plain');
    });

    it('should handle empty string', () => {
      expect(stripAnsi('')).toBe('');
    });
  });

  describe('padEnd', () => {
    it('should pad string to specified width', () => {
      const result = padEnd('Hi', 6);
      expect(result).toBe('Hi    ');
      expect(result.length).toBe(6);
    });

    it('should not pad if already at width', () => {
      expect(padEnd('Hi', 2)).toBe('Hi');
    });

    it('should handle ANSI codes in calculation', () => {
      const colored = c.brand('Hi');
      const result = padEnd(colored, 6);
      expect(result.length).toBe(6);
    });

    it('should handle width of 0', () => {
      expect(padEnd('Hi', 0)).toBe('Hi');
    });
  });

  describe('kv', () => {
    it('should format key-value pair', () => {
      const result = kv('Name', 'Value');
      expect(result).toContain('Name:');
      expect(result).toContain('Value');
    });
  });

  describe('tableHeader', () => {
    it('should format header with columns', () => {
      const result = tableHeader({ label: 'Name', width: 10 }, { label: 'Age', width: 5 });
      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('─'.repeat(10));
    });
  });

  describe('tableRow', () => {
    it('should format row with cells', () => {
      const result = tableRow({ text: 'John', width: 10 }, { text: '30', width: 5 });
      expect(result).toContain('John');
      expect(result).toContain('30');
    });

    it('should pad cells to width', () => {
      const result = tableRow({ text: 'A', width: 5 });
      expect(result.length).toBe(5);
    });
  });

  describe('box', () => {
    it('should create box with title and lines', () => {
      const result = box('Title', ['Line 1', 'Line 2']);
      expect(result).toContain('Title');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });

    it('should use box-drawing characters', () => {
      const result = box('T', []);
      expect(result).toContain('╭');
      expect(result).toContain('╮');
      expect(result).toContain('╰');
      expect(result).toContain('╯');
    });

    it('should handle empty lines', () => {
      const result = box('Title', []);
      expect(result).toContain('Title');
    });

    it('should handle long lines', () => {
      const result = box('Title', ['This is a very long line that should fit']);
      expect(result).toContain('Title');
    });
  });
});