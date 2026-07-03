export const QUEUE_NAMES = {
  TRANSACTIONS: 'transactions',
} as const;

export const CONTEXT_KEYS = {
  CONFIG: 'config',
  LOGGER: 'logger',
  DATA_SOURCE: 'dataSource',
  TRANSACTION_REPOSITORY: 'transactionRepository',
  CONVERSATION_REPOSITORY: 'conversationRepository',
  MESSAGE_REPOSITORY: 'messageRepository',
  TRANSACTION_PROVIDER: 'transactionProvider',
  LLM_PROVIDER: 'llmProvider',
  LLM_SERVICE: 'llmService',
  TRANSACTION_ORCHESTRATOR: 'transactionOrchestrator',
  TRANSACTIONS_QUEUE: 'transactionsQueue',
  CREATE_TRANSACTION_USE_CASE: 'createTransactionUseCase',
  GET_TRANSACTION_STATUS_USE_CASE: 'getTransactionStatusUseCase',
  LIST_TRANSACTIONS_USE_CASE: 'listTransactionsUseCase',
  HANDLE_CHAT_MESSAGE_USE_CASE: 'handleChatMessageUseCase',
  TOOL_REGISTRY: 'toolRegistry',
} as const;

export const CORRELATION_HEADER = 'x-correlation-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export const DEFAULT_HISTORY_LIMIT = 50;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_TOOL_ITERATIONS = 5;

export const SYSTEM_PROMPT = [
  'You are an transactions assistant for a money-movement platform.',
  'You can create transactions (transfer, payout, refund), check their status, and list them.',
  'Transactions are processed asynchronously and may take time to reach a terminal state.',
  'When a user asks to move money, use the create_transaction tool.',
  'Always confirm the transaction reference and current status back to the user in clear language.',
  'Never invent transaction identifiers or statuses; rely only on tool results.',
].join(' ');
