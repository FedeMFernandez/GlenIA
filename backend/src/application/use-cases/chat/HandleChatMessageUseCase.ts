import { ConversationRepository } from '../../../domain/ports/ConversationRepository';
import { MessageRepository } from '../../../domain/ports/MessageRepository';
import {
  Message,
  MESSAGE_ROLE,
  ToolCallRecord,
} from '../../../domain/entities/Message';
import { LLMMessage, LLMToolCall } from '../../../domain/ports/LLMProvider';
import { Transaction } from '../../../domain/entities/Transaction';
import { LLMService } from '../../services/LLMService';
import { ToolRegistry } from '../../tools/toolRegistry';
import { AppLogger } from '../../../shared/logger';
import { newId } from '../../../shared/utils/ids';
import {
  DEFAULT_HISTORY_LIMIT,
  MAX_TOOL_ITERATIONS,
} from '../../../shared/constants/config';
import { NotFoundError } from '../../../domain/errors/DomainError';

export interface HandleChatMessageInput {
  conversationId: string | null;
  message: string;
  correlationId: string;
}

export interface HandleChatMessageOutput {
  conversationId: string;
  assistantMessage: Message;
  transactions: Transaction[];
}

export type ChatStreamEvent =
  | { type: 'token'; token: string }
  | { type: 'tool'; name: string; phase: 'start' | 'result'; data?: unknown }
  | { type: 'transaction'; transactionId: string; status: string }
  | { type: 'done'; conversationId: string; content: string }
  | { type: 'error'; code: string; message: string };

const parseToolArguments = (raw: string): Record<string, unknown> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const toToolCallRecords = (calls: LLMToolCall[]): ToolCallRecord[] =>
  calls.map((call) => ({
    id: call.id,
    name: call.name,
    arguments: parseToolArguments(call.arguments),
  }));

const historyToLLMMessages = (messages: Message[]): LLMMessage[] =>
  messages.map((message) => {
    if (message.role === MESSAGE_ROLE.ASSISTANT && message.toolCalls) {
      return {
        role: 'assistant',
        content: message.content || null,
        toolCalls: message.toolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        })),
      };
    }
    if (message.role === MESSAGE_ROLE.TOOL) {
      return {
        role: 'tool',
        content: message.content,
        toolCallId: message.toolCallId ?? undefined,
      };
    }
    if (message.role === MESSAGE_ROLE.SYSTEM) {
      return { role: 'system', content: message.content };
    }
    if (message.role === MESSAGE_ROLE.ASSISTANT) {
      return { role: 'assistant', content: message.content };
    }
    return { role: 'user', content: message.content };
  });

export class HandleChatMessageUseCase {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly llmService: LLMService,
    private readonly toolRegistry: ToolRegistry,
    private readonly logger: AppLogger,
  ) {}

  public async execute(
    input: HandleChatMessageInput,
  ): Promise<HandleChatMessageOutput> {
    const conversationId = await this.resolveConversation(input.conversationId);
    await this.persistUserMessage(conversationId, input.message);

    const llmMessages = await this.loadConversationForLLM(conversationId);
    const collectedTransactions = new Map<string, Transaction>();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const completion = await this.llmService.complete(llmMessages);

      if (completion.toolCalls.length === 0) {
        const assistantMessage = await this.persistAssistantMessage(
          conversationId,
          completion.content ?? '',
          null,
        );
        await this.conversations.touch(conversationId);
        return {
          conversationId,
          assistantMessage,
          transactions: Array.from(collectedTransactions.values()),
        };
      }

      const toolCallRecords = toToolCallRecords(completion.toolCalls);
      await this.persistAssistantMessage(
        conversationId,
        completion.content ?? '',
        toolCallRecords,
      );
      llmMessages.push({
        role: 'assistant',
        content: completion.content ?? null,
        toolCalls: completion.toolCalls,
      });

      for (const call of completion.toolCalls) {
        const result = await this.runTool(call, {
          conversationId,
          correlationId: input.correlationId,
        });
        result.transactions.forEach((transaction) =>
          collectedTransactions.set(transaction.id, transaction),
        );
        const content = JSON.stringify(result.data);
        await this.persistToolMessage(conversationId, content, call.id);
        llmMessages.push({ role: 'tool', content, toolCallId: call.id });
      }
    }

    const finalCompletion = await this.llmService.complete(llmMessages);
    const assistantMessage = await this.persistAssistantMessage(
      conversationId,
      finalCompletion.content ?? 'Unable to complete the request right now.',
      null,
    );
    await this.conversations.touch(conversationId);
    return {
      conversationId,
      assistantMessage,
      transactions: Array.from(collectedTransactions.values()),
    };
  }

  public async *stream(
    input: HandleChatMessageInput,
  ): AsyncGenerator<ChatStreamEvent> {
    const conversationId = await this.resolveConversation(input.conversationId);
    await this.persistUserMessage(conversationId, input.message);
    const llmMessages = await this.loadConversationForLLM(conversationId);
    const collectedTransactions = new Map<string, Transaction>();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      let content = '';
      const toolCalls: LLMToolCall[] = [];

      for await (const event of this.llmService.stream(llmMessages)) {
        if (event.type === 'token' && event.token) {
          content += event.token;
          yield { type: 'token', token: event.token };
        }
        if (event.type === 'tool_call' && event.toolCalls) {
          toolCalls.push(...event.toolCalls);
        }
      }

      if (toolCalls.length === 0) {
        await this.persistAssistantMessage(conversationId, content, null);
        await this.conversations.touch(conversationId);
        yield { type: 'done', conversationId, content };
        return;
      }

      await this.persistAssistantMessage(
        conversationId,
        content,
        toToolCallRecords(toolCalls),
      );
      llmMessages.push({
        role: 'assistant',
        content: content || null,
        toolCalls,
      });

      for (const call of toolCalls) {
        yield { type: 'tool', name: call.name, phase: 'start' };
        const result = await this.runTool(call, {
          conversationId,
          correlationId: input.correlationId,
        });
        for (const transaction of result.transactions) {
          collectedTransactions.set(transaction.id, transaction);
          yield {
            type: 'transaction',
            transactionId: transaction.id,
            status: transaction.status,
          };
        }
        const toolContent = JSON.stringify(result.data);
        await this.persistToolMessage(conversationId, toolContent, call.id);
        llmMessages.push({
          role: 'tool',
          content: toolContent,
          toolCallId: call.id,
        });
        yield {
          type: 'tool',
          name: call.name,
          phase: 'result',
          data: result.data,
        };
      }
    }

    const finalContent = 'Unable to complete the request right now.';
    await this.persistAssistantMessage(conversationId, finalContent, null);
    await this.conversations.touch(conversationId);
    yield { type: 'done', conversationId, content: finalContent };
  }

  private async runTool(
    call: LLMToolCall,
    context: { conversationId: string; correlationId: string },
  ): Promise<{ data: Record<string, unknown>; transactions: Transaction[] }> {
    const handler = this.toolRegistry.get(call.name);
    if (!handler) {
      this.logger.warn({ tool: call.name }, 'Unknown tool requested');
      return { data: { error: `Unknown tool: ${call.name}` }, transactions: [] };
    }
    try {
      return await handler.execute(parseToolArguments(call.arguments), context);
    } catch (error) {
      this.logger.error({ tool: call.name, err: error }, 'Tool execution failed');
      const message =
        error instanceof Error ? error.message : 'Tool execution failed';
      return { data: { error: message }, transactions: [] };
    }
  }

  private async resolveConversation(
    conversationId: string | null,
  ): Promise<string> {
    if (!conversationId) {
      const created = await this.conversations.create({
        id: newId(),
        title: null,
      });
      return created.id;
    }
    const existing = await this.conversations.findById(conversationId);
    if (!existing) {
      throw new NotFoundError(`Conversation not found: ${conversationId}`);
    }
    return existing.id;
  }

  private async loadConversationForLLM(
    conversationId: string,
  ): Promise<LLMMessage[]> {
    const history = await this.messages.listByConversation(
      conversationId,
      DEFAULT_HISTORY_LIMIT,
    );
    return this.llmService.buildInitialMessages(historyToLLMMessages(history));
  }

  private async persistUserMessage(
    conversationId: string,
    content: string,
  ): Promise<Message> {
    return this.messages.create({
      id: newId(),
      conversationId,
      role: MESSAGE_ROLE.USER,
      content,
      toolCalls: null,
      toolCallId: null,
    });
  }

  private async persistAssistantMessage(
    conversationId: string,
    content: string,
    toolCalls: ToolCallRecord[] | null,
  ): Promise<Message> {
    return this.messages.create({
      id: newId(),
      conversationId,
      role: MESSAGE_ROLE.ASSISTANT,
      content,
      toolCalls,
      toolCallId: null,
    });
  }

  private async persistToolMessage(
    conversationId: string,
    content: string,
    toolCallId: string,
  ): Promise<Message> {
    return this.messages.create({
      id: newId(),
      conversationId,
      role: MESSAGE_ROLE.TOOL,
      content,
      toolCalls: null,
      toolCallId,
    });
  }
}
