import { EntitySchema } from 'typeorm';

export interface TransactionEventRow {
  id: string;
  transactionId: string;
  fromStatus: string | null;
  toStatus: string;
  attempt: number;
  message: string | null;
  createdAt: Date;
}

export const TransactionEventSchema = new EntitySchema<TransactionEventRow>({
  name: 'TransactionEvent',
  tableName: 'transaction_events',
  columns: {
    id: {
      type: 'uuid',
      primary: true,
      default: () => 'gen_random_uuid()',
    },
    transactionId: {
      name: 'transaction_id',
      type: 'uuid',
      nullable: false,
    },
    fromStatus: {
      name: 'from_status',
      type: 'text',
      nullable: true,
    },
    toStatus: {
      name: 'to_status',
      type: 'text',
      nullable: false,
    },
    attempt: {
      type: 'int',
      nullable: false,
      default: 0,
    },
    message: {
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
      name: 'idx_transaction_events_transaction_created',
      columns: ['transactionId', 'createdAt'],
    },
  ],
});
