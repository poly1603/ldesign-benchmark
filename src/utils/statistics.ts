/**
 * 统计工具模块
 *
 * 提供高性能的统计计算工具，包括：
 * - Welford 增量算法计算均值和标准差
 * - 高效百分位数计算
 * - LRU 缓存
 * - 扩展统计指标
 *
 * @module utils/statistics
 */

import type { PercentileStats, ExtendedStats } from '../types/benchmark'

// ============================================================================
// Welford 增量算法
// ============================================================================

/**
 * Welford 增量统计计算器
 *
 * 使用 Welford 算法进行单遍历计算均值和标准差，
 * 具有更好的数值稳定性和内存效率。
 *
 * @example
 * ```ts
 * const welford = new WelfordStats()
 * welford.add(10)
 * welford.add(20)
 * welford.add(30)
 * console.log(welford.mean)     // 20
 * console.log(welford.stdDev)   // 8.165...
 * ```
 */
export class WelfordStats {
  private _count: number = 0
  private _mean: number = 0
  private _m2: number = 0 // Sum of squared deviations
  private _min: number = Infinity
  private _max: number = -Infinity
  private _sum: number = 0

  /**
   * 添加一个数据点
   *
   * @param value - 要添加的值
   */
  add(value: number): void {
    this._count++
    this._sum += value

    const delta = value - this._mean
    this._mean += delta / this._count
    const delta2 = value - this._mean
    this._m2 += delta * delta2

    if (value < this._min) this._min = value
    if (value > this._max) this._max = value
  }

  /**
   * 批量添加数据点
   *
   * @param values - 值数组
   */
  addBatch(values: number[]): void {
    for (const value of values) {
      this.add(value)
    }
  }

  /**
   * 合并另一个 WelfordStats 实例
   * 使用 Chan's 并行算法
   *
   * @param other - 另一个 WelfordStats 实例
   */
  merge(other: WelfordStats): void {
    if (other._count === 0) return

    const totalCount = this._count + other._count
    const delta = other._mean - this._mean

    this._mean = (this._count * this._mean + other._count * other._mean) / totalCount
    this._m2 = this._m2 + other._m2 + delta * delta * this._count * other._count / totalCount
    this._sum += other._sum

    if (other._min < this._min) this._min = other._min
    if (other._max > this._max) this._max = other._max

    this._count = totalCount
  }

  /**
   * 重置统计数据
   */
  reset(): void {
    this._count = 0
    this._mean = 0
    this._m2 = 0
    this._min = Infinity
    this._max = -Infinity
    this._sum = 0
  }

  /** 样本数量 */
  get count(): number {
    return this._count
  }

  /** 均值 */
  get mean(): number {
    return this._count > 0 ? this._mean : 0
  }

  /** 总和 */
  get sum(): number {
    return this._sum
  }

  /** 最小值 */
  get min(): number {
    return this._count > 0 ? this._min : 0
  }

  /** 最大值 */
  get max(): number {
    return this._count > 0 ? this._max : 0
  }

  /** 样本方差 */
  get variance(): number {
    return this._count > 1 ? this._m2 / (this._count - 1) : 0
  }

  /** 总体方差 */
  get populationVariance(): number {
    return this._count > 0 ? this._m2 / this._count : 0
  }

  /** 样本标准差 */
  get stdDev(): number {
    return Math.sqrt(this.variance)
  }

  /** 总体标准差 */
  get populationStdDev(): number {
    return Math.sqrt(this.populationVariance)
  }

  /** 相对误差百分比 (RME) */
  get rme(): number {
    if (this._count === 0 || this._mean === 0) return 0
    const sem = this.stdDev / Math.sqrt(this._count)
    return (sem / Math.abs(this._mean)) * 100
  }

  /** 变异系数 (CV) */
  get cv(): number {
    return this._mean !== 0 ? (this.stdDev / Math.abs(this._mean)) * 100 : 0
  }

  /**
   * 获取汇总统计
   */
  getSummary(): {
    count: number
    mean: number
    stdDev: number
    variance: number
    min: number
    max: number
    rme: number
    cv: number
  } {
    return {
      count: this._count,
      mean: this.mean,
      stdDev: this.stdDev,
      variance: this.variance,
      min: this.min,
      max: this.max,
      rme: this.rme,
      cv: this.cv,
    }
  }
}

// ============================================================================
// 百分位数计算
// ============================================================================

/**
 * 计算单个百分位数
 *
 * @param sortedValues - 已排序的值数组
 * @param percentile - 百分位数 (0-100)
 * @returns 百分位数值
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0
  if (percentile <= 0) return sortedValues[0]
  if (percentile >= 100) return sortedValues[sortedValues.length - 1]

  const index = (percentile / 100) * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) return sortedValues[lower]

  // 线性插值
  const fraction = index - lower
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction
}

/**
 * 计算所有标准百分位数
 *
 * @param values - 数据数组（无需预排序）
 * @returns 百分位数统计对象
 */
export function calculatePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)

  return {
    p50: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  }
}

/**
 * 计算自定义百分位数
 *
 * @param values - 数据数组
 * @param percentiles - 要计算的百分位数数组
 * @returns 百分位数值映射
 */
export function calculateCustomPercentiles(
  values: number[],
  percentiles: number[],
): Map<number, number> {
  const result = new Map<number, number>()

  if (values.length === 0) {
    for (const p of percentiles) {
      result.set(p, 0)
    }
    return result
  }

  const sorted = [...values].sort((a, b) => a - b)

  for (const p of percentiles) {
    result.set(p, calculatePercentile(sorted, p))
  }

  return result
}

// ============================================================================
// 扩展统计
// ============================================================================

/**
 * 计算扩展统计信息
 *
 * @param values - 数据数组
 * @param mean - 均值（可选，不传则计算）
 * @param stdDev - 标准差（可选，不传则计算）
 * @returns 扩展统计对象
 */
export function calculateExtendedStats(
  values: number[],
  mean?: number,
  stdDev?: number,
): ExtendedStats {
  if (values.length === 0) {
    return { variance: 0, cv: 0, iqr: 0, skewness: 0, kurtosis: 0 }
  }

  // 如果没提供，计算均值和标准差
  if (mean === undefined || stdDev === undefined) {
    const welford = new WelfordStats()
    welford.addBatch(values)
    mean = welford.mean
    stdDev = welford.stdDev
  }

  const variance = stdDev * stdDev
  const cv = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0

  // 计算 IQR
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = calculatePercentile(sorted, 25)
  const q3 = calculatePercentile(sorted, 75)
  const iqr = q3 - q1

  // 计算偏度和峰度
  let skewness = 0
  let kurtosis = 0

  if (stdDev > 0 && values.length > 2) {
    let m3 = 0
    let m4 = 0

    for (const value of values) {
      const diff = value - mean
      const diffSquared = diff * diff
      m3 += diff * diffSquared
      m4 += diffSquared * diffSquared
    }

    const n = values.length
    m3 /= n
    m4 /= n

    const stdDev3 = stdDev * stdDev * stdDev
    const stdDev4 = variance * variance

    // 样本偏度（Fisher 校正）
    skewness = (n * n * m3) / ((n - 1) * (n - 2) * stdDev3)

    // 样本峰度（Fisher 校正，超额峰度）
    if (n > 3) {
      const term1 = (n * (n + 1) * m4) / ((n - 1) * (n - 2) * (n - 3) * stdDev4)
      const term2 = (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
      kurtosis = term1 - term2
    }
  }

  return { variance, cv, iqr, skewness, kurtosis }
}

// ============================================================================
// LRU 缓存
// ============================================================================

/**
 * LRU 缓存实现
 *
 * @typeParam K - 键类型
 * @typeParam V - 值类型
 *
 * @example
 * ```ts
 * const cache = new LRUCache<string, number>(100)
 * cache.set('key1', 42)
 * console.log(cache.get('key1')) // 42
 * ```
 */
export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map()
  private readonly maxSize: number

  /**
   * 创建 LRU 缓存
   *
   * @param maxSize - 最大缓存项数
   */
  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  /**
   * 获取缓存值
   *
   * @param key - 缓存键
   * @returns 缓存值或 undefined
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined
    }

    // 移动到最前面（最近使用）
    const value = this.cache.get(key)!
    this.cache.delete(key)
    this.cache.set(key, value)

    return value
  }

  /**
   * 设置缓存值
   *
   * @param key - 缓存键
   * @param value - 缓存值
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的项（第一项）
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, value)
  }

  /**
   * 检查是否存在
   *
   * @param key - 缓存键
   * @returns 是否存在
   */
  has(key: K): boolean {
    return this.cache.has(key)
  }

  /**
   * 删除缓存项
   *
   * @param key - 缓存键
   * @returns 是否删除成功
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /** 当前缓存大小 */
  get size(): number {
    return this.cache.size
  }

  /**
   * 获取或计算缓存值
   *
   * @param key - 缓存键
   * @param compute - 计算函数
   * @returns 缓存值或计算结果
   */
  getOrCompute(key: K, compute: () => V): V {
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    const value = compute()
    this.set(key, value)
    return value
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 计算操作数/秒
 *
 * @param avgTimeMs - 平均执行时间（毫秒）
 * @returns 每秒操作数
 */
export function calculateOpsPerSecond(avgTimeMs: number): number {
  if (avgTimeMs <= 0) return 0
  return 1000 / avgTimeMs
}

/**
 * 格式化操作数
 *
 * @param ops - 每秒操作数
 * @returns 格式化字符串
 */
export function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
  return ops.toFixed(2)
}

/**
 * 格式化时间
 *
 * @param ms - 毫秒数
 * @returns 格式化字符串
 */
export function formatTime(ms: number): string {
  if (ms < 0.001) return `${(ms * 1_000_000).toFixed(2)}ns`
  if (ms < 1) return `${(ms * 1_000).toFixed(2)}μs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * 格式化字节数
 *
 * @param bytes - 字节数
 * @param signed - 是否显示正负号
 * @returns 格式化字符串
 */
export function formatBytes(bytes: number, signed: boolean = false): string {
  const sign = signed && bytes >= 0 ? '+' : ''
  const abs = Math.abs(bytes)

  if (abs >= 1024 * 1024 * 1024) return `${sign}${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (abs >= 1024 * 1024) return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (abs >= 1024) return `${sign}${(bytes / 1024).toFixed(2)} KB`
  return `${sign}${bytes} B`
}

/**
 * 计算改进百分比
 *
 * @param baseline - 基线值
 * @param current - 当前值
 * @returns 改进百分比（正值表示改进）
 */
export function calculateImprovement(baseline: number, current: number): number {
  if (baseline === 0) return 0
  return ((current - baseline) / baseline) * 100
}

/**
 * 检测异常值（使用 IQR 方法）
 *
 * @param values - 数据数组
 * @param multiplier - IQR 倍数（默认 1.5）
 * @returns 异常值索引数组
 */
export function detectOutliers(values: number[], multiplier: number = 1.5): number[] {
  if (values.length < 4) return []

  const sorted = [...values].sort((a, b) => a - b)
  const q1 = calculatePercentile(sorted, 25)
  const q3 = calculatePercentile(sorted, 75)
  const iqr = q3 - q1

  const lowerBound = q1 - multiplier * iqr
  const upperBound = q3 + multiplier * iqr

  const outlierIndices: number[] = []

  for (let i = 0; i < values.length; i++) {
    if (values[i] < lowerBound || values[i] > upperBound) {
      outlierIndices.push(i)
    }
  }

  return outlierIndices
}

/**
 * 移除异常值并返回干净数据
 *
 * @param values - 数据数组
 * @param multiplier - IQR 倍数
 * @returns 移除异常值后的数组
 */
export function removeOutliers(values: number[], multiplier: number = 1.5): number[] {
  const outlierIndices = new Set(detectOutliers(values, multiplier))
  return values.filter((_, index) => !outlierIndices.has(index))
}

// ============================================================================
// 滑动窗口统计
// ============================================================================

/**
 * 滑动窗口统计计算器
 *
 * 保持固定大小的样本窗口，支持高效的增量统计更新。
 */
export class SlidingWindowStats {
  private values: number[] = []
  private readonly windowSize: number
  private welford: WelfordStats = new WelfordStats()
  private needsRecalc: boolean = false

  /**
   * 创建滑动窗口统计计算器
   *
   * @param windowSize - 窗口大小
   */
  constructor(windowSize: number) {
    this.windowSize = windowSize
  }

  /**
   * 添加值
   *
   * @param value - 要添加的值
   */
  add(value: number): void {
    this.values.push(value)

    if (this.values.length > this.windowSize) {
      this.values.shift()
      this.needsRecalc = true
    } else {
      this.welford.add(value)
    }
  }

  /**
   * 重新计算统计信息
   */
  private recalculate(): void {
    if (!this.needsRecalc) return

    this.welford.reset()
    this.welford.addBatch(this.values)
    this.needsRecalc = false
  }

  /** 获取当前值数组 */
  getValues(): number[] {
    return [...this.values]
  }

  /** 样本数量 */
  get count(): number {
    return this.values.length
  }

  /** 均值 */
  get mean(): number {
    this.recalculate()
    return this.welford.mean
  }

  /** 标准差 */
  get stdDev(): number {
    this.recalculate()
    return this.welford.stdDev
  }

  /** 最小值 */
  get min(): number {
    return this.values.length > 0 ? Math.min(...this.values) : 0
  }

  /** 最大值 */
  get max(): number {
    return this.values.length > 0 ? Math.max(...this.values) : 0
  }

  /**
   * 获取百分位数
   */
  getPercentiles(): PercentileStats {
    return calculatePercentiles(this.values)
  }

  /**
   * 清空数据
   */
  clear(): void {
    this.values = []
    this.welford.reset()
    this.needsRecalc = false
  }
}
