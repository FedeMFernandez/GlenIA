import { NextFunction, Request, Response } from 'express';
import { HandleChatMessageUseCase } from '../../application/use-cases/chat/HandleChatMessageUseCase';
import { ConversationRepository } from '../../domain/ports/ConversationRepository';
import { MessageRepository } from '../../domain/ports/MessageRepository';
import { NotFoundError } from '../../domain/errors/DomainError';
import { toMessageDTO } from '../../application/dtos/ChatDTO';
import { toTransactionDTO } from '../../application/dtos/TransactionDTO';
import { DEFAULT_HISTORY_LIMIT } from '../../shared/constants/config';

interface ChatBody {
  conversationId?: string;
  message: string;
}

export class ChatController {
  constructor(
    private readonly handleChat: HandleChatMessageUseCase,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
  ) {}

  public chat = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as ChatBody;
      const result = await this.handleChat.execute({
        conversationId: body.conversationId ?? null,
        message: body.message,
        correlationId: req.correlationId,
      });
      res.status(200).json({
        conversationId: result.conversationId,
        message: toMessageDTO(result.assistantMessage),
        transactions: result.transactions.map((op) => toTransactionDTO(op)),
      });
    } catch (error) {
      next(error);
    }
  };

  public stream = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as ChatBody;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      for await (const event of this.handleChat.stream({
        conversationId: body.conversationId ?? null,
        message: body.message,
        correlationId: req.correlationId,
      })) {
        send(event.type, event);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Streaming failed';
      send('error', { code: 'STREAM_ERROR', message });
    } finally {
      res.end();
    }
  };

  public getMessages = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const conversationId = req.params.id;
      const conversation = await this.conversations.findById(conversationId);
      if (!conversation) {
        throw new NotFoundError(`Conversation not found: ${conversationId}`);
      }
      const history = await this.messages.listByConversation(
        conversationId,
        DEFAULT_HISTORY_LIMIT,
      );
      res.status(200).json({
        conversationId,
        messages: history.map(toMessageDTO),
      });
    } catch (error) {
      next(error);
    }
  };
}
