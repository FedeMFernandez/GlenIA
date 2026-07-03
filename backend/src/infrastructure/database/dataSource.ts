import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Env, loadEnv } from '../config/env';
import { TransactionSchema } from './schemas/TransactionSchema';
import { TransactionEventSchema } from './schemas/TransactionEventSchema';
import { ConversationSchema } from './schemas/ConversationSchema';
import { MessageSchema } from './schemas/MessageSchema';
import { Init1735689600000 } from './migrations/1735689600000-Init';

export const buildDataSourceOptions = (env: Env): DataSourceOptions => ({
  type: 'postgres',
  url: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  entities: [
    TransactionSchema,
    TransactionEventSchema,
    ConversationSchema,
    MessageSchema,
  ],
  migrations: [Init1735689600000],
  synchronize: false,
  logging: false,
});

export const createDataSource = (env: Env): DataSource =>
  new DataSource(buildDataSourceOptions(env));

export default createDataSource(loadEnv());
