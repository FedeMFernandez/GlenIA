import { EntitySchema } from 'typeorm';

export interface ConversationRow {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const ConversationSchema = new EntitySchema<ConversationRow>({
  name: 'Conversation',
  tableName: 'conversations',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'gen_random_uuid()',
    },
    title: {
      type: 'text',
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'timestamptz',
      nullable: false,
      default: () => 'now()',
    },
    updatedAt: {
      name: 'updated_at',
      type: 'timestamptz',
      nullable: false,
      default: () => 'now()',
    },
  },
});
