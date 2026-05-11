/**
 * Unit Tests for ProfileStore and ProfileManager
 *
 * Mocks fs to avoid touching the real ~/.config directory.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { profileStore, ProfileManager } from '../../../src/config/profiles';

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

import fs from 'fs';

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);

function makeProfilesJson(
  profiles: Record<string, { name: string; outputFormat: string }> = {
    default: { name: 'default', outputFormat: 'table' },
  },
  activeProfile = 'default'
): string {
  return JSON.stringify({ profiles, activeProfile });
}

describe('ProfileStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue(makeProfilesJson());
  });

  describe('get', () => {
    it('returns the profile when it exists', () => {
      mockReadFileSync.mockReturnValue(
        makeProfilesJson({ default: { name: 'default', outputFormat: 'table' } })
      );
      const result = profileStore.get('default');
      expect(result).toEqual({ name: 'default', outputFormat: 'table' });
    });

    it('returns undefined when profile does not exist', () => {
      const result = profileStore.get('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all profiles as an array', () => {
      mockReadFileSync.mockReturnValue(
        makeProfilesJson({
          default: { name: 'default', outputFormat: 'table' },
          staging: { name: 'staging', outputFormat: 'json' },
        })
      );
      const result = profileStore.getAll();
      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ name: 'default', outputFormat: 'table' });
      expect(result).toContainEqual({ name: 'staging', outputFormat: 'json' });
    });
  });

  describe('set', () => {
    it('writes the updated profile to disk', () => {
      mockReadFileSync.mockReturnValue(makeProfilesJson());
      const profile = { name: 'staging', outputFormat: 'json' as const };
      profileStore.set(profile);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.profiles.staging).toEqual(profile);
    });
  });

  describe('delete', () => {
    it('returns false when trying to delete the default profile', () => {
      const result = profileStore.delete('default');
      expect(result).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('returns false when profile does not exist', () => {
      const result = profileStore.delete('ghost');
      expect(result).toBe(false);
    });

    it('deletes existing non-default profile and returns true', () => {
      mockReadFileSync.mockReturnValue(
        makeProfilesJson({
          default: { name: 'default', outputFormat: 'table' },
          staging: { name: 'staging', outputFormat: 'json' },
        })
      );
      const result = profileStore.delete('staging');
      expect(result).toBe(true);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.profiles.staging).toBeUndefined();
    });
  });

  describe('getActive', () => {
    it('returns the active profile name', () => {
      mockReadFileSync.mockReturnValue(makeProfilesJson({}, 'default'));
      expect(profileStore.getActive()).toBe('default');
    });
  });

  describe('setActive', () => {
    it('sets active profile when it exists and returns true', () => {
      mockReadFileSync.mockReturnValue(
        makeProfilesJson({
          default: { name: 'default', outputFormat: 'table' },
          staging: { name: 'staging', outputFormat: 'json' },
        })
      );
      const result = profileStore.setActive('staging');
      expect(result).toBe(true);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written.activeProfile).toBe('staging');
    });

    it('returns false when profile does not exist', () => {
      const result = profileStore.setActive('ghost');
      expect(result).toBe(false);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('readData fallback', () => {
    it('returns defaults when the profiles file does not exist', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const all = profileStore.getAll();
      expect(all).toContainEqual(expect.objectContaining({ name: 'default' }));
    });
  });
});

describe('ProfileManager', () => {
  let manager: ProfileManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue(makeProfilesJson());
    manager = new ProfileManager();
  });

  describe('setProfile', () => {
    it('creates a profile with defaults when no config given', () => {
      const result = manager.setProfile('prod');
      expect(result).toEqual({
        name: 'prod',
        outputFormat: 'table',
        defaultServer: undefined,
        defaultDatabase: undefined,
      });
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('creates a profile with provided config', () => {
      const result = manager.setProfile('prod', {
        outputFormat: 'json',
        defaultServer: 's1',
        defaultDatabase: 'db1',
      });
      expect(result.outputFormat).toBe('json');
      expect(result.defaultServer).toBe('s1');
      expect(result.defaultDatabase).toBe('db1');
    });
  });

  describe('getProfile', () => {
    it('returns profile when it exists', () => {
      const result = manager.getProfile('default');
      expect(result).toEqual({ name: 'default', outputFormat: 'table' });
    });

    it('returns undefined when profile does not exist', () => {
      expect(manager.getProfile('ghost')).toBeUndefined();
    });
  });

  describe('listProfiles', () => {
    it('returns all profiles', () => {
      const result = manager.listProfiles();
      expect(result).toContainEqual(expect.objectContaining({ name: 'default' }));
    });
  });

  describe('deleteProfile', () => {
    it('delegates to profileStore.delete', () => {
      const result = manager.deleteProfile('default');
      expect(result).toBe(false);
    });
  });

  describe('getActiveProfile', () => {
    it('returns the active profile name', () => {
      expect(manager.getActiveProfile()).toBe('default');
    });
  });

  describe('setActiveProfile', () => {
    it('returns true when profile exists', () => {
      expect(manager.setActiveProfile('default')).toBe(true);
    });

    it('returns false when profile does not exist', () => {
      expect(manager.setActiveProfile('ghost')).toBe(false);
    });
  });

  describe('getCurrentProfile', () => {
    it('returns the currently active profile', () => {
      const result = manager.getCurrentProfile();
      expect(result).toEqual({ name: 'default', outputFormat: 'table' });
    });

    it('throws when active profile is missing from store', () => {
      mockReadFileSync
        .mockReturnValueOnce(JSON.stringify({ profiles: {}, activeProfile: 'missing' }))
        .mockReturnValueOnce(JSON.stringify({ profiles: {}, activeProfile: 'missing' }));
      expect(() => manager.getCurrentProfile()).toThrow("Profile 'missing' not found");
    });
  });
});
