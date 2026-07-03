import { Repository } from 'typeorm';
import { Conversation } from '../../../domain/entities/Conversation';
import {
  ConversationRepository,
  CreateConversationInput,
} from '../../../domain/ports/ConversationRepository';
import { ConversationRow } from '../schemas/ConversationSchema';

const toConversation = (row: ConversationRow): Conversation =>
  new Conversation({
    id: row.id,
    title: row.title,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });

export class TypeOrmConversationRepository implements ConversationRepository {
  constructor(private readonly conversations: Repository<ConversationRow>) {}

  public async create(input: CreateConversationInput): Promise<Conversation> {
    await this.conversations.insert({ id: input.id, title: input.title });
    const row = await this.conversations.findOne({ where: { id: input.id } });
    if (!row) {
      throw new Error('Failed to create conversation: row missing after insert');
    }
    return toConversation(row);
  }

  public async findById(id: string): Promise<Conversation | null> {
    const row = await this.conversations.findOne({ where: { id } });
    return row ? toConversation(row) : null;
  }

  public async touch(id: string): Promise<void> {
    await this.conversations.update({ id }, { updatedAt: new Date() });
  }
}
