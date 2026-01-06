/**
 * 共享工具函数模块
 * Shared utility functions for the benchmark framework
 *
 * @module utils
 */

// ============================================================================
// 数值格式化工具 / Number Formatting Utilities
// ============================================================================

/**
 * 格式化字节大小为人类可读格式
 * Format bytes to human readable format
 *
 * @param bytes - 字节数
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 *
 * @example
 * ```ts
 * formatBytes(1024) // '1.00 KB'
 * formatBytes(1536, { precision: 1 }) // '1.5 KB'
 * formatBytes(-1024, { showSign: true }) // '-1.00 KB'
 * ```
 */
export function formatBytes(
  bytes: number,
  options: {
    /** 小数精度 */
    precision?: number
    /** 是否显示正负号 */
    showSign?: boolean
    /** 使用的单位系统 ('binary' = 1024, 'decimal' = 1000) */
    system?: 'binary' | 'decimal'
  } = {}
): string {
  const { precision = 2, showSign = false, system = 'binary' } = options
  const base = system === 'binary' ? 1024 : 1000
  const units = system === 'binary'
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    : ['B', 'KB', 'MB', 'GB', 'TB']

  const sign = showSign && bytes >= 0 ? '+' : ''
  const abs = Math.abs(bytes)

  if (abs < base) {
    return `${sign}${bytes} ${units[0]}`
  }

  let unitIndex = 0
  let size = abs

  while (size >= base && unitIndex < units.length - 1) {
    size /= base
    unitIndex++
  }

  const value = bytes < 0 ? -size : size
  return `${sign}${value.toFixed(precision)} ${units[unitIndex]}`
}

/**
 * 格式化操作数/秒为人类可读格式
 * Format operations per second to human readable format
 *
 * @param ops - 每秒操作数
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 *
 * @example
 * ```ts
 * formatOps(1500) // '1.50K'
 * formatOps(2500000) // '2.50M'
 * formatOps(500, { suffix: ' ops/s' }) // '500.00 ops/s'
 * ```
 */
export function formatOps(
  ops: number,
  options: {
    /** 小数精度 */
    precision?: number
    /** 后缀文本 */
    suffix?: string
  } = {}
): string {
  const { precision = 2, suffix = '' } = options

  if (ops >= 1_000_000_000) {
    return `${(ops / 1_000_000_000).toFixed(precision)}G${suffix}`
  }
  if (ops >= 1_000_000) {
    return `${(ops / 1_000_000).toFixed(precision)}M${suffix}`
  }
  if (ops >= 1_000) {
    return `${(ops / 1_000).toFixed(precision)}K${suffix}`
  }
  return `${ops.toFixed(precision)}${suffix}`
}

/**
 * 格式化时间为人类可读格式
 * Format time to human readable format
 *
 * @param ms - 毫秒数
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 *
 * @example
 * ```ts
 * formatTime(0.0005) // '500.00ns'
 * formatTime(0.5) // '500.00μs'
 * formatTime(1500) // '1.50s'
 * ```
 */
export function formatTime(
  ms: number,
  options: {
    /** 小数精度 */
    precision?: number
    /** 是否使用长格式单位 */
    longFormat?: boolean
  } = {}
): string {
  const { precision = 2, longFormat = false } = options

  const units = longFormat
    ? { ns: 'nanoseconds', us: 'microseconds', ms: 'milliseconds', s: 'seconds', m: 'minutes' }
    : { ns: 'ns', us: 'μs', ms: 'ms', s: 's', m: 'm' }

  if (ms < 0.000001) {
    return `${(ms * 1_000_000_000).toFixed(precision)}${units.ns}`
  }
  if (ms < 0.001) {
    return `${(ms * 1_000_000).toFixed(precision)}${units.us}`
  }
  if (ms < 1) {
    return `${(ms * 1000).toFixed(precision)}${units.us}`
  }
  if (ms < 1000) {
    return `${ms.toFixed(precision)}${units.ms}`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(precision)}${units.s}`
  }
  return `${(ms / 60000).toFixed(precision)}${units.m}`
}

/**
 * 格式化百分比
 * Format percentage
 *
 * @param value - 百分比值 (0-100)
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 */
export function formatPercentage(
  value: number,
  options: {
    precision?: number
    showSign?: boolean
  } = {}
): string {
  const { precision = 2, showSign = false } = options
  const sign = showSign && value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(precision)}%`
}

// ============================================================================
// 统计工具 / Statistical Utilities
// ============================================================================

/**
 * 使用 QuickSelect 算法计算百分位数 (O(n) 平均时间复杂度)
 * Calculate percentile using QuickSelect algorithm (O(n) average time complexity)
 *
 * @param values - 数值数组
 * @param percentile - 百分位数 (0-100)
 * @returns 百分位数值
 *
 * @example
 * ```ts
 * calculatePercentile([1, 2, 3, 4, 5], 50) // 3 (median)
 * calculatePercentile([1, 2, 3, 4, 5], 90) // 5
 * ```
 */
export function calculatePercentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0]
  if (percentile <= 0) return Math.min(...values)
  if (percentile >= 100) return Math.max(...values)

  // 对于小数组，直接排序更高效
  if (values.length <= 10) {
    const sorted = [...values].sort((a, b) => a - b)
    return calculatePercentileFromSorted(sorted, percentile)
  }

  // 使用 QuickSelect 算法
  const arr = [...values]
  const index = (percentile / 100) * (arr.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return quickSelect(arr, lower)
  }

  const lowerValue = quickSelect(arr, lower)
  const upperValue = quickSelect(arr, upper)

  return lowerValue * (upper - index) + upperValue * (index - lower)
}

/**
 * 从已排序数组计算百分位数
 * Calculate percentile from sorted array
 *
 * @internal
 */
export function calculatePercentileFromSorted(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0

  const index = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) return sorted[lower]

  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower)
}

/**
 * QuickSelect 算法实现
 * QuickSelect algorithm implementation
 *
 * @internal
 */
function quickSelect(arr: number[], k: number): number {
  if (arr.length === 1) return arr[0]

  const pivot = arr[Math.floor(Math.random() * arr.length)]
  const lower: number[] = []
  const equal: number[] = []
  const higher: number[] = []

  for (const num of arr) {
    if (num < pivot) lower.push(num)
    else if (num > pivot) higher.push(num)
    else equal.push(num)
  }

  if (k < lower.length) {
    return quickSelect(lower, k)
  } else if (k < lower.length + equal.length) {
    return equal[0]
  } else {
    return quickSelect(higher, k - lower.length - equal.length)
  }
}

/**
 * 计算所有常用百分位数
 * Calculate all common percentiles
 *
 * @param values - 数值数组
 * @returns 百分位数对象
 */
export function calculateAllPercentiles(values: readonly number[]): {
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
} {
  if (values.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 }
  }

  // 对于计算多个百分位数，排序一次更高效
  const sorted = [...values].sort((a, b) => a - b)

  return {
    p50: calculatePercentileFromSorted(sorted, 50),
    p75: calculatePercentileFromSorted(sorted, 75),
    p90: calculatePercentileFromSorted(sorted, 90),
    p95: calculatePercentileFromSorted(sorted, 95),
    p99: calculatePercentileFromSorted(sorted, 99),
  }
}

/**
 * 计算数组的基本统计信息
 * Calculate basic statistics for an array
 *
 * @param values - 数值数组
 * @returns 统计信息对象
 */
export function calculateStats(values: readonly number[]): {
  mean: number
  min: number
  max: number
  stdDev: number
  variance: number
  sum: number
  count: number
} {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0, variance: 0, sum: 0, count: 0 }
  }

  let sum = 0
  let min = Infinity
  let max = -Infinity

  for (const value of values) {
    sum += value
    if (value < min) min = value
    if (value > max) max = value
  }

  const mean = sum / values.length

  let squaredDiffSum = 0
  for (const value of values) {
    const diff = value - mean
    squaredDiffSum += diff * diff
  }

  const variance = squaredDiffSum / values.length
  const stdDev = Math.sqrt(variance)

  return { mean, min, max, stdDev, variance, sum, count: values.length }
}

/**
 * 计算相对误差 (RME)
 * Calculate Relative Margin of Error
 *
 * @param stdDev - 标准差
 * @param mean - 平均值
 * @param sampleSize - 样本大小
 * @param confidenceLevel - 置信水平 (默认 95%)
 * @returns RME 百分比
 */
export function calculateRME(
  stdDev: number,
  mean: number,
  sampleSize: number,
  confidenceLevel: number = 0.95
): number {
  if (mean === 0 || sampleSize === 0) return 0

  // t 分布临界值 (近似值，用于 95% 置信水平)
  const tValue = confidenceLevel === 0.95 ? 1.96 : 2.576 // 95% 和 99%
  const standardError = stdDev / Math.sqrt(sampleSize)
  const marginOfError = tValue * standardError

  return (marginOfError / Math.abs(mean)) * 100
}

// ============================================================================
// 数组工具 / Array Utilities
// ============================================================================

/**
 * 将数组分块
 * Split array into chunks
 *
 * @param array - 输入数组
 * @param size - 每块大小
 * @returns 分块后的数组
 */
export function chunk<T>(array: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('Chunk size must be positive')

  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size) as T[])
  }
  return chunks
}

/**
 * 创建延迟 Promise
 * Create a delay promise
 *
 * @param ms - 延迟毫秒数
 * @returns Promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 重试函数执行
 * Retry function execution with exponential backoff
 *
 * @param fn - 要执行的函数
 * @param options - 重试选项
 * @returns 函数结果
 */
export async function retry<T>(
  fn: () => T | Promise<T>,
  options: {
    /** 最大重试次数 */
    maxRetries?: number
    /** 初始延迟 (毫秒) */
    initialDelay?: number
    /** 最大延迟 (毫秒) */
    maxDelay?: number
    /** 延迟乘数 */
    multiplier?: number
    /** 重试条件函数 */
    shouldRetry?: (error: Error, attempt: number) => boolean
    /** 重试回调 */
    onRetry?: (error: Error, attempt: number) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 10000,
    multiplier = 2,
    shouldRetry = () => true,
    onRetry,
  } = options

  let lastError: Error | undefined
  let currentDelay = initialDelay

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt >= maxRetries || !shouldRetry(lastError, attempt)) {
        throw lastError
      }

      onRetry?.(lastError, attempt)

      await delay(currentDelay)
      currentDelay = Math.min(currentDelay * multiplier, maxDelay)
    }
  }

  throw lastError
}

// ============================================================================
// 对象工具 / Object Utilities
// ============================================================================

/**
 * 深度合并对象
 * Deep merge objects
 *
 * @param target - 目标对象
 * @param sources - 源对象数组
 * @returns 合并后的对象
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Array<Partial<T>>
): T {
  const result = { ...target } as T

  for (const source of sources) {
    if (!source) continue

    for (const key of Object.keys(source) as Array<keyof T>) {
      const sourceValue = source[key]
      const targetValue = result[key]

      if (sourceValue === undefined) continue

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[keyof T]
      } else {
        result[key] = sourceValue as T[keyof T]
      }
    }
  }

  return result
}

/**
 * 深度冻结对象
 * Deep freeze object
 *
 * @param obj - 要冻结的对象
 * @returns 冻结后的对象
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  const propNames = Object.getOwnPropertyNames(obj)

  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name]
    if (value && typeof value === 'object') {
      deepFreeze(value)
    }
  }

  return Object.freeze(obj)
}

// ============================================================================
// 验证工具 / Validation Utilities
// ============================================================================

/**
 * 检查值是否为正数
 * Check if value is positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value > 0
}

/**
 * 检查值是否为非负数
 * Check if value is non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= 0
}

/**
 * 检查值是否为有效的百分比 (0-100)
 * Check if value is valid percentage (0-100)
 */
export function isValidPercentage(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= 0 && value <= 100
}

/**
 * 检查值是否为非空字符串
 * Check if value is non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * 断言条件为真
 * Assert condition is true
 *
 * @param condition - 条件
 * @param message - 错误消息
 * @throws 如果条件为假
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

/**
 * 断言值不为 null 或 undefined
 * Assert value is not null or undefined
 *
 * @param value - 值
 * @param message - 错误消息
 * @returns 非空值
 */
export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

// ============================================================================
// 日期时间工具 / DateTime Utilities
// ============================================================================

/**
 * 获取 ISO 格式的当前时间
 * Get current time in ISO format
 */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * 获取文件安全的时间戳字符串
 * Get file-safe timestamp string
 */
export function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * 格式化持续时间
 * Format duration
 *
 * @param ms - 毫秒数
 * @returns 格式化后的字符串
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`
  return `${(ms / 3600000).toFixed(2)}h`
}

// ============================================================================
// 随机工具 / Random Utilities
// ============================================================================

/**
 * 生成随机 ID
 * Generate random ID
 *
 * @param length - ID 长度
 * @returns 随机 ID 字符串
 */
export function randomId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

// ============================================================================
// 类型相关工具 / Type Utilities
// ============================================================================

/**
 * 检查对象是否为 Promise
 * Check if object is a Promise
 */
export function isPromise<T>(obj: unknown): obj is Promise<T> {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof (obj as Promise<T>).then === 'function'
  )
}

/**
 * 将值包装为数组
 * Wrap value as array
 */
export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

/**
 * 获取对象的类型名称
 * Get type name of object
 */
export function getTypeName(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value
}
