import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1735689600000 implements MigrationInterface {
  public name = 'Init1735689600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`create extension if not exists pgcrypto`);

    await queryRunner.query(`
      create table if not exists conversations (
        id uuid primary key default gen_random_uuid(),
        title text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create table if not exists messages (
        id uuid primary key default gen_random_uuid(),
        conversation_id uuid not null references conversations (id) on delete cascade,
        role text not null check (role in ('user', 'assistant', 'tool', 'system')),
        content text not null default '',
        tool_calls jsonb,
        tool_call_id text,
        created_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create index if not exists idx_messages_conversation_created
        on messages (conversation_id, created_at)
    `);

    await queryRunner.query(`
      create table if not exists transactions (
        id uuid primary key default gen_random_uuid(),
        conversation_id uuid references conversations (id) on delete set null,
        idempotency_key text not null unique,
        type text not null,
        status text not null default 'pending',
        request_payload jsonb not null default '{}'::jsonb,
        result jsonb,
        error jsonb,
        attempts int not null default 0,
        max_attempts int not null default 4,
        correlation_id text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        started_at timestamptz,
        finished_at timestamptz
      )
    `);

    await queryRunner.query(`
      create unique index if not exists idx_transactions_idempotency_key
        on transactions (idempotency_key)
    `);

    await queryRunner.query(`
      create index if not exists idx_transactions_conversation
        on transactions (conversation_id)
    `);

    await queryRunner.query(`
      create index if not exists idx_transactions_status
        on transactions (status)
    `);

    await queryRunner.query(`
      create table if not exists transaction_events (
        id uuid primary key default gen_random_uuid(),
        transaction_id uuid not null references transactions (id) on delete cascade,
        from_status text,
        to_status text not null,
        attempt int not null default 0,
        message text,
        created_at timestamptz not null default now()
      )
    `);

    await queryRunner.query(`
      create index if not exists idx_transaction_events_transaction_created
        on transaction_events (transaction_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`drop table if exists transaction_events`);
    await queryRunner.query(`drop table if exists transactions`);
    await queryRunner.query(`drop table if exists messages`);
    await queryRunner.query(`drop table if exists conversations`);
  }
}
