import { Conversation } from '../entities/Conversation';

export interface CreateConversationInput {
  id: string;
  title: string | null;
}

export interface ConversationRepository {
  create(input: CreateConversationInput): Promise<Conversation>;
  findById(id: string): Promise<Conversation | null>;
  touch(id: string): Promise<void>;
}
