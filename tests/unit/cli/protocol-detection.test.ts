/**
 * T1: Protocol detection — verify list / health / overview use `secure` flag,
 * not `port === 443`, so HTTPS works on non-standard ports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ListCommand } from '../../../src/cli/list';
import { HealthCommand } from '../../../src/cli/health';
import { OverviewCommand } from '../../../src/cli/overview';
import { ODataClient } from '../../../src/api/client';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/client');

const cred = { serverId: 'srv', database: 'DB', username: 'user' };

const SECURE_NON_443 = { id: 'srv', name: 'T', host: 'fm.example.com', port: 8443, secure: true };
const INSECURE = { id: 'srv', name: 'T', host: 'fm.example.com', port: 8080, secure: false };
const DEFAULT = { id: 'srv', name: 'T', host: 'fm.example.com', port: 443, secure: true };
const SECURE_UNDEFINED = { id: 'srv', name: 'T', host: 'fm.example.com', port: 8443 };

describe('Protocol detection', () => {
  let capturedBaseUrl: string;

  beforeEach(() => {
    capturedBaseUrl = '';
    vi.mocked(ODataClient).mockImplementation((config) => {
      capturedBaseUrl = config.baseUrl;
      return {
        getServiceDocument: vi.fn().mockResolvedValue([]),
        getMetadata: vi.fn().mockResolvedValue('<Edmx/>'),
      } as never;
    });
    vi.mocked(CredentialsManager).mockImplementation(
      () =>
        ({
          listCredentials: vi.fn().mockResolvedValue([cred]),
          getCredentials: vi.fn().mockResolvedValue('pass'),
        }) as never,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockServer(server: object) {
    vi.mocked(ServerManager).mockImplementation(
      () =>
        ({
          listServers: vi.fn().mockReturnValue([server]),
          getServer: vi.fn().mockReturnValue(server),
        }) as never,
    );
  }

  // ── ListCommand ─────────────────────────────────────────────────────────────

  describe('ListCommand – list databases', () => {
    it('uses https when secure=true on port 8443', async () => {
      mockServer(SECURE_NON_443);
      await new ListCommand({ resource: 'databases', serverId: 'srv', output: 'json' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });

    it('uses http when secure=false', async () => {
      mockServer(INSECURE);
      await new ListCommand({ resource: 'databases', serverId: 'srv', output: 'json' }).execute();
      expect(capturedBaseUrl).toContain('http://');
    });

    it('defaults to https when secure is undefined', async () => {
      mockServer(SECURE_UNDEFINED);
      await new ListCommand({ resource: 'databases', serverId: 'srv', output: 'json' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });

    it('no regression: port 443 + secure=true still uses https', async () => {
      mockServer(DEFAULT);
      await new ListCommand({ resource: 'databases', serverId: 'srv', output: 'json' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });
  });

  describe('ListCommand – list tables', () => {
    it('uses https when secure=true on port 8443', async () => {
      mockServer(SECURE_NON_443);
      await new ListCommand({
        resource: 'tables',
        serverId: 'srv',
        database: 'DB',
        output: 'json',
      }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });

    it('uses http when secure=false', async () => {
      mockServer(INSECURE);
      await new ListCommand({
        resource: 'tables',
        serverId: 'srv',
        database: 'DB',
        output: 'json',
      }).execute();
      expect(capturedBaseUrl).toContain('http://');
    });
  });

  // ── HealthCommand ───────────────────────────────────────────────────────────

  describe('HealthCommand', () => {
    it('uses https when secure=true on port 8443', async () => {
      mockServer(SECURE_NON_443);
      await new HealthCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });

    it('uses http when secure=false', async () => {
      mockServer(INSECURE);
      await new HealthCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('http://');
    });

    it('defaults to https when secure is undefined', async () => {
      mockServer(SECURE_UNDEFINED);
      await new HealthCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });
  });

  // ── OverviewCommand ─────────────────────────────────────────────────────────

  describe('OverviewCommand', () => {
    it('uses https when secure=true on port 8443', async () => {
      mockServer(SECURE_NON_443);
      await new OverviewCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });

    it('uses http when secure=false', async () => {
      mockServer(INSECURE);
      await new OverviewCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('http://');
    });

    it('defaults to https when secure is undefined', async () => {
      mockServer(SECURE_UNDEFINED);
      await new OverviewCommand({ output: 'table' }).execute();
      expect(capturedBaseUrl).toContain('https://');
    });
  });
});
