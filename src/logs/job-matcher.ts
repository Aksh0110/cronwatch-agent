import { CompiledJob } from './cron-registry';

export class JobMatcher {
  /**
   * Matches a log line to the correct job using the job's identifier.
   */
  public findMatchingJob(line: string, jobs: CompiledJob[]): CompiledJob | null {
    for (const job of jobs) {
      if (line.includes(job.identifier)) {
        return job;
      }
    }
    return null;
  }
}
