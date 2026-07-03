import { Router } from 'express';
import { z } from 'zod';
import { Context } from '../../shared/context';
import { CONTEXT_KEYS } from '../../shared/constants/config';
import { validate } from '../middlewares/validate';
import { HealthController } from '../controllers/HealthController';
import { ChatController } from '../controllers/ChatController';
import { TransactionController } from '../controllers/TransactionController';
import { HandleChatMessageUseCase } from '../../application/use-cases/chat/HandleChatMessageUseCase';
import { CreateTransactionUseCase } from '../../application/use-cases/transaction/CreateTransactionUseCase';
import { GetTransactionStatusUseCase } from '../../application/use-cases/transaction/GetTransactionStatusUseCase';
import { ListTransactionsUseCase } from '../../application/use-cases/transaction/ListTransactionsUseCase';
import { ConversationRepository } from '../../domain/ports/ConversationRepository';
import { MessageRepository } from '../../domain/ports/MessageRepository';
import { TRANSACTION_TYPE } from '../../domain/constants/transactionType';
import { TRANSACTION_STATUS } from '../../domain/constants/transactionStatus';

const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createTransactionBodySchema = z.object({
  type: z.nativeEnum(TRANSACTION_TYPE),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().max(140).optional(),
  destination: z.string().max(140).optional(),
  conversationId: z.string().uuid().optional(),
});

const listTransactionsQuerySchema = z.object({
  conversationId: z.string().uuid().optional(),
  status: z.nativeEnum(TRANSACTION_STATUS).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const buildRouter = (context: Context): Router => {
  const router = Router();

  const healthController = new HealthController();
  const chatController = new ChatController(
    context.resolve<HandleChatMessageUseCase>(
      CONTEXT_KEYS.HANDLE_CHAT_MESSAGE_USE_CASE,
    ),
    context.resolve<ConversationRepository>(
      CONTEXT_KEYS.CONVERSATION_REPOSITORY,
    ),
    context.resolve<MessageRepository>(CONTEXT_KEYS.MESSAGE_REPOSITORY),
  );
  const transactionController = new TransactionController(
    context.resolve<CreateTransactionUseCase>(
      CONTEXT_KEYS.CREATE_TRANSACTION_USE_CASE,
    ),
    context.resolve<GetTransactionStatusUseCase>(
      CONTEXT_KEYS.GET_TRANSACTION_STATUS_USE_CASE,
    ),
    context.resolve<ListTransactionsUseCase>(
      CONTEXT_KEYS.LIST_TRANSACTIONS_USE_CASE,
    ),
  );

  router.get('/health', healthController.check);

  router.post('/chat', validate(chatBodySchema), chatController.chat);
  router.post('/chat/stream', validate(chatBodySchema), chatController.stream);
  router.get(
    '/conversations/:id/messages',
    validate(idParamSchema, 'params'),
    chatController.getMessages,
  );

  router.post(
    '/transactions',
    validate(createTransactionBodySchema),
    transactionController.create,
  );
  router.get(
    '/transactions',
    validate(listTransactionsQuerySchema, 'query'),
    transactionController.list,
  );
  router.get(
    '/transactions/:id',
    validate(idParamSchema, 'params'),
    transactionController.get,
  );

  return router;
};
