/**
 * 类型守卫和验证器模块
 * Type guards and validators module
 *
 * 提供运行时类型检查和输入验证功能
 *
 * @module validators
 */

import type {
  BenchmarkStatus,
  BenchmarkPhase,
  BenchmarkOptions,
  BenchmarkResult,
  BenchmarkSuite,
  BenchmarkReport,
  BenchmarkThreshold,
  ProgressInfo,
  PercentileStats,
  MemoryStats,
} from './types'

// ============================================================================
// 基准测试状态类型守卫 / Benchmark Status Type Guards
// ============================================================================

/** 所有有效的基准测试状态 */
export const BENCHMARK_STATUSES = ['pending', 'running', 'success', 'failed', 'skipped', 'timeout'] as const

/** 所有有效的基准测试阶段 */
export const BENCHMARK_PHASES = ['warmup', 'running', 'complete'] as const

/**
 * 检查值是否为有效的基准测试状态
 * Check if value is a valid benchmark status
 *
 * @param value - 要检查的值
 * @returns 是否为有效状态
 *
 * @example
 * ```ts
 * isBenchmarkStatus('success') // true
 * isBenchmarkStatus('invalid') // false
 * ```
 */
export function isBenchmarkStatus(value: unknown): value is BenchmarkStatus {
  return typeof value === 'string' && BENCHMARK_STATUSES.includes(value as BenchmarkStatus)
}

/**
 * 检查值是否为有效的基准测试阶段
 * Check if value is a valid benchmark phase
 *
 * @param value - 要检查的值
 * @returns 是否为有效阶段
 */
export function isBenchmarkPhase(value: unknown): value is BenchmarkPhase {
  return typeof value === 'string' && BENCHMARK_PHASES.includes(value as BenchmarkPhase)
}

/**
 * 检查状态是否表示已完成（成功或失败）
 * Check if status indicates completion
 */
export function isCompletedStatus(status: BenchmarkStatus): boolean {
  return status === 'success' || status === 'failed' || status === 'skipped' || status === 'timeout'
}

/**
 * 检查状态是否表示失败
 * Check if status indicates failure
 */
export function isFailureStatus(status: BenchmarkStatus): boolean {
  return status === 'failed' || status === 'timeout'
}

// ============================================================================
// 基准测试结果类型守卫 / Benchmark Result Type Guards
// ============================================================================

/**
 * 检查对象是否为有效的百分位数统计
 * Check if object is valid percentile stats
 */
export function isPercentileStats(value: unknown): value is PercentileStats {
  if (!value || typeof value !== 'object') return false

  const stats = value as Record<string, unknown>
  return (
    typeof stats.p50 === 'number' &&
    typeof stats.p75 === 'number' &&
    typeof stats.p90 === 'number' &&
    typeof stats.p95 === 'number' &&
    typeof stats.p99 === 'number'
  )
}

/**
 * 检查对象是否为有效的内存统计
 * Check if object is valid memory stats
 */
export function isMemoryStats(value: unknown): value is MemoryStats {
  if (!value || typeof value !== 'object') return false

  const stats = value as Record<string, unknown>
  return (
    typeof stats.heapUsed === 'number' &&
    typeof stats.heapTotal === 'number' &&
    typeof stats.external === 'number' &&
    typeof stats.rss === 'number' &&
    typeof stats.delta === 'number'
  )
}

/**
 * 检查对象是否为有效的基准测试结果
 * Check if object is a valid benchmark result
 */
export function isBenchmarkResult(value: unknown): value is BenchmarkResult {
  if (!value || typeof value !== 'object') return false

  const result = value as Record<string, unknown>
  return (
    typeof result.name === 'string' &&
    typeof result.opsPerSecond === 'number' &&
    typeof result.avgTime === 'number' &&
    typeof result.minTime === 'number' &&
    typeof result.maxTime === 'number' &&
    typeof result.stdDev === 'number' &&
    typeof result.rme === 'number' &&
    typeof result.iterations === 'number' &&
    typeof result.totalTime === 'number'
  )
}

/**
 * 检查对象是否为有效的基准测试套件
 * Check if object is a valid benchmark suite
 */
export function isBenchmarkSuite(value: unknown): value is BenchmarkSuite {
  if (!value || typeof value !== 'object') return false

  const suite = value as Record<string, unknown>
  return (
    typeof suite.name === 'string' &&
    Array.isArray(suite.results) &&
    suite.results.every(isBenchmarkResult) &&
    typeof suite.duration === 'number' &&
    typeof suite.timestamp === 'number'
  )
}

/**
 * 检查对象是否为有效的进度信息
 * Check if object is valid progress info
 */
export function isProgressInfo(value: unknown): value is ProgressInfo {
  if (!value || typeof value !== 'object') return false

  const info = value as Record<string, unknown>
  return (
    typeof info.suite === 'string' &&
    typeof info.task === 'string' &&
    typeof info.current === 'number' &&
    typeof info.total === 'number' &&
    typeof info.percentage === 'number' &&
    isBenchmarkPhase(info.phase)
  )
}

// ============================================================================
// 基准测试选项验证 / Benchmark Options Validation
// ============================================================================

/**
 * 验证错误接口
 */
export interface ValidationError {
  /** 字段路径 */
  field: string
  /** 错误消息 */
  message: string
  /** 错误值 */
  value?: unknown
  /** 错误代码 */
  code?: string
}

/**
 * 验证结果接口
 */
export interface ValidationResult<T = unknown> {
  /** 是否有效 */
  valid: boolean
  /** 验证后的数据 */
  data?: T
  /** 错误列表 */
  errors: ValidationError[]
}

/**
 * 验证基准测试选项
 * Validate benchmark options
 *
 * @param options - 要验证的选项
 * @returns 验证结果
 */
export function validateBenchmarkOptions(
  options: unknown
): ValidationResult<Partial<BenchmarkOptions>> {
  const errors: ValidationError[] = []

  if (!options || typeof options !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'options', message: '选项必须是一个对象' }],
    }
  }

  const opts = options as Record<string, unknown>

  // 验证 name
  if (opts.name !== undefined && typeof opts.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'name 必须是字符串',
      value: opts.name,
    })
  }

  // 验证 warmup
  if (opts.warmup !== undefined) {
    if (typeof opts.warmup !== 'number' || opts.warmup < 0) {
      errors.push({
        field: 'warmup',
        message: 'warmup 必须是非负数',
        value: opts.warmup,
      })
    }
  }

  // 验证 time
  if (opts.time !== undefined) {
    if (typeof opts.time !== 'number' || opts.time <= 0) {
      errors.push({
        field: 'time',
        message: 'time 必须是正数',
        value: opts.time,
      })
    }
  }

  // 验证 iterations
  if (opts.iterations !== undefined) {
    if (typeof opts.iterations !== 'number' || opts.iterations <= 0 || !Number.isInteger(opts.iterations)) {
      errors.push({
        field: 'iterations',
        message: 'iterations 必须是正整数',
        value: opts.iterations,
      })
    }
  }

  // 验证 timeout
  if (opts.timeout !== undefined) {
    if (typeof opts.timeout !== 'number' || opts.timeout <= 0) {
      errors.push({
        field: 'timeout',
        message: 'timeout 必须是正数',
        value: opts.timeout,
      })
    }
  }

  // 验证 retries
  if (opts.retries !== undefined) {
    if (typeof opts.retries !== 'number' || opts.retries < 0 || !Number.isInteger(opts.retries)) {
      errors.push({
        field: 'retries',
        message: 'retries 必须是非负整数',
        value: opts.retries,
      })
    }
  }

  // 验证 concurrency
  if (opts.concurrency !== undefined && opts.concurrency !== null) {
    if (opts.concurrency !== 'bench' && opts.concurrency !== 'task') {
      errors.push({
        field: 'concurrency',
        message: 'concurrency 必须是 "bench"、"task" 或 null',
        value: opts.concurrency,
      })
    }
  }

  // 验证 tags
  if (opts.tags !== undefined) {
    if (!Array.isArray(opts.tags) || !opts.tags.every(tag => typeof tag === 'string')) {
      errors.push({
        field: 'tags',
        message: 'tags 必须是字符串数组',
        value: opts.tags,
      })
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (opts as Partial<BenchmarkOptions>) : undefined,
    errors,
  }
}

/**
 * 验证阈值配置
 * Validate threshold configuration
 */
export function validateThreshold(threshold: unknown): ValidationResult<BenchmarkThreshold> {
  const errors: ValidationError[] = []

  if (!threshold || typeof threshold !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'threshold', message: '阈值必须是一个对象' }],
    }
  }

  const t = threshold as Record<string, unknown>

  // 验证 maxAvgTime
  if (t.maxAvgTime !== undefined) {
    if (typeof t.maxAvgTime !== 'number' || t.maxAvgTime <= 0) {
      errors.push({
        field: 'maxAvgTime',
        message: 'maxAvgTime 必须是正数',
        value: t.maxAvgTime,
      })
    }
  }

  // 验证 minOpsPerSecond
  if (t.minOpsPerSecond !== undefined) {
    if (typeof t.minOpsPerSecond !== 'number' || t.minOpsPerSecond <= 0) {
      errors.push({
        field: 'minOpsPerSecond',
        message: 'minOpsPerSecond 必须是正数',
        value: t.minOpsPerSecond,
      })
    }
  }

  // 验证 maxRme
  if (t.maxRme !== undefined) {
    if (typeof t.maxRme !== 'number' || t.maxRme <= 0 || t.maxRme > 100) {
      errors.push({
        field: 'maxRme',
        message: 'maxRme 必须是 0-100 之间的正数',
        value: t.maxRme,
      })
    }
  }

  // 验证百分位数阈值
  const percentileFields = ['maxP95', 'maxP99'] as const
  for (const field of percentileFields) {
    if (t[field] !== undefined) {
      if (typeof t[field] !== 'number' || (t[field] as number) <= 0) {
        errors.push({
          field,
          message: `${field} 必须是正数`,
          value: t[field],
        })
      }
    }
  }

  // 验证 maxMemoryDelta
  if (t.maxMemoryDelta !== undefined) {
    if (typeof t.maxMemoryDelta !== 'number' || t.maxMemoryDelta < 0) {
      errors.push({
        field: 'maxMemoryDelta',
        message: 'maxMemoryDelta 必须是非负数',
        value: t.maxMemoryDelta,
      })
    }
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (t as BenchmarkThreshold) : undefined,
    errors,
  }
}

// ============================================================================
// 安全解析器 / Safe Parsers
// ============================================================================

/**
 * 安全解析 JSON
 * Safely parse JSON
 *
 * @param json - JSON 字符串
 * @returns 解析结果或 null
 */
export function safeParseJSON<T = unknown>(json: string): T | null {
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/**
 * 安全解析整数
 * Safely parse integer
 *
 * @param value - 要解析的值
 * @param defaultValue - 默认值
 * @returns 解析结果
 */
export function safeParseInt(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10)
    if (!isNaN(parsed)) {
      return parsed
    }
  }

  return defaultValue
}

/**
 * 安全解析浮点数
 * Safely parse float
 *
 * @param value - 要解析的值
 * @param defaultValue - 默认值
 * @returns 解析结果
 */
export function safeParseFloat(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) {
      return parsed
    }
  }

  return defaultValue
}

/**
 * 安全解析布尔值
 * Safely parse boolean
 *
 * @param value - 要解析的值
 * @param defaultValue - 默认值
 * @returns 解析结果
 */
export function safeParseBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim()
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false
    }
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return defaultValue
}

// ============================================================================
// 数值范围验证 / Numeric Range Validation
// ============================================================================

/**
 * 将值限制在指定范围内
 * Clamp value to specified range
 *
 * @param value - 要限制的值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 限制后的值
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 检查值是否在指定范围内
 * Check if value is within range
 *
 * @param value - 要检查的值
 * @param min - 最小值 (包含)
 * @param max - 最大值 (包含)
 * @returns 是否在范围内
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

// ============================================================================
// 路径验证 / Path Validation
// ============================================================================

/**
 * 检查路径是否安全（防止路径遍历攻击）
 * Check if path is safe (prevent path traversal attacks)
 *
 * @param inputPath - 要检查的路径
 * @param basePath - 基础路径
 * @returns 是否安全
 */
export function isSafePath(inputPath: string, basePath: string): boolean {
  // 规范化路径
  const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedInput = inputPath.replace(/\\/g, '/')

  // 检查是否包含路径遍历模式
  if (normalizedInput.includes('..') || normalizedInput.includes('//')) {
    return false
  }

  // 如果是相对路径，应该在基础路径下
  if (!normalizedInput.startsWith('/') && !normalizedInput.match(/^[a-zA-Z]:/)) {
    return true
  }

  // 如果是绝对路径，检查是否在基础路径下
  return normalizedInput.startsWith(normalizedBase)
}

/**
 * 清理文件名（移除不安全字符）
 * Sanitize filename (remove unsafe characters)
 *
 * @param filename - 要清理的文件名
 * @returns 清理后的文件名
 */
export function sanitizeFilename(filename: string): string {
  // 移除或替换不安全字符
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 255) // 限制长度
}

// ============================================================================
// 报告验证 / Report Validation
// ============================================================================

/**
 * 验证基准测试报告
 * Validate benchmark report
 */
export function validateBenchmarkReport(report: unknown): ValidationResult<BenchmarkReport> {
  const errors: ValidationError[] = []

  if (!report || typeof report !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'report', message: '报告必须是一个对象' }],
    }
  }

  const r = report as Record<string, unknown>

  // 验证 name
  if (typeof r.name !== 'string' || r.name.trim() === '') {
    errors.push({
      field: 'name',
      message: '报告名称必须是非空字符串',
      value: r.name,
    })
  }

  // 验证 suites
  if (!Array.isArray(r.suites)) {
    errors.push({
      field: 'suites',
      message: 'suites 必须是数组',
      value: r.suites,
    })
  } else {
    r.suites.forEach((suite, index) => {
      if (!isBenchmarkSuite(suite)) {
        errors.push({
          field: `suites[${index}]`,
          message: '无效的套件数据',
          value: suite,
        })
      }
    })
  }

  // 验证 generatedAt
  if (typeof r.generatedAt !== 'string') {
    errors.push({
      field: 'generatedAt',
      message: 'generatedAt 必须是字符串',
      value: r.generatedAt,
    })
  }

  // 验证 environment
  if (!r.environment || typeof r.environment !== 'object') {
    errors.push({
      field: 'environment',
      message: 'environment 必须是对象',
      value: r.environment,
    })
  }

  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? (r as unknown as BenchmarkReport) : undefined,
    errors,
  }
}

// ============================================================================
// 模式验证工厂 / Schema Validation Factory
// ============================================================================

/**
 * 字段验证器类型
 */
export type FieldValidator<T> = (value: unknown) => T | undefined

/**
 * 创建对象验证器
 * Create object validator
 *
 * @param schema - 验证模式
 * @returns 验证函数
 */
export function createObjectValidator<T extends Record<string, unknown>>(
  schema: Record<keyof T, FieldValidator<unknown>>
): (value: unknown) => ValidationResult<T> {
  return (value: unknown): ValidationResult<T> => {
    const errors: ValidationError[] = []

    if (!value || typeof value !== 'object') {
      return {
        valid: false,
        errors: [{ field: 'root', message: '值必须是对象' }],
      }
    }

    const obj = value as Record<string, unknown>
    const result: Partial<T> = {}

    for (const [key, validator] of Object.entries(schema) as Array<[keyof T, FieldValidator<unknown>]>) {
      const fieldValue = obj[key as string]
      const validated = validator(fieldValue)

      if (validated === undefined && fieldValue !== undefined) {
        errors.push({
          field: key as string,
          message: `字段 ${key as string} 验证失败`,
          value: fieldValue,
        })
      } else if (validated !== undefined) {
        result[key] = validated as T[keyof T]
      }
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? (result as T) : undefined,
      errors,
    }
  }
}

/**
 * 可选字段验证器
 * Optional field validator
 */
export function optional<T>(validator: FieldValidator<T>): FieldValidator<T | undefined> {
  return (value: unknown): T | undefined => {
    if (value === undefined || value === null) {
      return undefined
    }
    return validator(value)
  }
}

/**
 * 字符串验证器
 * String validator
 */
export function stringValidator(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * 数字验证器
 * Number validator
 */
export function numberValidator(value: unknown): number | undefined {
  return typeof value === 'number' && !isNaN(value) ? value : undefined
}

/**
 * 正数验证器
 * Positive number validator
 */
export function positiveNumberValidator(value: unknown): number | undefined {
  return typeof value === 'number' && !isNaN(value) && value > 0 ? value : undefined
}

/**
 * 布尔验证器
 * Boolean validator
 */
export function booleanValidator(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/**
 * 数组验证器
 * Array validator
 */
export function arrayValidator<T>(itemValidator: FieldValidator<T>): FieldValidator<T[]> {
  return (value: unknown): T[] | undefined => {
    if (!Array.isArray(value)) return undefined

    const result: T[] = []
    for (const item of value) {
      const validated = itemValidator(item)
      if (validated === undefined) return undefined
      result.push(validated)
    }
    return result
  }
}
