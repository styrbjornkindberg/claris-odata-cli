/**
 * Unit Tests for SchemaCommand
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { SchemaCommand } from '../../../src/cli/schema';
import { ServerManager } from '../../../src/config/servers';
import { CredentialsManager } from '../../../src/config/credentials';
import { AuthManager } from '../../../src/api/auth';

vi.mock('../../../src/config/servers');
vi.mock('../../../src/config/credentials');
vi.mock('../../../src/api/auth');
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('SchemaCommand', () => {
  const mockServerManager = { getServer: vi.fn() };
  const mockCredentialsManager = { listCredentials: vi.fn(), getCredentials: vi.fn() };
  const mockAuthManager = { createBasicAuthToken: vi.fn() };
  const mockAxiosGet = vi.mocked(axios.get);

  const metadataXml = `
<edmx:Edmx>
  <edmx:DataServices>
    <Schema>
      <EntityContainer>
        <EntitySet Name="Customers" EntityType="FileMaker.Customers" />
        <EntitySet Name="Orders" EntityType="FileMaker.Orders" />
      </EntityContainer>
      <EntityType Name="Customers">
        <Key><PropertyRef Name="id" /></Key>
        <Property Name="id" Type="Edm.Int32" Nullable="false" />
        <Property Name="Name" Type="Edm.String" />
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>
`;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ServerManager).mockImplementation(() => mockServerManager as any);
    vi.mocked(CredentialsManager).mockImplementation(() => mockCredentialsManager as any);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager as any);

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
    mockAuthManager.createBasicAuthToken.mockReturnValue('Basic token');
    mockAxiosGet.mockResolvedValue({ data: metadataXml } as any);
  });

  it('lists tables when table option is not provided', async () => {
    const cmd = new SchemaCommand({
      serverId: 'prod',
      database: 'Sales',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        database: 'Sales',
        tableCount: 2,
        tables: ['Customers', 'Orders'],
      })
    );
  });

  it('returns table-specific schema when table exists', async () => {
    const cmd = new SchemaCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'Customers',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        table: 'Customers',
        fieldCount: 2,
        fields: ['id', 'Name'],
      })
    );
  });

  it('returns error when requested table is missing from metadata', async () => {
    const cmd = new SchemaCommand({
      serverId: 'prod',
      database: 'Sales',
      table: 'MissingTable',
      output: 'json',
    });

    const result = await cmd.execute();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Table 'MissingTable' not found in metadata");
  });
});
