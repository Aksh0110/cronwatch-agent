import os from 'os';
import si from 'systeminformation';
import { AgentConfig, HeartbeatPayload, SystemStats } from '../types';
import { ApiClient } from '../api/api.client';
import { pm2Service } from '../pm2/pm2.service';
import { logger } from '../utils/logger';

export class HeartbeatService {
  private config: AgentConfig;
  private apiClient: ApiClient;
  private interval: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig, apiClient: ApiClient) {
    this.config = config;
    this.apiClient = apiClient;
  }

  public start(): void {
    if (this.interval) return;

    this.interval = setInterval(async () => {
      await this.tick();
    }, this.config.heartbeatInterval);

    logger.info(`Heartbeat service started. Sending every ${this.config.heartbeatInterval}ms.`);
    // Trigger immediate heartbeat on start
    this.tick();
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Heartbeat service stopped.');
    }
  }

  private async tick(): Promise<void> {
    try {
      const stats = await this.collectSystemStats();
      const pm2 = await pm2Service.collectPM2Info(this.config.pm2Processes);

      const payload: HeartbeatPayload = {
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        hostname: os.hostname(),
        uptime: Math.round(os.uptime()),
        environment: this.config.environment,
        backend: this.config.backend,
        stats,
        pm2,
        timestamp: new Date().toISOString(),
      };

      await this.apiClient.sendHeartbeat(payload);
    } catch (error: any) {
      logger.error('Failed to run heartbeat tick: %s', error.message);
    }
  }

  private async collectSystemStats(): Promise<SystemStats> {
    try {
      const load = await si.currentLoad();
      const mem = await si.mem();
      const disk = await si.fsSize();

      // Find default root mount
      const primaryDisk = disk.find((d) => d.mount === '/') || 
                          disk.find((d) => d.mount === 'C:') || 
                          disk[0] || 
                          { size: 0, used: 0, use: 0 };

      return {
        cpuUsage: Math.round(load.currentLoad),
        memoryTotal: mem.total,
        memoryFree: mem.free,
        memoryUsedPercent: Math.round(((mem.total - mem.free) / mem.total) * 100),
        diskTotal: primaryDisk.size,
        diskFree: primaryDisk.size - primaryDisk.used,
        diskUsedPercent: Math.round(primaryDisk.use || 0),
      };
    } catch (error: any) {
      logger.error('Error collecting system information stats: %s', error.message);
      return {
        cpuUsage: 0,
        memoryTotal: 0,
        memoryFree: 0,
        memoryUsedPercent: 0,
        diskTotal: 0,
        diskFree: 0,
        diskUsedPercent: 0,
      };
    }
  }
}
