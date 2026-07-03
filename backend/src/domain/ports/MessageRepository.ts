import { Message, MessageRole, ToolCallRecord } from '../entities/Message';

export interface CreateMessageInput {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCallRecord[] | null;
  toolCallId: string | null;
}

export interface MessageRepository {
  create(input: CreateMessageInput): Promise<Message>;
  listByConversation(conversationId: string, limit: number): Promise<Message[]>;
}
