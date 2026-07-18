export interface LogFileConfig {
  path: string;
  jobNameDefault?: string;
}

export interface LogPatternConfig {
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  regex: string;
  jobNameGroup?: number;
  durationGroup?: number;
  messageGroup?: number;
}

export interface AgentConfig {
  serverId: string;
  serverName: string;
  backend: string;
  environment: string;
  cronWatchServer: string;
  heartbeatInterval: number;
  pm2Processes: string[];
  logFiles: LogFileConfig[];
  logPatterns: LogPatternConfig[];
}

export interface PM2ProcessInfo {
  processName: string;
  status: string;
  pid: number;
  restartCount: number;
  uptime: number;
}

export interface SystemStats {
  cpuUsage: number;
  memoryTotal: number;
  memoryFree: number;
  memoryUsedPercent: number;
  diskTotal: number;
  diskFree: number;
  diskUsedPercent: number;
}

export interface HeartbeatPayload {
  serverId: string;
  serverName: string;
  hostname: string;
  uptime: number;
  environment: string;
  backend: string;
  stats: SystemStats;
  pm2: PM2ProcessInfo[];
  timestamp: string;
}

export interface ExecutionEvent {
  serverId: string;
  backend: string;
  jobName: string;
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  message?: string;
}
