type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
  private static levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private static currentLevel: number = Logger.getLogLevel();

  private static getLogLevel(): number {
    const envLevel = process.env.LOG_LEVEL || "info";
    return Logger.levels[envLevel as LogLevel] ?? Logger.levels.info;
  }

  static log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (Logger.levels[level] >= Logger.currentLevel) {
      console[level](`[${level.toUpperCase()}]`, message, ...args);
    }
  }

  static debug(message: string, ...args: unknown[]) {
    Logger.log("debug", message, ...args);
  }

  static info(message: string, ...args: unknown[]) {
    Logger.log("info", message, ...args);
  }

  static warn(message: string, ...args: unknown[]) {
    Logger.log("warn", message, ...args);
  }

  static error(message: string, ...args: unknown[]) {
    Logger.log("error", message, ...args);
  }
}

export default Logger;
