/**
 * Profile Management
 *
 * Manages environment profiles for different configurations.
 *
 * @module config/profiles
 */

import type { Profile, OutputFormat } from '../types';

/**
 * Default profile name
 */
const DEFAULT_PROFILE = 'default';

/**
 * In-memory profile store (placeholder for persistent storage)
 *
 * TODO: Implement persistent storage using the `conf` package.
 */
class ProfileStore {
  private profiles: Map<string, Profile> = new Map();
  private activeProfile: string = DEFAULT_PROFILE;

  constructor() {
    // Initialize with default profile
    this.profiles.set(DEFAULT_PROFILE, {
      name: DEFAULT_PROFILE,
      outputFormat: 'table',
    });
  }

  /**
   * Get a profile by name
   *
   * @param name - Profile name
   * @returns Profile or undefined
   */
  get(name: string): Profile | undefined {
    return this.profiles.get(name);
  }

  /**
   * Get all profiles
   *
   * @returns Array of profiles
   */
  getAll(): Profile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Set a profile
   *
   * @param profile - Profile configuration
   */
  set(profile: Profile): void {
    this.profiles.set(profile.name, profile);
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
    return this.profiles.delete(name);
  }

  /**
   * Get the active profile name
   *
   * @returns Active profile name
   */
  getActive(): string {
    return this.activeProfile;
  }

  /**
   * Set the active profile
   *
   * @param name - Profile name
   * @returns Whether the profile was activated
   */
  setActive(name: string): boolean {
    if (this.profiles.has(name)) {
      this.activeProfile = name;
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
  setProfile(
    name: string,
    config?: Partial<Omit<Profile, 'name'>>
  ): Profile {
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