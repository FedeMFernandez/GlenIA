import { Server } from 'node:http';
import { bootstrap } from './infrastructure/server/bootstrap';
import { buildApp } from './infrastructure/server/App';
import { initWorkers } from './infrastructure/queue/workers';
import { StalledTransactionReaper } from './application/jobs/StalledTransactionReaper';
import { CONTEXT_KEYS } from './shared/constants/config';
import { TransactionRepository } from './domain/ports/TransactionRepository';

const main = async (): Promise<void> => {
  const { context, env, logger, queueConnection, dataSource } =
    await bootstrap();
  const app = buildApp(context);

  const workers = initWorkers(context);
  const reaper = new StalledTransactionReaper(
    context.resolve<TransactionRepository>(CONTEXT_KEYS.TRANSACTION_REPOSITORY),
    env,
    logger,
  );
  reaper.start();

  const server: Server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown initiated');
    reaper.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await workers.close();
    await queueConnection.quit();
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    logger.info('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup', err);
  process.exit(1);
});
