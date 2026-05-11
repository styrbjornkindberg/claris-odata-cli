/**
 * Unit Tests for ListCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListCommand } from '../../../src/cli/list';
import { ODataClient } from '../../../src/api/client';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/client');

describe('ListCommand', () => {
  const mockServerManager = {
    listServers: vi.fn(),
    getServer: vi.fn(),
  };

  const mockCredentialsManager = {
    listCredentials: vi.fn(),
    getCredentials: vi.fn(),
  };

  const mockGetServiceDocument = vi.fn();
  const mockGetMetadata = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as never);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as never);
    vi.mocked(ODataClient).mockImplementation(() => ({
      getServiceDocument: mockGetServiceDocument,
      getMetadata: mockGetMetadata,
    } as never));

    mockServerManager.listServers.mockReturnValue([
      { id: 'prod', name: 'Production', host: 'fm.example.com', port: 443, secure: true },
    ]);
    mockServerManager.getServer.mockReturnValue({
      id: 'prod',
      name: 'Production',
      host: 'fm.example.com',
      port: 443,
      secure: true,
    });
    mockCredentialsManager.listCredentials.mockResolvedValue([
      { serverId: 'prod', database: 'Sales', username: 'alice' },
    ]);
    mockCredentialsManager.getCredentials.mockResolvedValue('secret');
  });

  it('lists configured servers', async () => {
    const cmd = new ListCommand({ resource: 'servers', output: 'json' });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      type: 'servers',
      servers: [
        {
          id: 'prod',
          name: 'Production',
          host: 'fm.example.com',
          port: 443,
          secure: true,
        },
      ],
    });
  });

  it('lists databases from the service document', async () => {
    mockGetServiceDocument.mockResolvedValue([
      { name: 'Sales', kind: 'EntityContainer', url: 'Sales' },
      { name: 'HR', kind: 'EntityContainer', url: 'HR' },
    ]);

    const cmd = new ListCommand({
      resource: 'databases',
      serverId: 'prod',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      type: 'databases',
      server: 'prod',
      databases: [
        { name: 'Sales', kind: 'EntityContainer', url: 'Sales' },
        { name: 'HR', kind: 'EntityContainer', url: 'HR' },
      ],
    });
  });

  it('lists tables from metadata for a specific database', async () => {
    mockGetMetadata.mockResolvedValue(`
      <edmx:Edmx>
        <edmx:DataServices>
          <Schema>
            <EntityContainer>
              <EntitySet Name="Customers" EntityType="FileMaker.Customers" />
              <EntitySet Name="Orders" EntityType="FileMaker.Orders" />
            </EntityContainer>
          </Schema>
        </edmx:DataServices>
      </edmx:Edmx>
    `);

    const cmd = new ListCommand({
      resource: 'tables',
      serverId: 'prod',
      database: 'Sales',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      type: 'tables',
      server: 'prod',
      database: 'Sales',
      tables: [{ name: 'Customers' }, { name: 'Orders' }],
    });
  });

  it('requires a database name when listing tables', async () => {
    const cmd = new ListCommand({
      resource: 'tables',
      serverId: 'prod',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database name is required to list tables. Use --database <name>');
  });
});
