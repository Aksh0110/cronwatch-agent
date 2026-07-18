import { JobConfig, RuleConfig } from '../types';
import { logger } from '../utils/logger';

export interface CompiledRule extends RuleConfig {
  regex?: RegExp;
}

export interface CompiledJob extends Omit<JobConfig, 'rules'> {
  rules: CompiledRule[];
}

export class CronRegistry {
  private compiledJobs: CompiledJob[] = [];

  constructor(jobs: JobConfig[] = []) {
    this.initialize(jobs);
  }

  private initialize(jobs: JobConfig[]): void {
    logger.info(`Initializing CronRegistry with ${jobs.length} jobs.`);
    for (const job of jobs) {
      if (!job.enabled) {
        logger.debug(`Skipping disabled job: ${job.name}`);
        continue;
      }

      const compiledRules: CompiledRule[] = job.rules.map((rule) => {
        if (rule.type === 'regex') {
          try {
            return {
              ...rule,
              regex: new RegExp(rule.pattern),
            };
          } catch (err: any) {
            logger.error(`Failed to compile regex for job [${job.name}] pattern "${rule.pattern}": ${err.message}`);
          }
        }
        return rule;
      });

      this.compiledJobs.push({
        ...job,
        rules: compiledRules,
      });
    }
  }

  public getJobsForFile(filePath: string): CompiledJob[] {
    const resolvedPath = require('path').resolve(filePath);
    return this.compiledJobs.filter(
      (job) => require('path').resolve(job.logFile) === resolvedPath
    );
  }

  public getAllJobs(): CompiledJob[] {
    return this.compiledJobs;
  }
}
