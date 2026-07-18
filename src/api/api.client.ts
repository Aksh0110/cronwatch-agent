import axios, { AxiosInstance } from 'axios';
import { ExecutionEvent, HeartbeatPayload, AgentConfig } from '../types';
import { logger } from '../utils/logger';

export class ApiClient {
  private client: AxiosInstance;
  private config: AgentConfig;
  private eventQueue: ExecutionEvent[] = [];
  private isProcessingQueue = false;
  private queueInterval: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.cronWatchServer,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  public startQueueProcessor(): void {
    if (this.queueInterval) return;
    
    // Process queue every 10 seconds
    this.queueInterval = setInterval(async () => {
      await this.processQueue();
    }, 10000);
    logger.info('API client event queue processor started.');
  }

  public stopQueueProcessor(): void {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
      logger.info('API client event queue processor stopped.');
    }
  }

  public async registerAgent(): Promise<boolean> {
    try {
      const payload = {
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        hostname: require('os').hostname(),
        ipAddress: this.getIpAddress(),
        environment: this.config.environment,
        backend: this.config.backend,
      };

      logger.info('Registering agent with server...');
      await this.client.post('/agents/register', payload);
      logger.info('Agent registered successfully.');
      return true;
    } catch (error: any) {
      logger.error('Failed to register agent: %s', error.message);
      return false;
    }
  }

  public async sendHeartbeat(payload: HeartbeatPayload): Promise<void> {
    try {
      await this.client.post('/agents/heartbeat', { serverId: payload.serverId });
      logger.debug('Heartbeat sent successfully.');
    } catch (error: any) {
      logger.warn('Failed to send heartbeat: %s', error.message);
    }
  }

  public async sendEvent(event: ExecutionEvent): Promise<void> {
    try {
      await this.client.post('/events', event);
      logger.info(`Event [${event.jobName}] (${event.status}) sent to server.`);
    } catch (error: any) {
      if (this.isNetworkOrServerError(error)) {
        logger.warn(`Server unavailable. Queuing event [${event.jobName}] (${event.status}). Error: ${error.message}`);
        this.eventQueue.push(event);
      } else {
        logger.error(`Validation/Client error sending event [${event.jobName}]. Discarded. Error: %o`, error.response?.data || error.message);
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.eventQueue.length === 0) return;

    this.isProcessingQueue = true;
    logger.info(`Processing queued events (${this.eventQueue.length} items in queue)...`);

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue[0];
      try {
        await this.client.post('/events', event);
        logger.info(`Queued event [${event.jobName}] (${event.status}) sent successfully.`);
        this.eventQueue.shift(); // Remove successfully sent event
      } catch (error: any) {
        if (this.isNetworkOrServerError(error)) {
          logger.warn(`Server still unavailable. Retaining remaining ${this.eventQueue.length} events. Error: ${error.message}`);
          break; // Stop loop and retry later
        } else {
          logger.error(`Discarding corrupt queued event [${event.jobName}]: %o`, error.response?.data || error.message);
          this.eventQueue.shift(); // Remove bad payload to prevent blockages
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private isNetworkOrServerError(error: any): boolean {
    // If no response received (network error), or server responded with 5xx status code
    if (!error.response) {
      return true;
    }
    const status = error.response.status;
    return status >= 500;
  }

  private getIpAddress(): string {
    const interfaces = require('os').networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  // Exposed for checking queue size during diagnostics
  public getQueueLength(): number {
    return this.eventQueue.length;
  }
}
