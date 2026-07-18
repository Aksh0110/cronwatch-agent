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
    const baseRequiredFields: (keyof AgentConfig)[] = [
      'serverId',
      'serverName',
      'backend',
      'environment',
      'cronWatchServer',
      'heartbeatInterval',
      'pm2Processes',
    ];

    for (const field of baseRequiredFields) {
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

    if (config.jobs) {
      if (!Array.isArray(config.jobs)) {
        throw new Error('jobs configuration must be an array');
      }

      for (const job of config.jobs) {
        if (!job.name || !job.identifier || !job.process || !job.logFile || job.enabled === undefined || !job.rules) {
          throw new Error(`Job config is missing fields: ${JSON.stringify(job)}`);
        }

        if (!Array.isArray(job.rules)) {
          throw new Error(`Rules for job ${job.name} must be an array`);
        }

        for (const rule of job.rules) {
          if (!rule.type || !rule.pattern || !rule.status) {
            throw new Error(`Rule in job ${job.name} is missing fields: ${JSON.stringify(rule)}`);
          }

          if (rule.type !== 'contains' && rule.type !== 'regex') {
            throw new Error(`Invalid rule type "${rule.type}" in job ${job.name}. Must be "contains" or "regex".`);
          }

          const validStatuses = ['STARTED', 'SUCCESS', 'FAILED', 'SKIPPED'];
          if (!validStatuses.includes(rule.status)) {
            throw new Error(`Invalid status "${rule.status}" in job ${job.name}. Must be one of ${validStatuses.join(', ')}.`);
          }
        }
      }
    } else {
      // Fallback: Validate legacy logFiles and logPatterns
      if (!config.logFiles || !Array.isArray(config.logFiles)) {
        throw new Error('logFiles must be an array when jobs are not configured');
      }

      if (!config.logPatterns || !Array.isArray(config.logPatterns)) {
        throw new Error('logPatterns must be an array when jobs are not configured');
      }
    }
  }
}
