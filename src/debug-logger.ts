/**
 * 调试日志模块
 * 
 * 提供详细的调试日志输出和内部状态显示
 */

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * 日志条目
 */
export interface LogEntry {
  level: LogLevel
  timestamp: number
  message: string
  context?: Record<string, unknown>
  stack?: string
}

/**
 * 调试日志器
 */
export class DebugLogger {
  private static instance: DebugLogger
  private enabled: boolean = false
  private level: LogLevel = LogLevel.INFO
  private logs: LogEntry[] = []
  private maxLogs: number = 1000

  private constructor() { }

  /**
   * 获取单例实例
   */
  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger()
    }
    return DebugLogger.instance
  }

  /**
   * 启用调试模式
   */
  enable(): void {
    this.enabled = true
    this.level = LogLevel.DEBUG
  }

  /**
   * 禁用调试模式
   */
  disable(): void {
    this.enabled = false
    this.level = LogLevel.INFO
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (level < this.level) {
      return
    }

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      context,
      stack: level === LogLevel.ERROR ? new Error().stack : undefined,
    }

    this.logs.push(entry)

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 如果启用调试模式，立即输出
    if (this.enabled) {
      this.printEntry(entry)
    }
  }

  /**
   * 打印日志条目
   */
  private printEntry(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const levelStr = LogLevel[entry.level].padEnd(5)
    const prefix = `[${timestamp}] [${levelStr}]`

    let message = `${prefix} ${entry.message}`

    if (entry.context && Object.keys(entry.context).length > 0) {
      message += `\n  Context: ${JSON.stringify(entry.context, null, 2).split('\n').join('\n  ')}`
    }

    if (entry.stack && this.enabled) {
      message += `\n  Stack: ${entry.stack.split('\n').slice(2, 5).join('\n  ')}`
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message)
        break
      case LogLevel.INFO:
        console.info(message)
        break
      case LogLevel.WARN:
        console.warn(message)
        break
      case LogLevel.ERROR:
        console.error(message)
        break
    }
  }

  /**
   * 调试日志
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * 信息日志
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * 警告日志
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * 错误日志
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context)
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 获取特定级别的日志
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level)
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = []
  }

  /**
   * 导出日志为 JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  /**
   * 打印所有日志
   */
  printAll(): void {
    console.log('\n' + '='.repeat(80))
    console.log('🐛 调试日志')
    console.log('='.repeat(80))

    if (this.logs.length === 0) {
      console.log('\n没有日志记录\n')
      return
    }

    for (const entry of this.logs) {
      this.printEntry(entry)
    }

    console.log('\n' + '='.repeat(80))
    console.log(`总计: ${this.logs.length} 条日志`)
    console.log('='.repeat(80) + '\n')
  }

  /**
   * 打印统计信息
   */
  printStats(): void {
    const stats = {
      total: this.logs.length,
      debug: this.getLogsByLevel(LogLevel.DEBUG).length,
      info: this.getLogsByLevel(LogLevel.INFO).length,
      warn: this.getLogsByLevel(LogLevel.WARN).length,
      error: this.getLogsByLevel(LogLevel.ERROR).length,
    }

    console.log('\n📊 日志统计:')
    console.log(`  总计: ${stats.total}`)
    console.log(`  调试: ${stats.debug}`)
    console.log(`  信息: ${stats.info}`)
    console.log(`  警告: ${stats.warn}`)
    console.log(`  错误: ${stats.error}`)
  }

  /**
   * 记录性能指标
   */
  logPerformance(label: string, duration: number, context?: Record<string, unknown>): void {
    this.debug(`Performance: ${label}`, {
      duration: `${duration.toFixed(2)}ms`,
      ...context,
    })
  }

  /**
   * 记录内存使用
   */
  logMemory(label: string): void {
    const mem = process.memoryUsage()
    this.debug(`Memory: ${label}`, {
      heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
      external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`,
    })
  }

  /**
   * 记录状态快照
   */
  logState(label: string, state: Record<string, unknown>): void {
    this.debug(`State: ${label}`, state)
  }
}

/**
 * 获取全局调试日志器实例
 */
export function getDebugLogger(): DebugLogger {
  return DebugLogger.getInstance()
}

/**
 * 启用调试模式
 */
export function enableDebug(): void {
  DebugLogger.getInstance().enable()
}

/**
 * 禁用调试模式
 */
export function disableDebug(): void {
  DebugLogger.getInstance().disable()
}
