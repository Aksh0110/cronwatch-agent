import path from 'path';
import { AgentConfig, ExecutionEvent } from '../types';
import { ApiClient } from '../api/api.client';
import { logger } from '../utils/logger';

interface CompiledPattern {
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  regex: RegExp;
  jobNameGroup?: number;
  durationGroup?: number;
  messageGroup?: number;
}

export class ParserService {
  private config: AgentConfig;
  private apiClient: ApiClient;
  private compiledPatterns: CompiledPattern[] = [];
  private activeJobs = new Map<string, string>(); // Maps jobName -> startedAt ISO string

  constructor(config: AgentConfig, apiClient: ApiClient) {
    this.config = config;
    this.apiClient = apiClient;
    this.compilePatterns();
  }

  private compilePatterns(): void {
    for (const pattern of this.config.logPatterns) {
      try {
        const regex = new RegExp(pattern.regex);
        this.compiledPatterns.push({
          status: pattern.status,
          regex,
          jobNameGroup: pattern.jobNameGroup,
          durationGroup: pattern.durationGroup,
          messageGroup: pattern.messageGroup,
        });
        logger.debug(`Loaded regex pattern for ${pattern.status}: ${pattern.regex}`);
      } catch (err: any) {
        logger.error(`Failed to compile regex pattern "${pattern.regex}": ${err.message}`);
      }
    }
  }

  public parseLine(filePath: string, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    for (const pattern of this.compiledPatterns) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        this.handleMatch(filePath, pattern, match);
        return; // Match found, stop matching this line
      }
    }
  }

  private handleMatch(filePath: string, pattern: CompiledPattern, match: RegExpMatchArray): void {
    try {
      // 1. Extract jobName from regex group, config fallback, or filename
      let jobName = '';
      if (pattern.jobNameGroup !== undefined && match[pattern.jobNameGroup]) {
        jobName = match[pattern.jobNameGroup];
      } else {
        const fileConfig = this.config.logFiles.find(
          (f) => path.resolve(f.path) === path.resolve(filePath)
        );
        jobName = fileConfig?.jobNameDefault || path.basename(filePath, path.extname(filePath));
      }

      const now = new Date().toISOString();

      if (pattern.status === 'STARTED') {
        // Track the job start time in memory
        this.activeJobs.set(jobName, now);

        const event: ExecutionEvent = {
          serverId: this.config.serverId,
          backend: this.config.backend,
          jobName,
          status: 'STARTED',
          startedAt: now,
        };

        this.apiClient.sendEvent(event);
      } else {
        // SUCCESS, FAILED, or SKIPPED
        let startedAt = this.activeJobs.get(jobName);
        this.activeJobs.delete(jobName); // Clear active tracking

        // Extract duration from regex group if possible
        let duration: number | undefined;
        if (pattern.durationGroup !== undefined && match[pattern.durationGroup]) {
          duration = parseInt(match[pattern.durationGroup], 10);
        }

        // Fallback startedAt calculation
        if (!startedAt) {
          if (duration !== undefined) {
            startedAt = new Date(Date.now() - duration).toISOString();
          } else {
            startedAt = now;
          }
        }

        // Extract error message or extra info from regex group if possible
        let message: string | undefined;
        if (pattern.messageGroup !== undefined && match[pattern.messageGroup]) {
          message = match[pattern.messageGroup];
        }

        // Map status 'SUCCESS' -> 'COMPLETED' to align with NestJS server Swagger endpoints
        let finalStatus: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED' = pattern.status;
        if (pattern.status === 'SUCCESS') {
          // Send as COMPLETED since the server dashboard API categorizes successes as COMPLETED
          finalStatus = 'COMPLETED' as any;
        }

        const event: ExecutionEvent = {
          serverId: this.config.serverId,
          backend: this.config.backend,
          jobName,
          status: finalStatus,
          startedAt,
          completedAt: now,
          duration,
          message,
        };

        this.apiClient.sendEvent(event);
      }
    } catch (err: any) {
      logger.error(`Failed to handle log match: ${err.message}`);
    }
  }
}
