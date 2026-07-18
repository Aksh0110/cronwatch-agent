export interface RunningExecution {
  startedAt: string;
}

export class ExecutionTracker {
  private runningExecutions = new Map<string, RunningExecution>();

  /**
   * Records the start of a cron job execution.
   */
  public startExecution(jobName: string, startedAtIsoString: string): void {
    this.runningExecutions.set(jobName, { startedAt: startedAtIsoString });
  }

  /**
   * Completes a running execution, returns the start time and calculates duration if possible.
   */
  public completeExecution(jobName: string, completedAtIsoString: string): { startedAt: string; duration?: number } {
    const running = this.runningExecutions.get(jobName);
    if (running) {
      this.runningExecutions.delete(jobName);
      const startMs = new Date(running.startedAt).getTime();
      const endMs = new Date(completedAtIsoString).getTime();
      const duration = Math.max(0, endMs - startMs);
      return { startedAt: running.startedAt, duration };
    }
    
    // Default to completion time as start time if no started event was tracked
    return { startedAt: completedAtIsoString };
  }
}
