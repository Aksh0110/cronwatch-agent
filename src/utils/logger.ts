import winston from 'winston';
import path from 'path';
import DailyRotateFile from 'winston-daily-rotate-file';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'cronwatch-agent' },
  transports: [
    new DailyRotateFile({ 
      filename: path.join('logs', 'error-%DATE%.log'), 
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      level: 'error' 
    }),
    new DailyRotateFile({ 
      filename: path.join('logs', 'agent-%DATE%.log'), 
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d' 
    }),
    new winston.transports.Console({
      format: consoleFormat
    })
  ]
});
