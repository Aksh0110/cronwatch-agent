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

export interface RuleConfig {
  type: 'contains' | 'regex';
  pattern: string;
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
}

export interface JobConfig {
  name: string;
  identifier: string;
  process: string;
  logFile: string;
  enabled: boolean;
  rules: RuleConfig[];
}

export interface AgentConfig {
  serverId: string;
  serverName: string;
  backend: string;
  environment: string;
  cronWatchServer: string;
  heartbeatInterval: number;
  pm2Processes: string[];
  logFiles?: LogFileConfig[];
  logPatterns?: LogPatternConfig[];
  jobs?: JobConfig[];
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
  serverName: string;
  environment: string;
  hostname: string;
  processName: string;
  jobName: string;
  status: string;
  timestamp: string;
  rawLog: string;
  matchedRule: string;
  message?: string;
  duration?: number;
  startedAt: string;
  completedAt?: string;
  backend?: string;
}
