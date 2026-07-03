export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: LLMToolCall[];
  toolCallId?: string;
}

export interface LLMCompletion {
  content: string | null;
  toolCalls: LLMToolCall[];
}

export interface LLMStreamEvent {
  type: 'token' | 'tool_call' | 'done';
  token?: string;
  toolCalls?: LLMToolCall[];
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  temperature?: number;
}

export interface LLMProvider {
  complete(request: LLMCompletionRequest): Promise<LLMCompletion>;
  stream(request: LLMCompletionRequest): AsyncIterable<LLMStreamEvent>;
}
