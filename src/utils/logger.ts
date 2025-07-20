export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private context: Record<string, any> = {};

  private constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    switch (envLevel) {
      case 'debug':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'info':
        this.logLevel = LogLevel.INFO;
        break;
      case 'warn':
        this.logLevel = LogLevel.WARN;
        break;
      case 'error':
        this.logLevel = LogLevel.ERROR;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setContext(context: Record<string, any>): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  withContext(context: Record<string, any>): Logger {
    const logger = Object.create(this);
    logger.context = { ...this.context, ...context };
    return logger;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...this.context, ...context },
      error,
    };

    const levelString = LogLevel[level];
    const contextString = Object.keys(entry.context || {}).length > 0 
      ? ` | ${JSON.stringify(entry.context)}` 
      : '';
    
    const errorString = error ? ` | Error: ${error.message}` : '';
    
    const logMessage = `[${entry.timestamp}] ${levelString}: ${message}${contextString}${errorString}`;
    
    // Use console.error for all levels to ensure MCP server logs are captured
    console.error(logMessage);

    if (error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Performance logging helpers
  startTimer(operation: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info(`Operation completed`, { 
        operation, 
        duration: `${duration}ms` 
      });
    };
  }

  // Database operation logging
  dbOperation(operation: string, query?: string, params?: any[]): Logger {
    return this.withContext({
      operation: 'database',
      dbOperation: operation,
      query: query?.substring(0, 100) + (query && query.length > 100 ? '...' : ''),
      paramCount: params?.length || 0,
    });
  }

  // MCP tool logging
  mcpTool(toolName: string, input?: any): Logger {
    return this.withContext({
      operation: 'mcp-tool',
      tool: toolName,
      inputKeys: input ? Object.keys(input) : [],
    });
  }

  // Schema analysis logging
  schemaAnalysis(operation: string, tableCount?: number, schemaName?: string): Logger {
    return this.withContext({
      operation: 'schema-analysis',
      schemaOperation: operation,
      tableCount,
      schemaName,
    });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, context?: Record<string, any>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, any>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, any>) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: Record<string, any>) => logger.error(message, error, context),
  timer: (operation: string) => logger.startTimer(operation),
  db: (operation: string, query?: string, params?: any[]) => logger.dbOperation(operation, query, params),
  mcp: (toolName: string, input?: any) => logger.mcpTool(toolName, input),
  schema: (operation: string, tableCount?: number, schemaName?: string) => logger.schemaAnalysis(operation, tableCount, schemaName),
};