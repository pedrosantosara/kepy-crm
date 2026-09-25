import { type LanguageModel } from 'ai';
import { isObject } from '@sniptt/guards';

import { CLAUDE_SUBSCRIPTION_LANGUAGE_MODEL_PROVIDER } from 'src/engine/metadata-modules/ai/ai-models/constants/claude-subscription.const';

export const isClaudeSubscriptionLanguageModel = (
  model: LanguageModel,
): model is Exclude<LanguageModel, string> =>
  isObject(model) &&
  (model as { provider?: unknown }).provider ===
    CLAUDE_SUBSCRIPTION_LANGUAGE_MODEL_PROVIDER;
