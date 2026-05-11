/**
 * T4: buildPreferHeader constructs correct OData/FileMaker Prefer header values.
 */

import { describe, expect, it } from 'vitest';
import { buildPreferHeader } from '../../../src/api/prefer';

describe('buildPreferHeader', () => {
  it('returns empty object for empty options', () => {
    expect(buildPreferHeader({})).toEqual({});
  });

  it('builds odata.maxpagesize directive', () => {
    expect(buildPreferHeader({ maxPageSize: 100 })).toEqual({
      Prefer: 'odata.maxpagesize=100',
    });
  });

  it('builds return=representation directive', () => {
    expect(buildPreferHeader({ return: 'representation' })).toEqual({
      Prefer: 'return=representation',
    });
  });

  it('builds return=minimal directive', () => {
    expect(buildPreferHeader({ return: 'minimal' })).toEqual({
      Prefer: 'return=minimal',
    });
  });

  it('builds fmodata.include-specialcolumns directive when true', () => {
    expect(buildPreferHeader({ includeSpecialColumns: true })).toEqual({
      Prefer: 'fmodata.include-specialcolumns',
    });
  });

  it('omits fmodata.include-specialcolumns when false', () => {
    expect(buildPreferHeader({ includeSpecialColumns: false })).toEqual({});
  });

  it('builds fmodata.entity-ids directive when true', () => {
    expect(buildPreferHeader({ entityIds: true })).toEqual({
      Prefer: 'fmodata.entity-ids',
    });
  });

  it('builds fmodata.basic-timestamp directive when true', () => {
    expect(buildPreferHeader({ basicTimestamp: true })).toEqual({
      Prefer: 'fmodata.basic-timestamp',
    });
  });

  it('builds fmodata.gmtoffset directive with value', () => {
    expect(buildPreferHeader({ gmtOffset: -5 })).toEqual({
      Prefer: 'fmodata.gmtoffset=-5',
    });
  });

  it('builds fmodata.gmtoffset=0 correctly', () => {
    expect(buildPreferHeader({ gmtOffset: 0 })).toEqual({
      Prefer: 'fmodata.gmtoffset=0',
    });
  });

  it('combines multiple directives in canonical order', () => {
    expect(
      buildPreferHeader({
        maxPageSize: 50,
        includeSpecialColumns: true,
      })
    ).toEqual({
      Prefer: 'odata.maxpagesize=50, fmodata.include-specialcolumns',
    });
  });

  it('combines all directives', () => {
    const result = buildPreferHeader({
      maxPageSize: 200,
      return: 'representation',
      includeSpecialColumns: true,
      entityIds: true,
      basicTimestamp: true,
      gmtOffset: 2,
    });
    expect(result).toEqual({
      Prefer:
        'odata.maxpagesize=200, return=representation, fmodata.include-specialcolumns, fmodata.entity-ids, fmodata.basic-timestamp, fmodata.gmtoffset=2',
    });
  });
});
