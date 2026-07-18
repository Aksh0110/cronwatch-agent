# CronWatch Agent

The CronWatch Agent runs as a background service on host EC2 instances. It gathers host metrics, reads local PM2 process tables, tails configured application log files with zero overhead (byte-offset tracking), parses cron job logs using regex, and sends reports to the CronWatch Server. It features an in-memory event queue that handles network disconnects by queuing cron executions and flushing them once connectivity returns.

---

## Tech Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Dependencies**:
  - `axios`: For REST calls to the central server.
  - `pm2`: Programmatic API client to fetch process statuses.
  - `systeminformation`: Reads CPU, Memory, and Disk stats.
  - `chokidar`: Tracks log file modifications.
  - `winston`: Dual-target logging (agent logs & error logs).
  - `dotenv`: Load env configurations.

---

## Folder Structure

```
cronwatch-agent/
├── package.json
├── tsconfig.json
├── config.json             # Core settings: server ID, logs, and regex patterns
├── .env.example
├── Dockerfile
└── src/
    ├── main.ts             # Orchestrates startup & graceful shutdown (SIGINT/SIGTERM)
    ├── config/
    │   └── config.loader.ts # Reads and validates config.json on startup
    ├── heartbeat/
    │   └── heartbeat.service.ts # Gathers host system statistics & posts heartbeats
    ├── pm2/
    │   └── pm2.service.ts  # Interfaces with PM2 programmatic API to collect process metrics
    ├── logs/
    │   ├── tailer.service.ts # Watcher tracking offsets to only read new log appends
    │   └── parser.service.ts # Matches new lines with patterns to emit cron events
    ├── api/
    │   └── api.client.ts   # Axios API wrapper with registration & event queue retrier
    ├── types/
    │   └── index.ts        # Common TypeScript interfaces
    └── utils/
        └── logger.ts       # Winston logger setup
```

---

## Configuration (`config.json`)

Configure your target server and rules in `config.json`:

```json
{
  "serverId": "srv-001",
  "serverName": "App Server 1",
  "backend": "PM2",
  "environment": "production",
  "cronWatchServer": "http://localhost:3000",
  "heartbeatInterval": 30000,
  "pm2Processes": ["my-api-server", "backup-script"],
  "logFiles": [
    {
      "path": "./logs/mock-cron.log",
      "jobNameDefault": "mock-cron-job"
    }
  ],
  "logPatterns": [
    {
      "status": "STARTED",
      "regex": "Cron job \\[(.+)\\] started",
      "jobNameGroup": 1
    },
    {
      "status": "SUCCESS",
      "regex": "Cron job \\[(.+)\\] completed successfully in (\\d+)ms",
      "jobNameGroup": 1,
      "durationGroup": 2
    },
    {
      "status": "FAILED",
      "regex": "Cron job \\[(.+)\\] failed with error: (.+)",
      "jobNameGroup": 1,
      "messageGroup": 2
    }
  ]
}
```

---

## Run & Install

### Installation
```bash
npm install
```

### Dev Mode
```bash
npm run dev
```

### Production Build & Execution
```bash
npm run build
npm run start
```

### Docker execution
```bash
docker build -t cronwatch-agent .
docker run -d --name cronwatch-agent cronwatch-agent
```

---

## Logging

All logs are written to the `./logs` folder:
- **`logs/agent.log`**: Logs debug, info, warnings, and error messages.
- **`logs/error.log`**: Contains only error stacks.

---

## Testing & Verifying Functionality

You can test the log parser using the pre-configured mock file:

1. Create a `logs` directory if it does not exist:
   ```bash
   mkdir logs
   ```
2. Start the agent in development mode (`npm run dev`).
3. Open a second terminal and append a startup log:
   ```bash
   echo "Cron job [db-backup] started" >> logs/mock-cron.log
   ```
   *Verify the agent console outputs: `Event [db-backup] (STARTED) sent to server.`*
4. Append a successful completion log:
   ```bash
   echo "Cron job [db-backup] completed successfully in 1500ms" >> logs/mock-cron.log
   ```
   *Verify the agent console outputs: `Event [db-backup] (COMPLETED) sent to server.`*
5. Append a failure log:
   ```bash
   echo "Cron job [db-backup] failed with error: Connection refused" >> logs/mock-cron.log
   ```
   *Verify the agent console outputs: `Event [db-backup] (FAILED) sent to server.`*
