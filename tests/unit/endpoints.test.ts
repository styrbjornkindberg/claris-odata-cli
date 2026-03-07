/**
 * Tests for Endpoint Builder
 *
 * @module tests/unit/endpoints.test
 */

import { describe, it, expect } from 'vitest';
import { EndpointBuilder } from '../../src/api/endpoints';

describe('EndpointBuilder', () => {
  const builder = new EndpointBuilder('fms.example.com', 'TestDB');

  describe('constructor', () => {
    it('should create HTTPS URL by default', () => {
      const b = new EndpointBuilder('server.com', 'db');
      expect(b.getBaseUrl()).toBe('https://server.com/fmi/odata/v4/db');
    });

    it('should create HTTP URL when useHttps is false', () => {
      const b = new EndpointBuilder('server.com', 'db', false);
      expect(b.getBaseUrl()).toBe('http://server.com/fmi/odata/v4/db');
    });
  });

  describe('getBaseUrl', () => {
    it('should return correct base URL', () => {
      expect(builder.getBaseUrl()).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB'
      );
    });
  });

  describe('metadata', () => {
    it('should return metadata URL', () => {
      expect(builder.metadata()).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB/$metadata'
      );
    });
  });

  describe('tables', () => {
    it('should return tables list URL', () => {
      expect(builder.tables()).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB'
      );
    });
  });

  describe('table', () => {
    it('should return table URL', () => {
      expect(builder.table('Users')).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB/Users'
      );
    });
  });

  describe('record', () => {
    it('should return record URL with ID', () => {
      expect(builder.record('Users', 123)).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB/Users(123)'
      );
    });
  });

  describe('createRecord', () => {
    it('should return same URL as table', () => {
      expect(builder.createRecord('Users')).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB/Users'
      );
    });
  });

  describe('script', () => {
    it('should return script URL without record context', () => {
      const url = builder.script('Users', 'My Script');
      expect(url).toContain('/Users/Script(My%20Script)');
    });

    it('should return script URL with record context', () => {
      const url = builder.script('Users', 'My Script', 123);
      expect(url).toContain('Users(123)');
      expect(url).toContain('Script(My%20Script)');
    });
  });

  describe('container', () => {
    it('should return container field URL', () => {
      expect(builder.container('Files', 1, 'Document')).toBe(
        'https://fms.example.com/fmi/odata/v4/TestDB/Files(1)/Document'
      );
    });
  });
});