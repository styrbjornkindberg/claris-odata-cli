/**
 * Profile Command
 *
 * Manage CLI configuration profiles.
 *
 * @module cli/profile
 */

import { BaseCommand, type CommandOptions } from './index';
import type { CommandResult, OutputFormat, Profile } from '../types';
import { ProfileManager } from '../config/profiles';
import { OutputFormatter } from '../output/formatter';

export type ProfileAction = 'add' | 'list' | 'use' | 'remove';

export interface ProfileOptions extends CommandOptions {
  action: ProfileAction;
  name?: string;
  defaultServer?: string;
  defaultDatabase?: string;
  outputFormat?: OutputFormat;
}

export class ProfileCommand extends BaseCommand<ProfileOptions> {
  async execute(): Promise<CommandResult> {
    try {
      this.validateOptions();

      switch (this.options.action) {
        case 'add':
          return this.addProfile();
        case 'list':
          return this.listProfiles();
        case 'use':
          return this.useProfile();
        case 'remove':
          return this.removeProfile();
        default:
          return {
            success: false,
            error: `Unknown action: ${this.options.action}. Valid actions: add, list, use, remove`,
          };
      }
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }

  private validateOptions(): void {
    const { action, name } = this.options;

    if (action === 'add' || action === 'use' || action === 'remove') {
      if (!name || name.trim() === '') {
        throw new Error('Profile name is required. Use --name <name>');
      }
    }
  }

  private addProfile(): CommandResult {
    const manager = new ProfileManager();
    const name = this.options.name!;

    const profile = manager.setProfile(name, {
      defaultServer: this.options.defaultServer,
      defaultDatabase: this.options.defaultDatabase,
      outputFormat: this.options.outputFormat,
    });

    return {
      success: true,
      data: {
        name: profile.name,
        defaultServer: profile.defaultServer ?? null,
        defaultDatabase: profile.defaultDatabase ?? null,
        outputFormat: profile.outputFormat ?? 'table',
        message: `Profile "${name}" saved`,
      },
    };
  }

  private listProfiles(): CommandResult {
    const manager = new ProfileManager();
    const profiles = manager.listProfiles();
    const active = manager.getActiveProfile();

    return {
      success: true,
      data: profiles.map((p: Profile) => ({
        name: p.name,
        active: p.name === active,
        defaultServer: p.defaultServer ?? null,
        defaultDatabase: p.defaultDatabase ?? null,
        outputFormat: p.outputFormat ?? 'table',
      })),
    };
  }

  private useProfile(): CommandResult {
    const manager = new ProfileManager();
    const name = this.options.name!;

    const activated = manager.setActiveProfile(name);
    if (!activated) {
      return {
        success: false,
        error: `Profile not found: ${name}. Run 'fmo profile list' to see available profiles.`,
      };
    }

    return {
      success: true,
      data: { name, message: `Switched to profile "${name}"` },
    };
  }

  private removeProfile(): CommandResult {
    const manager = new ProfileManager();
    const name = this.options.name!;

    if (name === 'default') {
      return {
        success: false,
        error: 'Cannot remove the default profile.',
      };
    }

    const removed = manager.deleteProfile(name);
    if (!removed) {
      return {
        success: false,
        error: `Profile not found: ${name}. Run 'fmo profile list' to see available profiles.`,
      };
    }

    return {
      success: true,
      data: { name, message: `Profile "${name}" removed` },
    };
  }

  formatOutput(result: CommandResult): string {
    const formatter = new OutputFormatter(this.options.output ?? 'table');
    const isMachine = this.options.output === 'json' || this.options.output === 'jsonl';

    if (!result.success) {
      if (isMachine) {
        // SPEC-009: Structured error format
        return formatter.formatJson({
          type: 'error',
          code: 'COMMAND_FAILED',
          message: result.error ?? 'Unknown error',
        });
      }
      return result.error ?? 'Unknown error';
    }

    if (isMachine) {
      return formatter.formatJson(result.data);
    }

    const data = result.data as Record<string, unknown>;

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return 'No profiles configured.';
      }
      const lines: string[] = ['Profiles:', ''];
      for (const p of data) {
        const profile = p as {
          name: string;
          active: boolean;
          defaultServer: string | null;
          outputFormat: string;
        };
        const marker = profile.active ? ' (active)' : '';
        lines.push(`  ${profile.name}${marker}`);
        if (profile.defaultServer) {
          lines.push(`    Server: ${profile.defaultServer}`);
        }
        lines.push(`    Format: ${profile.outputFormat}`);
        lines.push('');
      }
      return lines.join('\n');
    }

    return data.message as string;
  }
}
