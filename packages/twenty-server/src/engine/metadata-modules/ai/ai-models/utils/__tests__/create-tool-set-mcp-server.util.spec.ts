import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { jsonSchema, tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { createToolSetMcpServer } from 'src/engine/metadata-modules/ai/ai-models/utils/create-tool-set-mcp-server.util';

const connectClient = async (tools: ToolSet): Promise<Client> => {
  const serverConfig = createToolSetMcpServer({ name: 'twenty', tools });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await (serverConfig.instance as unknown as McpServer).connect(
    serverTransport,
  );

  const client = new Client({ name: 'test-client', version: '1.0.0' });

  await client.connect(clientTransport);

  return client;
};

const findRecordsInputSchema = {
  type: 'object' as const,
  properties: { name: { type: 'string' as const } },
  required: ['name'],
};

describe('createToolSetMcpServer', () => {
  it('should list executable tools with their original JSON Schema', async () => {
    const client = await connectClient({
      find_records: tool({
        description: 'Find records by name',
        inputSchema: jsonSchema(findRecordsInputSchema),
        execute: async () => [],
      }),
      provider_defined: tool({
        description: 'Runs on the provider side',
        inputSchema: z.object({}),
      }),
    });

    const { tools } = await client.listTools();

    expect(tools).toEqual([
      {
        name: 'find_records',
        description: 'Find records by name',
        inputSchema: findRecordsInputSchema,
      },
    ]);
  });

  it('should execute a tool and return its output as JSON text', async () => {
    const execute = jest.fn(async ({ name }: { name: string }) => [
      { id: '1', name },
    ]);

    const client = await connectClient({
      find_records: tool({
        description: 'Find records by name',
        inputSchema: z.object({ name: z.string() }),
        execute,
      }),
    });

    const result = await client.callTool({
      name: 'find_records',
      arguments: { name: 'Acme' },
    });

    expect(execute).toHaveBeenCalledWith(
      { name: 'Acme' },
      expect.objectContaining({ messages: [] }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify([{ id: '1', name: 'Acme' }]) },
    ]);
  });

  it('should return the last value of a streaming tool', async () => {
    const client = await connectClient({
      stream_status: tool({
        description: 'Reports progress while working',
        inputSchema: z.object({}),
        execute: async function* () {
          yield 'working';
          yield 'done';
        },
      }),
    });

    const result = await client.callTool({
      name: 'stream_status',
      arguments: {},
    });

    expect(result.content).toEqual([{ type: 'text', text: 'done' }]);
  });

  it('should turn a thrown error into an error result', async () => {
    const client = await connectClient({
      failing_tool: tool({
        description: 'Always fails',
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error('Record not found');
        },
      }),
    });

    const result = await client.callTool({
      name: 'failing_tool',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'Record not found' },
    ]);
  });

  it('should reject an unknown tool name', async () => {
    const client = await connectClient({});

    const result = await client.callTool({ name: 'missing', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: 'Unknown tool: missing' },
    ]);
  });
});
