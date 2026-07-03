import { DataSource } from 'typeorm';
import { Context } from '../../shared/context';
import { CONTEXT_KEYS } from '../../shared/constants/config';
import { Env, loadEnv } from '../config/env';
import { createLogger, AppLogger } from '../../shared/logger';
import { createDataSource } from '../database/dataSource';
import { ConversationSchema } from '../database/schemas/ConversationSchema';
import { MessageSchema } from '../database/schemas/MessageSchema';
import { TypeOrmTransactionRepository } from '../database/repositories/TypeOrmTransactionRepository';
import { TypeOrmConversationRepository } from '../database/repositories/TypeOrmConversationRepository';
import { TypeOrmMessageRepository } from '../database/repositories/TypeOrmMessageRepository';
import { MockTransactionProvider } from '../gateway/MockTransactionProvider';
import { OpenAIGateway } from '../gateway/OpenAIGateway';
import { createRedisConnection, RedisConnection } from '../queue/redisConnection';
import { createTransactionsQueue } from '../queue/queues';
import { TransactionOrchestrator } from '../../application/services/TransactionOrchestrator';
import { LLMService } from '../../application/services/LLMService';
import { CreateTransactionUseCase } from '../../application/use-cases/transaction/CreateTransactionUseCase';
import { GetTransactionStatusUseCase } from '../../application/use-cases/transaction/GetTransactionStatusUseCase';
import { ListTransactionsUseCase } from '../../application/use-cases/transaction/ListTransactionsUseCase';
import { HandleChatMessageUseCase } from '../../application/use-cases/chat/HandleChatMessageUseCase';
import { ToolRegistry } from '../../application/tools/toolRegistry';

export interface BootstrapResult {
  context: Context;
  env: Env;
  logger: AppLogger;
  queueConnection: RedisConnection;
  dataSource: DataSource;
}

export const bootstrap = async (): Promise<BootstrapResult> => {
  const env = loadEnv();
  const logger = createLogger(
    env.NODE_ENV === 'production' ? 'info' : 'debug',
    env.NODE_ENV !== 'production',
  );

  const context = new Context();
  context.register(CONTEXT_KEYS.CONFIG, env);
  context.register(CONTEXT_KEYS.LOGGER, logger);

  const dataSource = createDataSource(env);
  await dataSource.initialize();
  context.register(CONTEXT_KEYS.DATA_SOURCE, dataSource);
  logger.info('Database connection established (TypeORM DataSource)');

  const transactionRepository = new TypeOrmTransactionRepository(dataSource);
  const conversationRepository = new TypeOrmConversationRepository(
    dataSource.getRepository(ConversationSchema),
  );
  const messageRepository = new TypeOrmMessageRepository(
    dataSource.getRepository(MessageSchema),
  );
  context.register(CONTEXT_KEYS.TRANSACTION_REPOSITORY, transactionRepository);
  context.register(
    CONTEXT_KEYS.CONVERSATION_REPOSITORY,
    conversationRepository,
  );
  context.register(CONTEXT_KEYS.MESSAGE_REPOSITORY, messageRepository);

  const transactionProvider = new MockTransactionProvider(env, logger);
  context.register(CONTEXT_KEYS.TRANSACTION_PROVIDER, transactionProvider);

  const llmProvider = new OpenAIGateway(env);
  context.register(CONTEXT_KEYS.LLM_PROVIDER, llmProvider);

  const queueConnection = createRedisConnection(env);
  const transactionsQueue = createTransactionsQueue(queueConnection);
  context.register(CONTEXT_KEYS.TRANSACTIONS_QUEUE, transactionsQueue);

  const orchestrator = new TransactionOrchestrator(transactionsQueue, env, logger);
  context.register(CONTEXT_KEYS.TRANSACTION_ORCHESTRATOR, orchestrator);

  const llmService = new LLMService(llmProvider);
  context.register(CONTEXT_KEYS.LLM_SERVICE, llmService);

  const createTransactionUseCase = new CreateTransactionUseCase(
    transactionRepository,
    orchestrator,
    env,
    logger,
  );
  const getTransactionStatusUseCase = new GetTransactionStatusUseCase(
    transactionRepository,
  );
  const listTransactionsUseCase = new ListTransactionsUseCase(transactionRepository);
  context.register(
    CONTEXT_KEYS.CREATE_TRANSACTION_USE_CASE,
    createTransactionUseCase,
  );
  context.register(
    CONTEXT_KEYS.GET_TRANSACTION_STATUS_USE_CASE,
    getTransactionStatusUseCase,
  );
  context.register(
    CONTEXT_KEYS.LIST_TRANSACTIONS_USE_CASE,
    listTransactionsUseCase,
  );

  const toolRegistry = new ToolRegistry(
    createTransactionUseCase,
    getTransactionStatusUseCase,
    listTransactionsUseCase,
  );
  context.register(CONTEXT_KEYS.TOOL_REGISTRY, toolRegistry);

  const handleChatMessageUseCase = new HandleChatMessageUseCase(
    conversationRepository,
    messageRepository,
    llmService,
    toolRegistry,
    logger,
  );
  context.register(
    CONTEXT_KEYS.HANDLE_CHAT_MESSAGE_USE_CASE,
    handleChatMessageUseCase,
  );

  logger.info('Application context bootstrapped');

  return { context, env, logger, queueConnection, dataSource };
};
