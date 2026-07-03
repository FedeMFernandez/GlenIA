import { Message } from '../../domain/entities/Message';
import { TransactionDTO } from './TransactionDTO';

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: Message['toolCalls'];
  toolCallId: string | null;
  createdAt: string;
}

export interface ChatResponseDTO {
  conversationId: string;
  message: MessageDTO;
  transactions: TransactionDTO[];
}

export const toMessageDTO = (message: Message): MessageDTO => ({
  id: message.id,
  conversationId: message.conversationId,
  role: message.role,
  content: message.content,
  toolCalls: message.toolCalls,
  toolCallId: message.toolCallId,
  createdAt: message.createdAt.toISOString(),
});
