import dotenv from 'dotenv';
import path from 'path';
import { ConfigLoader } from './config/config.loader';
import { ApiClient } from './api/api.client';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { TailerService } from './logs/tailer.service';
import { ParserService } from './logs/parser.service';
import { pm2Service } from './pm2/pm2.service';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function bootstrap() {
  logger.info('=============================================');
  logger.info('Starting CronWatch Agent...');
  logger.info('=============================================');

  try {
    // 1. Load config
    const configLoader = new ConfigLoader();
    const config = configLoader.load();

    // 2. Initialize API Client
    const apiClient = new ApiClient(config);

    // 3. Register the agent with the server immediately on boot
    const registered = await apiClient.registerAgent();
    if (!registered) {
      logger.warn('Agent registration failed on startup. Registration will be retried implicitly when server becomes online.');
    }

    // 4. Start HTTP Event Queue Processor
    apiClient.startQueueProcessor();

    // 5. Initialize & Start Heartbeat Service
    const heartbeatService = new HeartbeatService(config, apiClient);
    heartbeatService.start();

    // 6. Initialize parser and tailer services for log files
    const parserService = new ParserService(config, apiClient);
    const tailerService = new TailerService((filePath, line) => {
      parserService.parseLine(filePath, line);
    });

    let filePaths: string[] = [];
    if (config.jobs) {
      filePaths = config.jobs.map((j) => j.logFile);
    } else if (config.logFiles) {
      filePaths = config.logFiles.map((f) => f.path);
    }

    if (filePaths.length > 0) {
      tailerService.watchFiles(filePaths);
    } else {
      logger.info('No log files configured for tailing.');
    }

    // 7. Setup Graceful Shutdown Hooks
    const handleShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Stop intervals and watchers
      heartbeatService.stop();
      tailerService.stop();
      apiClient.stopQueueProcessor();

      // Disconnect cleanly from PM2 daemon
      try {
        pm2Service.disconnect();
        logger.info('PM2 daemon connection closed.');
      } catch (err: any) {
        logger.error('Error disconnecting from PM2: %s', err.message);
      }

      logger.info('Shutdown complete. Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  } catch (error: any) {
    logger.error('Agent failed to bootstrap: %s', error.stack || error.message);
    process.exit(1);
  }
}

bootstrap();
