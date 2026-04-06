/**
 * Profile Management
 *
 * Manages environment profiles for different configurations.
 *
 * @module config/profiles
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Profile } from '../types';

/**
 * Default profile name
 */
const DEFAULT_PROFILE = 'default';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claris-odata-cli');
const PROFILES_FILE = path.join(CONFIG_DIR, 'profiles.json');

interface ProfilesData {
  profiles: Record<string, Profile>;
  activeProfile: string;
}

const DEFAULTS: ProfilesData = {
  profiles: { [DEFAULT_PROFILE]: { name: DEFAULT_PROFILE, outputFormat: 'table' } },
  activeProfile: DEFAULT_PROFILE,
};

function readData(): ProfilesData {
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    return JSON.parse(raw) as ProfilesData;
  } catch {
    return { profiles: { ...DEFAULTS.profiles }, activeProfile: DEFAULTS.activeProfile };
  }
}

function writeData(data: ProfilesData): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Persistent profile store backed by ~/.config/claris-odata-cli/profiles.json
 */
class ProfileStore {
  /**
   * Get a profile by name
   *
   * @param name - Profile name
   * @returns Profile or undefined
   */
  get(name: string): Profile | undefined {
    return readData().profiles[name];
  }

  /**
   * Get all profiles
   *
   * @returns Array of profiles
   */
  getAll(): Profile[] {
    return Object.values(readData().profiles);
  }

  /**
   * Set a profile
   *
   * @param profile - Profile configuration
   */
  set(profile: Profile): void {
    const data = readData();
    data.profiles[profile.name] = profile;
    writeData(data);
  }

  /**
   * Remove a profile
   *
   * @param name - Profile name
   * @returns Whether the profile was removed
   */
  delete(name: string): boolean {
    if (name === DEFAULT_PROFILE) {
      return false; // Cannot delete default profile
    }
    const data = readData();
    if (!(name in data.profiles)) return false;
    delete data.profiles[name];
    writeData(data);
    return true;
  }

  /**
   * Get the active profile name
   *
   * @returns Active profile name
   */
  getActive(): string {
    return readData().activeProfile;
  }

  /**
   * Set the active profile
   *
   * @param name - Profile name
   * @returns Whether the profile was activated
   */
  setActive(name: string): boolean {
    const data = readData();
    if (name in data.profiles) {
      data.activeProfile = name;
      writeData(data);
      return true;
    }
    return false;
  }
}

/**
 * Default profile store instance
 */
export const profileStore = new ProfileStore();

/**
 * Profile manager
 *
 * Provides high-level profile management functions.
 */
export class ProfileManager {
  /**
   * Create or update a profile
   *
   * @param name - Profile name
   * @param config - Profile configuration
   * @returns The profile
   */
  setProfile(name: string, config?: Partial<Omit<Profile, 'name'>>): Profile {
    const profile: Profile = {
      name,
      outputFormat: config?.outputFormat ?? 'table',
      defaultServer: config?.defaultServer,
      defaultDatabase: config?.defaultDatabase,
    };

    profileStore.set(profile);
    return profile;
  }

  /**
   * Get a profile by name
   *
   * @param name - Profile name
   * @returns Profile or undefined
   */
  getProfile(name: string): Profile | undefined {
    return profileStore.get(name);
  }

  /**
   * Get all profiles
   *
   * @returns Array of profiles
   */
  listProfiles(): Profile[] {
    return profileStore.getAll();
  }

  /**
   * Delete a profile
   *
   * @param name - Profile name
   * @returns Whether the profile was deleted
   */
  deleteProfile(name: string): boolean {
    return profileStore.delete(name);
  }

  /**
   * Get the active profile
   *
   * @returns Active profile name
   */
  getActiveProfile(): string {
    return profileStore.getActive();
  }

  /**
   * Set the active profile
   *
   * @param name - Profile name
   * @returns Whether the profile was activated
   */
  setActiveProfile(name: string): boolean {
    return profileStore.setActive(name);
  }

  /**
   * Get current profile settings
   *
   * @returns Current profile
   */
  getCurrentProfile(): Profile {
    const name = this.getActiveProfile();
    const profile = this.getProfile(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }
    return profile;
  }
}
