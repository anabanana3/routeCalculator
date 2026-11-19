import 'dotenv/config';
import { loadConfig } from './infrastructure/config/env-config.js';
import { createLogger, setLogLevel } from './infrastructure/logging/console-logger.js';
import { startServer } from './main.js';

const config = loadConfig(process.env);
setLogLevel(config.logLevel);
const logger = createLogger('server');

const running = await startServer(config);

const shutdown = () => {
  logger.info('Deteniendo el servidor');
  void running.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
