import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TRANSACTION_TYPE } from '../../domain/constants/transactionType';
import { TRANSACTION_STATUS } from '../../domain/constants/transactionStatus';
import { LLMToolDefinition } from '../../domain/ports/LLMProvider';

export const TOOL_NAMES = {
  CREATE_TRANSACTION: 'create_transaction',
  GET_TRANSACTION_STATUS: 'get_transaction_status',
  LIST_TRANSACTIONS: 'list_transactions',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

export const createTransactionToolSchema = z.object({
  type: z.nativeEnum(TRANSACTION_TYPE),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().optional(),
  destination: z.string().optional(),
});

export const getTransactionStatusToolSchema = z.object({
  transactionId: z.string().min(1),
});

export const listTransactionsToolSchema = z.object({
  status: z.nativeEnum(TRANSACTION_STATUS).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const buildJsonSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options: { target: 'jsonSchema7'; $refStrategy: 'none' },
) => Record<string, unknown>;

// OpenAI validates tool/function parameters against JSON Schema draft 2020-12,
// where `exclusiveMinimum` must be a NUMBER. The `openApi3` target emitted the
// draft-4 boolean form (`exclusiveMinimum: true` + `minimum: 0`), which OpenAI
// rejected with "Invalid schema ... True is not of type 'number'". The
// `jsonSchema7` target emits the numeric form (`exclusiveMinimum: 0`). We also
// strip the `$schema` marker OpenAI does not expect at the parameters root.
const toParameters = (schema: z.ZodTypeAny): Record<string, unknown> => {
  const jsonSchema = buildJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  delete (jsonSchema as { $schema?: unknown }).$schema;
  return jsonSchema;
};

export const toolDefinitions: LLMToolDefinition[] = [
  {
    name: TOOL_NAMES.CREATE_TRANSACTION,
    description:
      'Create and trigger a money-movement transaction (transfer, payout, or refund). Processing is asynchronous.',
    parameters: toParameters(createTransactionToolSchema),
  },
  {
    name: TOOL_NAMES.GET_TRANSACTION_STATUS,
    description:
      'Retrieve the current status and event history of an transaction by its identifier.',
    parameters: toParameters(getTransactionStatusToolSchema),
  },
  {
    name: TOOL_NAMES.LIST_TRANSACTIONS,
    description:
      'List recent transactions, optionally filtered by status, for the current conversation.',
    parameters: toParameters(listTransactionsToolSchema),
  },
];
