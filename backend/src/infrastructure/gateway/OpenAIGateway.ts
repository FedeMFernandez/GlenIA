import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { Env } from '../config/env';
import {
  LLMCompletion,
  LLMCompletionRequest,
  LLMMessage,
  LLMProvider,
  LLMStreamEvent,
  LLMToolCall,
  LLMToolDefinition,
} from '../../domain/ports/LLMProvider';

const toOpenAIMessages = (
  messages: LLMMessage[],
): ChatCompletionMessageParam[] =>
  messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      } as ChatCompletionMessageParam;
    }
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content ?? '',
        tool_call_id: message.toolCallId ?? '',
      } as ChatCompletionMessageParam;
    }
    return {
      role: message.role,
      content: message.content ?? '',
    } as ChatCompletionMessageParam;
  });

const toOpenAITools = (tools: LLMToolDefinition[]): ChatCompletionTool[] =>
  tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

export class OpenAIGateway implements LLMProvider {
  private readonly client: OpenAI;

  constructor(private readonly env: Env) {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  public async complete(
    request: LLMCompletionRequest,
  ): Promise<LLMCompletion> {
    const response = await this.client.chat.completions.create({
      model: this.env.OPENAI_MODEL,
      messages: toOpenAIMessages(request.messages),
      tools: request.tools.length ? toOpenAITools(request.tools) : undefined,
      tool_choice: request.tools.length ? 'auto' : undefined,
      temperature: request.temperature ?? 0.2,
    });

    const choice = response.choices[0]?.message;
    const toolCalls: LLMToolCall[] = (choice?.tool_calls ?? [])
      .filter((call) => call.type === 'function')
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      }));

    return { content: choice?.content ?? null, toolCalls };
  }

  public async *stream(
    request: LLMCompletionRequest,
  ): AsyncIterable<LLMStreamEvent> {
    const completion = await this.client.chat.completions.create({
      model: this.env.OPENAI_MODEL,
      messages: toOpenAIMessages(request.messages),
      tools: request.tools.length ? toOpenAITools(request.tools) : undefined,
      tool_choice: request.tools.length ? 'auto' : undefined,
      temperature: request.temperature ?? 0.2,
      stream: true,
    });

    const toolAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) {
        continue;
      }
      if (delta.content) {
        yield { type: 'token', token: delta.content };
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index;
        const current = toolAccumulator.get(index) ?? {
          id: '',
          name: '',
          arguments: '',
        };
        if (call.id) {
          current.id = call.id;
        }
        if (call.function?.name) {
          current.name = call.function.name;
        }
        if (call.function?.arguments) {
          current.arguments += call.function.arguments;
        }
        toolAccumulator.set(index, current);
      }
    }

    const toolCalls: LLMToolCall[] = Array.from(toolAccumulator.values()).map(
      (call) => ({ id: call.id, name: call.name, arguments: call.arguments }),
    );

    if (toolCalls.length) {
      yield { type: 'tool_call', toolCalls };
    }
    yield { type: 'done' };
  }
}
