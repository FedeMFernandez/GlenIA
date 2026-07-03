import { EntitySchema } from 'typeorm';
import { ToolCallRecord } from '../../../domain/entities/Message';

export interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: ToolCallRecord[] | null;
  toolCallId: string | null;
  createdAt: Date;
}

export const MessageSchema = new EntitySchema<MessageRow>({
  name: 'Message',
  tableName: 'messages',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'gen_random_uuid()',
    },
    conversationId: {
      name: 'conversation_id',
      type: 'uuid',
      nullable: false,
    },
    role: {
      type: 'text',
      nullable: false,
    },
    content: {
      type: 'text',
      nullable: false,
      default: '',
    },
    toolCalls: {
      name: 'tool_calls',
      type: 'jsonb',
      nullable: true,
    },
    toolCallId: {
      name: 'tool_call_id',
      type: 'text',
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'timestamptz',
      nullable: false,
      default: () => 'now()',
    },
  },
  indices: [
    {
      name: 'idx_messages_conversation_created',
      columns: ['conversationId', 'createdAt'],
    },
  ],
});
