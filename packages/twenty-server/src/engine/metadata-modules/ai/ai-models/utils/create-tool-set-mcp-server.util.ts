import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { type McpSdkServerConfigWithInstance } from 'ai-sdk-provider-claude-code';
import { asSchema, type ToolExecuteFunction, type ToolSet } from 'ai';
import { isDefined } from 'twenty-shared/utils';

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  isDefined(value) &&
  typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';

// Streaming tools yield preliminary results; only the last one is final.
const resolveToolOutput = async (output: unknown): Promise<unknown> => {
  if (!isAsyncIterable(output)) {
    return output;
  }

  let lastValue: unknown;

  for await (const value of output) {
    lastValue = value;
  }

  return lastValue;
};

const toCallToolResult = (output: unknown): CallToolResult => ({
  content: [
    {
      type: 'text',
      text:
        typeof output === 'string' ? output : JSON.stringify(output ?? null),
    },
  ],
});

// ai-sdk-provider-claude-code only bridges Zod-shaped tools, while Twenty's
// tools carry JSON Schema. Serving tools/list and tools/call on the low-level
// server keeps each tool's original JSON Schema intact for the model.
export const createToolSetMcpServer = ({
  name,
  tools,
}: {
  name: string;
  tools: ToolSet;
}): McpSdkServerConfigWithInstance => {
  const executableTools = Object.entries(tools).filter(([, tool]) =>
    isDefined(tool.execute),
  );

  const mcpServer = new McpServer(
    { name, version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: executableTools.map(([toolName, tool]) => ({
      name: toolName,
      description: tool.description ?? '',
      inputSchema: asSchema(tool.inputSchema).jsonSchema as {
        type: 'object';
        [key: string]: unknown;
      },
    })),
  }));

  mcpServer.server.setRequestHandler(
    CallToolRequestSchema,
    async (request, extra) => {
      const toolEntry = executableTools.find(
        ([toolName]) => toolName === request.params.name,
      );

      if (!isDefined(toolEntry) || !isDefined(toolEntry[1].execute)) {
        return {
          isError: true,
          content: [
            { type: 'text', text: `Unknown tool: ${request.params.name}` },
          ],
        };
      }

      // ToolSet erases each tool's input type; the model validated the
      // arguments against the published JSON Schema before calling.
      const execute = toolEntry[1].execute as ToolExecuteFunction<
        unknown,
        unknown,
        unknown
      >;

      try {
        const output = await execute(request.params.arguments ?? {}, {
          toolCallId: String(extra.requestId),
          messages: [],
          abortSignal: extra.signal,
          context: undefined,
        });

        return toCallToolResult(await resolveToolOutput(output));
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );

  // The provider's types point at the ESM build of @modelcontextprotocol/sdk
  // while this CommonJS package resolves the CJS build of the same class.
  return {
    type: 'sdk',
    name,
    instance:
      mcpServer as unknown as McpSdkServerConfigWithInstance['instance'],
  };
};
