import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { logger } from '../utils/logger';

export class TailerService {
  private fileOffsets = new Map<string, number>();
  private watcher: chokidar.FSWatcher | null = null;
  private lineCallback: (filePath: string, line: string) => void;

  constructor(lineCallback: (filePath: string, line: string) => void) {
    this.lineCallback = lineCallback;
  }

  public watchFiles(filePaths: string[]): void {
    if (this.watcher) return;

    // Resolve absolute paths
    const pathsToWatch = filePaths.map((p) => path.resolve(p));

    this.watcher = chokidar.watch(pathsToWatch, {
      persistent: true,
      usePolling: process.platform === 'win32', // Use polling on Windows for reliability
      interval: 1000,
    });

    this.watcher.on('add', (filePath) => {
      try {
        const stats = fs.statSync(filePath);
        // Start reading only new changes, ignore old historical content on startup
        this.fileOffsets.set(filePath, stats.size);
        logger.info(`Log tailer watching: [${filePath}] starting at offset ${stats.size} bytes.`);
      } catch (err: any) {
        logger.error(`Failed to initialize file watch offset for [${filePath}]: ${err.message}`);
      }
    });

    this.watcher.on('change', (filePath) => {
      this.handleFileChange(filePath);
    });

    this.watcher.on('error', (err) => {
      logger.error(`Chokidar watcher encountered an error: ${err.message}`);
    });
  }

  public stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info('Log tailer watcher stopped.');
    }
  }

  private handleFileChange(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;
      let lastOffset = this.fileOffsets.get(filePath) ?? 0;

      // Handle log rotation or truncation
      if (currentSize < lastOffset) {
        logger.info(`File truncation/rotation detected on [${filePath}]. Resetting offset to 0.`);
        lastOffset = 0;
      }

      if (currentSize === lastOffset) {
        return; // No new bytes written
      }

      const readLength = currentSize - lastOffset;
      const buffer = Buffer.alloc(readLength);

      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, readLength, lastOffset);
      fs.closeSync(fd);

      // Record new offset
      this.fileOffsets.set(filePath, currentSize);

      const appendedText = buffer.toString('utf-8');
      const lines = appendedText.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        // Skip final empty entry created by trailing newlines
        if (i === lines.length - 1 && lines[i] === '') {
          continue;
        }
        this.lineCallback(filePath, lines[i]);
      }
    } catch (err: any) {
      logger.error(`Failed to tail file change for [${filePath}]: ${err.message}`);
    }
  }
}
