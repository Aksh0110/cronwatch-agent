import path from 'path';
import os from 'os';
import { AgentConfig, ExecutionEvent, LogPatternConfig } from '../types';
import { ApiClient } from '../api/api.client';
import { logger } from '../utils/logger';
import { CronRegistry, CompiledJob, CompiledRule } from './cron-registry';
import { JobMatcher } from './job-matcher';
import { RuleEvaluator } from './rule-evaluator';
import { ExecutionTracker } from './execution-tracker';

interface LegacyCompiledPattern {
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  regex: RegExp;
  jobNameGroup?: number;
  durationGroup?: number;
  messageGroup?: number;
}

export class ParserService {
  private config: AgentConfig;
  private apiClient: ApiClient;

  // New registry components
  private cronRegistry?: CronRegistry;
  private jobMatcher?: JobMatcher;
  private ruleEvaluator?: RuleEvaluator;
  private executionTracker?: ExecutionTracker;

  // Legacy components
  private legacyCompiledPatterns: LegacyCompiledPattern[] = [];
  private legacyActiveJobs = new Map<string, string>(); // Maps jobName -> startedAt ISO string

  constructor(config: AgentConfig, apiClient: ApiClient) {
    this.config = config;
    this.apiClient = apiClient;

    if (config.jobs) {
      logger.info('Registry architecture enabled for log parser.');
      this.cronRegistry = new CronRegistry(config.jobs);
      this.jobMatcher = new JobMatcher();
      this.ruleEvaluator = new RuleEvaluator();
      this.executionTracker = new ExecutionTracker();
    } else {
      logger.info('Legacy pattern architecture enabled for log parser.');
      this.compileLegacyPatterns();
    }
  }

  private compileLegacyPatterns(): void {
    if (!this.config.logPatterns) return;
    for (const pattern of this.config.logPatterns) {
      try {
        const regex = new RegExp(pattern.regex);
        this.legacyCompiledPatterns.push({
          status: pattern.status,
          regex,
          jobNameGroup: pattern.jobNameGroup,
          durationGroup: pattern.durationGroup,
          messageGroup: pattern.messageGroup,
        });
      } catch (err: any) {
        logger.error(`Failed to compile legacy regex pattern "${pattern.regex}": ${err.message}`);
      }
    }
  }

  public parseLine(filePath: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (this.cronRegistry) {
      this.parseLineRegistry(filePath, trimmed);
    } else {
      this.parseLineLegacy(filePath, trimmed);
    }
  }

  /**
   * New parser logic using Cron Registry architecture
   */
  private parseLineRegistry(filePath: string, line: string): void {
    if (!this.cronRegistry || !this.jobMatcher || !this.ruleEvaluator || !this.executionTracker) return;

    // 1. Get jobs matching this log file path
    const fileJobs = this.cronRegistry.getJobsForFile(filePath);
    if (fileJobs.length === 0) return;

    // 2. Identify which job matches the log line
    const matchedJob = this.jobMatcher.findMatchingJob(line, fileJobs);
    if (!matchedJob) return; // Ignore if no job matches the identifier

    // 3. Evaluate rules for this job
    const matchedRule = this.ruleEvaluator.evaluateRules(line, matchedJob.rules);
    if (!matchedRule) return; // Stop if no rules match

    // 4. Update state machine
    const now = new Date().toISOString();
    if (matchedRule.status === 'STARTED') {
      logger.debug(`STARTED status detected for job [${matchedJob.name}]`);
      this.executionTracker.startExecution(matchedJob.name, now);
    } else {
      // SUCCESS, FAILED, or SKIPPED (completes the execution)
      const { startedAt, duration } = this.executionTracker.completeExecution(matchedJob.name, now);

      // Map status SUCCESS -> COMPLETED for dashboard compatibility
      const finalStatus = matchedRule.status === 'SUCCESS' ? 'COMPLETED' : matchedRule.status;

      const ruleDetails = `[type:${matchedRule.type}] pattern:"${matchedRule.pattern}" -> status:${matchedRule.status}`;

      const event: ExecutionEvent = {
        serverId: this.config.serverId,
        serverName: this.config.serverName,
        environment: this.config.environment,
        hostname: os.hostname(),
        processName: matchedJob.process,
        jobName: matchedJob.name,
        status: finalStatus,
        timestamp: now,
        rawLog: line,
        matchedRule: ruleDetails,
        message: line,
        duration,
        startedAt,
        completedAt: now,
        backend: this.config.backend,
      };

      this.apiClient.sendEvent(event);
    }
  }

  /**
   * Fallback logic for legacy logPatterns parser
   */
  private parseLineLegacy(filePath: string, line: string): void {
    for (const pattern of this.legacyCompiledPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        this.handleLegacyMatch(filePath, pattern, match, line);
        return;
      }
    }
  }

  private handleLegacyMatch(filePath: string, pattern: LegacyCompiledPattern, match: RegExpMatchArray, rawLine: string): void {
    try {
      let jobName = '';
      if (pattern.jobNameGroup !== undefined && match[pattern.jobNameGroup]) {
        jobName = match[pattern.jobNameGroup];
      } else {
        const fileConfig = this.config.logFiles?.find(
          (f) => path.resolve(f.path) === path.resolve(filePath)
        );
        jobName = fileConfig?.jobNameDefault || path.basename(filePath, path.extname(filePath));
      }

      const now = new Date().toISOString();

      if (pattern.status === 'STARTED') {
        this.legacyActiveJobs.set(jobName, now);

        const event: ExecutionEvent = {
          serverId: this.config.serverId,
          serverName: this.config.serverName,
          environment: this.config.environment,
          hostname: os.hostname(),
          processName: 'legacy-process',
          jobName,
          status: 'STARTED',
          timestamp: now,
          rawLog: rawLine,
          matchedRule: `Legacy patterns matching status: STARTED`,
          startedAt: now,
          backend: this.config.backend,
        };

        this.apiClient.sendEvent(event);
      } else {
        let startedAt = this.legacyActiveJobs.get(jobName);
        this.legacyActiveJobs.delete(jobName);

        let duration: number | undefined;
        if (pattern.durationGroup !== undefined && match[pattern.durationGroup]) {
          duration = parseInt(match[pattern.durationGroup], 10);
        }

        if (!startedAt) {
          if (duration !== undefined) {
            startedAt = new Date(Date.now() - duration).toISOString();
          } else {
            startedAt = now;
          }
        }

        let message: string | undefined;
        if (pattern.messageGroup !== undefined && match[pattern.messageGroup]) {
          message = match[pattern.messageGroup];
        }

        const finalStatus = pattern.status === 'SUCCESS' ? 'COMPLETED' : pattern.status;

        const event: ExecutionEvent = {
          serverId: this.config.serverId,
          serverName: this.config.serverName,
          environment: this.config.environment,
          hostname: os.hostname(),
          processName: 'legacy-process',
          jobName,
          status: finalStatus,
          timestamp: now,
          rawLog: rawLine,
          matchedRule: `Legacy patterns matching status: ${pattern.status}`,
          message: message || rawLine,
          duration,
          startedAt,
          completedAt: now,
          backend: this.config.backend,
        };

        this.apiClient.sendEvent(event);
      }
    } catch (err: any) {
      logger.error(`Failed to handle legacy log match: ${err.message}`);
    }
  }
}
