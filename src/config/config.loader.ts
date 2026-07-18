import fs from 'fs';
import path from 'path';
import { AgentConfig } from '../types';
import { logger } from '../utils/logger';

export class ConfigLoader {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.resolve(process.cwd(), 'config.json');
  }

  public load(): AgentConfig {
    try {
      logger.info(`Loading config from: ${this.configPath}`);
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Config file not found at ${this.configPath}`);
      }

      const rawContent = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(rawContent) as AgentConfig;

      this.validate(config);
      return config;
    } catch (error) {
      logger.error('Failed to load configuration: %o', error);
      throw error;
    }
  }

  private validate(config: AgentConfig): void {
    const requiredFields: (keyof AgentConfig)[] = [
      'serverId',
      'serverName',
      'backend',
      'environment',
      'cronWatchServer',
      'heartbeatInterval',
      'pm2Processes',
      'logFiles',
      'logPatterns',
    ];

    for (const field of requiredFields) {
      if (config[field] === undefined || config[field] === null) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    if (typeof config.heartbeatInterval !== 'number' || config.heartbeatInterval <= 0) {
      throw new Error('heartbeatInterval must be a positive number');
    }

    if (!Array.isArray(config.pm2Processes)) {
      throw new Error('pm2Processes must be an array of strings');
    }

    if (!Array.isArray(config.logFiles)) {
      throw new Error('logFiles must be an array');
    }

    if (!Array.isArray(config.logPatterns)) {
      throw new Error('logPatterns must be an array');
    }
  }
}
