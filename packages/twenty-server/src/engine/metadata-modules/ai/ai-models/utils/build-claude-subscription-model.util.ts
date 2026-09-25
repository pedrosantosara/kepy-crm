import { claudeCode } from 'ai-sdk-provider-claude-code';
import { type LanguageModel, type ToolSet } from 'ai';
import { isDefined } from 'twenty-shared/utils';

import { CLAUDE_SUBSCRIPTION_MCP_SERVER_NAME } from 'src/engine/metadata-modules/ai/ai-models/constants/claude-subscription.const';
import { createToolSetMcpServer } from 'src/engine/metadata-modules/ai/ai-models/utils/create-tool-set-mcp-server.util';

// Claude runs through the Claude Agent SDK with the subscription token in
// CLAUDE_CODE_OAUTH_TOKEN. Built-in Claude Code tools (shell, file access,
// web fetch) stay disabled so the model can only reach Twenty's own tools.
export const buildClaudeSubscriptionModel = ({
  modelId,
  tools,
  systemPrompt,
}: {
  modelId: string;
  tools?: ToolSet;
  systemPrompt?: string;
}): LanguageModel => {
  const toolNames = isDefined(tools)
    ? Object.entries(tools)
        .filter(([, tool]) => isDefined(tool.execute))
        .map(([toolName]) => toolName)
    : [];

  const hasTools = isDefined(tools) && toolNames.length > 0;

  return claudeCode(modelId, {
    tools: [],
    settingSources: [],
    persistSession: false,
    permissionPrompts: 'none',
    ...(isDefined(systemPrompt) && { systemPrompt }),
    ...(hasTools && {
      mcpServers: {
        [CLAUDE_SUBSCRIPTION_MCP_SERVER_NAME]: createToolSetMcpServer({
          name: CLAUDE_SUBSCRIPTION_MCP_SERVER_NAME,
          tools,
        }),
      },
      allowedTools: toolNames.map(
        (toolName) =>
          `mcp__${CLAUDE_SUBSCRIPTION_MCP_SERVER_NAME}__${toolName}`,
      ),
    }),
  });
};
