import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Message, MessageRole } from '../../../domain/entities/Message';
import {
  CreateMessageInput,
  MessageRepository,
} from '../../../domain/ports/MessageRepository';
import { MessageRow } from '../schemas/MessageSchema';

const toMessage = (row: MessageRow): Message =>
  new Message({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    toolCalls: row.toolCalls,
    toolCallId: row.toolCallId,
    createdAt: new Date(row.createdAt),
  });

export class TypeOrmMessageRepository implements MessageRepository {
  constructor(private readonly messages: Repository<MessageRow>) {}

  public async create(input: CreateMessageInput): Promise<Message> {
    const values: Partial<MessageRow> = {
      id: input.id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls,
      toolCallId: input.toolCallId,
    };
    await this.messages.insert(
      values as unknown as QueryDeepPartialEntity<MessageRow>,
    );
    const row = await this.messages.findOne({ where: { id: input.id } });
    if (!row) {
      throw new Error('Failed to create message: row missing after insert');
    }
    return toMessage(row);
  }

  public async listByConversation(
    conversationId: string,
    limit: number,
  ): Promise<Message[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return rows.map(toMessage);
  }
}
