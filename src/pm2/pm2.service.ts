import pm2 from 'pm2';
import { PM2ProcessInfo } from '../types';
import { logger } from '../utils/logger';

export class PM2Service {
  public async collectPM2Info(processNames: string[]): Promise<PM2ProcessInfo[]> {
    return new Promise((resolve) => {
      // Connect to PM2 daemon
      pm2.connect((connectErr) => {
        if (connectErr) {
          logger.error('Failed to connect to PM2 daemon: %s', connectErr.message);
          return resolve([]);
        }

        // Retrieve process list
        pm2.list((listErr, processDescriptionList) => {
          if (listErr) {
            logger.error('Failed to retrieve PM2 process list: %s', listErr.message);
            pm2.disconnect();
            return resolve([]);
          }

          const filteredList = processDescriptionList
            .filter((proc) => proc.name && processNames.includes(proc.name))
            .map((proc) => {
              // Calculate uptime in seconds
              const pmUptime = proc.pm2_env?.pm_uptime || 0;
              const uptimeSeconds = pmUptime ? Math.round((Date.now() - pmUptime) / 1000) : 0;

              return {
                processName: proc.name || '',
                status: proc.pm2_env?.status || 'unknown',
                pid: proc.pid || 0,
                restartCount: proc.pm2_env?.restart_time || 0,
                uptime: uptimeSeconds,
              };
            });

          pm2.disconnect();
          resolve(filteredList);
        });
      });
    });
  }

  // Provide a clean programmatic disconnect if needed elsewhere
  public disconnect(): void {
    pm2.disconnect();
  }
}

export const pm2Service = new PM2Service();
