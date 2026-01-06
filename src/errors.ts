/**
 * 错误处理模块
 * Error handling module
 *
 * 提供详细的错误上下文捕获、格式化和恢复建议。
 * 所有错误类都继承自 BenchmarkError 基类，提供统一的错误处理接口。
 *
 * @module errors
 */

// ============================================================================
// 错误代码常量 / Error Code Constants
// ============================================================================

/**
 * 错误代码枚举
 */
export const ErrorCodes = {
  // 配置错误
  CONFIG_ERROR: 'CONFIG_ERROR',
  CONFIG_PARSE_ERROR: 'CONFIG_PARSE_ERROR',
  CONFIG_VALIDATION_ERROR: 'CONFIG_VALIDATION_ERROR',

  // 执行错误
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  TASK_FAILED: 'TASK_FAILED',
  SUITE_FAILED: 'SUITE_FAILED',

  // 超时错误
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  TIMEOUT_TASK: 'TIMEOUT_TASK',
  TIMEOUT_SUITE: 'TIMEOUT_SUITE',

  // 存储错误
  STORAGE_ERROR: 'STORAGE_ERROR',
  STORAGE_READ_ERROR: 'STORAGE_READ_ERROR',
  STORAGE_WRITE_ERROR: 'STORAGE_WRITE_ERROR',
  STORAGE_CONNECTION_ERROR: 'STORAGE_CONNECTION_ERROR',

  // 验证错误
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  INVALID_THRESHOLD: 'INVALID_THRESHOLD',

  // 插件错误
  PLUGIN_ERROR: 'PLUGIN_ERROR',
  PLUGIN_INSTALL_ERROR: 'PLUGIN_INSTALL_ERROR',
  PLUGIN_EXECUTE_ERROR: 'PLUGIN_EXECUTE_ERROR',

  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_REFUSED: 'NETWORK_CONNECTION_REFUSED',

  // 未知错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

// ============================================================================
// 错误上下文接口 / Error Context Interface
// ============================================================================

/**
 * 错误上下文接口
 * Error context interface
 *
 * 提供详细的错误上下文信息，帮助调试和问题诊断。
 */
export interface ErrorContext {
  /** 任务名称 */
  readonly taskName?: string
  /** 套件名称 */
  readonly suiteName?: string
  /** 时间戳 */
  readonly timestamp: number
  /** 堆栈跟踪 */
  readonly stack?: string
  /** 额外的上下文信息 */
  readonly metadata?: Readonly<Record<string, unknown>>
  /** 恢复建议 */
  readonly suggestions?: readonly string[]
  /** 相关文档链接 */
  readonly docLink?: string
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
 * Validation error
 */
export class ValidationError extends BenchmarkError {
  /** 验证失败的字段列表 */
  public readonly fields?: readonly string[]

  constructor(
    message: string,
    fields?: string[],
    context?: Partial<ErrorContext>,
  ) {
    super(message, 'VALIDATION_ERROR', {
      ...context,
      suggestions: [
        '检查配置文件格式是否正确',
        '确保所有必填字段已提供',
        '使用 ldbench config-validate 命令验证配置',
        ...(context?.suggestions || []),
      ],
    })
    this.name = 'ValidationError'
    this.fields = fields
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * 网络错误
 * Network error
 */
export class NetworkError extends BenchmarkError {
  /** HTTP 状态码 */
  public readonly statusCode?: number
  /** 请求 URL */
  public readonly url?: string

  constructor(
    message: string,
    options?: {
      statusCode?: number
      url?: string
      context?: Partial<ErrorContext>
    },
  ) {
    super(message, 'NETWORK_ERROR', {
      ...options?.context,
      metadata: {
        statusCode: options?.statusCode,
        url: options?.url,
        ...(options?.context?.metadata || {}),
      },
      suggestions: [
        '检查网络连接是否正常',
        '确认目标服务是否可访问',
        '检查防火墙或代理设置',
        ...(options?.context?.suggestions || []),
      ],
    })
    this.name = 'NetworkError'
    this.statusCode = options?.statusCode
    this.url = options?.url
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}

/**
 * 插件错误
 * Plugin error
 */
export class PluginError extends BenchmarkError {
  /** 插件名称 */
  public readonly pluginName: string
  /** 原始错误 */
  public readonly originalError?: Error

  constructor(
    message: string,
    pluginName: string,
    originalError?: Error,
    context?: Partial<ErrorContext>,
  ) {
    super(message, 'PLUGIN_ERROR', {
      ...context,
      metadata: {
        pluginName,
        originalErrorName: originalError?.name,
        originalErrorMessage: originalError?.message,
        ...(context?.metadata || {}),
      },
      suggestions: [
        `检查插件 "${pluginName}" 的配置是否正确`,
        '确保插件版本与框架兼容',
        '尝试卸载并重新安装插件',
        ...(context?.suggestions || []),
      ],
    })
    this.name = 'PluginError'
    this.pluginName = pluginName
    this.originalError = originalError
    Object.setPrototypeOf(this, PluginError.prototype)
  }
}

// ============================================================================
// 错误工厂函数 / Error Factory Functions
// ============================================================================

/**
 * 创建带恢复建议的配置错误
 * Create configuration error with recovery suggestions
 */
export function createConfigError(
  message: string,
  suggestions?: string[],
): ConfigurationError {
  return new ConfigurationError(message, {
    suggestions: [
      '检查配置文件语法是否正确',
      '确保配置文件路径正确',
      ...(suggestions || []),
    ],
  })
}

/**
 * 创建带恢复建议的超时错误
 * Create timeout error with recovery suggestions
 */
export function createTimeoutError(
  taskName: string,
  timeout: number,
  partialResults?: unknown,
): TimeoutError {
  return new TimeoutError(
    `任务 "${taskName}" 执行超时 (超过 ${timeout}ms)`,
    taskName,
    timeout,
    partialResults,
    {
      suggestions: [
        `增加超时时间（当前: ${timeout}ms）`,
        '优化任务执行效率',
        '检查是否有无限循环或死锁',
        '减少迭代次数',
      ],
    },
  )
}

/**
 * 格式化任意错误
 * Format any error
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
 * Capture and wrap any error into BenchmarkError
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

// ============================================================================
// 类型守卫 / Type Guards
// ============================================================================

/**
 * 检查是否为 BenchmarkError
 * Check if error is BenchmarkError
 */
export function isBenchmarkError(error: unknown): error is BenchmarkError {
  return error instanceof BenchmarkError
}

/**
 * 检查是否为特定类型的错误
 * Check if error is a specific error type
 */
export function isErrorOfType<T extends BenchmarkError>(
  error: unknown,
  ErrorClass: new (...args: never[]) => T,
): error is T {
  return error instanceof ErrorClass
}

/**
 * 检查是否为可重试的错误
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof BenchmarkError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (error.context as any).retryable === true
  }
  // 网络错误和超时错误通常可以重试
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return true
  }
  return false
}

/**
 * 检查是否为致命错误（不应继续执行）
 * Check if error is fatal
 */
export function isFatalError(error: unknown): boolean {
  if (error instanceof ConfigurationError) {
    return true
  }
  if (error instanceof ValidationError) {
    return true
  }
  return false
}

// ============================================================================
// 错误边界 / Error Boundary
// ============================================================================

/**
 * 错误边界结果类型
 * Error boundary result type
 */
export type ErrorBoundaryResult<T> =
  | { success: true; value: T; error?: never }
  | { success: false; value?: never; error: BenchmarkError }

/**
 * 安全执行函数，捕获所有错误
 * Execute function safely, catching all errors
 */
export async function tryCatch<T>(
  fn: () => T | Promise<T>,
  context?: { taskName?: string; suiteName?: string },
): Promise<ErrorBoundaryResult<T>> {
  try {
    const result = await fn()
    return { success: true, value: result }
  } catch (error) {
    return {
      success: false,
      error: captureError(error, context?.taskName, context?.suiteName),
    }
  }
}

/**
 * 同步版本的安全执行
 * Synchronous version of tryCatch
 */
export function tryCatchSync<T>(
  fn: () => T,
  context?: { taskName?: string; suiteName?: string },
): ErrorBoundaryResult<T> {
  try {
    const result = fn()
    return { success: true, value: result }
  } catch (error) {
    return {
      success: false,
      error: captureError(error, context?.taskName, context?.suiteName),
    }
  }
}

/**
 * 包装函数，使其返回 ErrorBoundaryResult
 * Wrap function to return ErrorBoundaryResult
 */
export function withErrorBoundary<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn | Promise<TReturn>,
  context?: { taskName?: string; suiteName?: string },
): (...args: TArgs) => Promise<ErrorBoundaryResult<TReturn>> {
  return async (...args: TArgs) => {
    return tryCatch(() => fn(...args), context)
  }
}
