/**
 * 错误处理模块
 * 
 * 提供详细的错误上下文捕获和格式化
 */

/**
 * 错误上下文
 */
export interface ErrorContext {
  /** 任务名称 */
  taskName?: string
  /** 套件名称 */
  suiteName?: string
  /** 时间戳 */
  timestamp: number
  /** 堆栈跟踪 */
  stack?: string
  /** 额外的上下文信息 */
  metadata?: Record<string, unknown>
}

/**
 * 基准测试错误基类
 */
export class BenchmarkError extends Error {
  public readonly context: ErrorContext

  constructor(
    message: string,
    public readonly code: string,
    context?: Partial<ErrorContext>,
  ) {
    super(message)
    this.name = 'BenchmarkError'
    this.context = {
      timestamp: Date.now(),
      ...context,
      stack: this.stack,
    }

    // 保持正确的原型链
    Object.setPrototypeOf(this, BenchmarkError.prototype)
  }

  /**
   * 格式化错误输出
   */
  format(): string {
    const lines: string[] = []

    lines.push(`❌ ${this.name}: ${this.message}`)
    lines.push(`   Code: ${this.code}`)

    if (this.context.suiteName) {
      lines.push(`   Suite: ${this.context.suiteName}`)
    }

    if (this.context.taskName) {
      lines.push(`   Task: ${this.context.taskName}`)
    }

    lines.push(`   Time: ${new Date(this.context.timestamp).toISOString()}`)

    if (this.context.metadata && Object.keys(this.context.metadata).length > 0) {
      lines.push(`   Metadata:`)
      for (const [key, value] of Object.entries(this.context.metadata)) {
        lines.push(`     ${key}: ${JSON.stringify(value)}`)
      }
    }

    if (this.context.stack) {
      lines.push(`\n   Stack Trace:`)
      const stackLines = this.context.stack.split('\n').slice(1) // 跳过第一行（错误消息）
      stackLines.forEach(line => {
        lines.push(`   ${line}`)
      })
    }

    return lines.join('\n')
  }

  /**
   * 转换为 JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    }
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends BenchmarkError {
  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message, 'CONFIG_ERROR', context)
    this.name = 'ConfigurationError'
    Object.setPrototypeOf(this, ConfigurationError.prototype)
  }
}

/**
 * 执行错误
 */
export class ExecutionError extends BenchmarkError {
  constructor(
    message: string,
    taskName: string,
    suiteName: string,
    context?: Partial<ErrorContext>,
  ) {
    super(message, 'EXECUTION_ERROR', {
      ...context,
      taskName,
      suiteName,
    })
    this.name = 'ExecutionError'
    Object.setPrototypeOf(this, ExecutionError.prototype)
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends BenchmarkError {
  constructor(
    message: string,
    public readonly taskName: string,
    public readonly timeout: number,
    public readonly partialResults?: unknown,
    context?: Partial<ErrorContext>,
  ) {
    super(message, 'TIMEOUT_ERROR', {
      ...context,
      taskName,
      metadata: {
        timeout,
        hasPartialResults: !!partialResults,
        ...(context?.metadata || {}),
      },
    })
    this.name = 'TimeoutError'
    Object.setPrototypeOf(this, TimeoutError.prototype)
  }
}

/**
 * 存储错误
 */
export class StorageError extends BenchmarkError {
  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message, 'STORAGE_ERROR', context)
    this.name = 'StorageError'
    Object.setPrototypeOf(this, StorageError.prototype)
  }
}

/**
 * 验证错误
 */
export class ValidationError extends BenchmarkError {
  constructor(message: string, context?: Partial<ErrorContext>) {
    super(message, 'VALIDATION_ERROR', context)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * 格式化任意错误
 */
export function formatError(error: unknown, context?: Partial<ErrorContext>): string {
  if (error instanceof BenchmarkError) {
    return error.format()
  }

  if (error instanceof Error) {
    const lines: string[] = []
    lines.push(`❌ ${error.name}: ${error.message}`)

    if (context?.suiteName) {
      lines.push(`   Suite: ${context.suiteName}`)
    }

    if (context?.taskName) {
      lines.push(`   Task: ${context.taskName}`)
    }

    if (error.stack) {
      lines.push(`\n   Stack Trace:`)
      const stackLines = error.stack.split('\n').slice(1)
      stackLines.forEach(line => {
        lines.push(`   ${line}`)
      })
    }

    return lines.join('\n')
  }

  return `❌ Unknown Error: ${String(error)}`
}

/**
 * 捕获并包装错误
 */
export function captureError(
  error: unknown,
  taskName?: string,
  suiteName?: string,
): BenchmarkError {
  if (error instanceof BenchmarkError) {
    return error
  }

  if (error instanceof Error) {
    return new ExecutionError(
      error.message,
      taskName || 'unknown',
      suiteName || 'unknown',
      {
        metadata: {
          originalError: error.name,
        },
        stack: error.stack,
      },
    )
  }

  return new ExecutionError(
    String(error),
    taskName || 'unknown',
    suiteName || 'unknown',
  )
}
