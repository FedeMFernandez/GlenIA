import {
  LLMCompletion,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
} from '../../domain/ports/LLMProvider';
import { toolDefinitions } from '../tools/toolSchemas';
import { SYSTEM_PROMPT } from '../../shared/constants/config';

export class LLMService {
  constructor(private readonly provider: LLMProvider) {}

  public buildInitialMessages(history: LLMMessage[]): LLMMessage[] {
    return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
  }

  public async complete(messages: LLMMessage[]): Promise<LLMCompletion> {
    return this.provider.complete({ messages, tools: toolDefinitions });
  }

  public stream(messages: LLMMessage[]): AsyncIterable<LLMStreamEvent> {
    return this.provider.stream({ messages, tools: toolDefinitions });
  }
}
