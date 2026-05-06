/**
 * T3: EndpointBuilder — port support, serviceDocument(), batch()
 */

import { describe, expect, it } from 'vitest';
import { EndpointBuilder } from '../../../src/api/endpoints';

describe('EndpointBuilder', () => {
  describe('existing methods remain correct', () => {
    it('metadata() returns database-scoped $metadata URL', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.metadata()).toBe('https://fm.example.com:443/fmi/odata/v4/MyDB/$metadata');
    });

    it('tables() returns database-scoped base URL', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.tables()).toBe('https://fm.example.com:443/fmi/odata/v4/MyDB');
    });

    it('table() appends table name', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.table('Contacts')).toBe('https://fm.example.com:443/fmi/odata/v4/MyDB/Contacts');
    });

    it('record() appends record ID', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.record('Contacts', 42)).toBe(
        'https://fm.example.com:443/fmi/odata/v4/MyDB/Contacts(42)'
      );
    });
  });

  describe('port in constructor', () => {
    it('defaults to port 443 with HTTPS', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.tables()).toContain(':443/');
    });

    it('uses custom port when supplied', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', true, 8443);
      expect(b.tables()).toContain(':8443/');
    });

    it('uses port 80 as default for HTTP', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', false);
      expect(b.tables()).toContain(':80/');
    });

    it('uses custom HTTP port when supplied', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', false, 8080);
      expect(b.tables()).toContain(':8080/');
    });

    it('includes port in all URL-generating methods', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', true, 9443);
      expect(b.metadata()).toContain(':9443/');
      expect(b.table('T')).toContain(':9443/');
      expect(b.record('T', 1)).toContain(':9443/');
    });
  });

  describe('serviceDocument()', () => {
    it('returns root service document URL with no database path', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.serviceDocument()).toBe('https://fm.example.com:443/fmi/odata/v4/');
    });

    it('includes custom port', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', true, 8443);
      expect(b.serviceDocument()).toBe('https://fm.example.com:8443/fmi/odata/v4/');
    });

    it('uses http when useHttps=false', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', false, 80);
      expect(b.serviceDocument()).toBe('http://fm.example.com:80/fmi/odata/v4/');
    });

    it('does not include database name in service document URL', () => {
      const b = new EndpointBuilder('fm.example.com', 'SensitiveDB');
      expect(b.serviceDocument()).not.toContain('SensitiveDB');
    });
  });

  describe('batch()', () => {
    it('returns $batch URL', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB');
      expect(b.batch()).toBe('https://fm.example.com:443/fmi/odata/v4/$batch');
    });

    it('includes custom port', () => {
      const b = new EndpointBuilder('fm.example.com', 'MyDB', true, 8443);
      expect(b.batch()).toBe('https://fm.example.com:8443/fmi/odata/v4/$batch');
    });
  });
});
