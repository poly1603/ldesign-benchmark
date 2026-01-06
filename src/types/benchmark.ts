/**
 * 基准测试核心类型定义
 * Core benchmark type definitions
 *
 * 此模块定义了基准测试框架的所有核心类型，包括：
 * - 任务和回调类型
 * - 选项配置
 * - 结果和报告结构
 * - 阈值和比较类型
 *
 * @module types/benchmark
 */

// ============================================================================
// 基础类型 / Basic Types
// ============================================================================

/**
 * 基准测试任务函数
 * Benchmark task function
 *
 * 支持同步和异步函数。任务函数应该是幂等的，即多次执行应该产生相同的结果。
 *
 * @example
 * ```ts
 * // 同步任务
 * const syncTask: BenchmarkTask = () => {
 *   someComputation()
 * }
 *
 * // 异步任务
 * const asyncTask: BenchmarkTask = async () => {
 *   await fetchData()
 * }
 * ```
 */
export type BenchmarkTask = () => void | Promise<void>

/**
 * 进度回调函数
 * Progress callback function
 *
 * 在基准测试执行过程中被调用，用于报告进度信息。
 */
export type ProgressCallback = (info: Readonly<ProgressInfo>) => void

/**
 * 执行阶段常量
 * Execution phase constants
 */
export const BENCHMARK_PHASES = ['warmup', 'running', 'complete'] as const

/**
 * 执行阶段类型
 * Execution phase type
 *
 * - `warmup`: 预热阶段，用于 JIT 编译和缓存预热
 * - `running`: 正式运行阶段
 * - `complete`: 执行完成
 */
export type BenchmarkPhase = typeof BENCHMARK_PHASES[number]

/**
 * 执行状态常量
 * Execution status constants
 */
export const BENCHMARK_STATUSES = ['pending', 'running', 'success', 'failed', 'skipped', 'timeout'] as const

/**
 * 执行状态类型
 * Execution status type
 *
 * - `pending`: 等待执行
 * - `running`: 正在执行
 * - `success`: 执行成功
 * - `failed`: 执行失败
 * - `skipped`: 跳过执行
 * - `timeout`: 执行超时
 */
export type BenchmarkStatus = typeof BENCHMARK_STATUSES[number]

/**
 * 并发模式常量
 * Concurrency mode constants
 */
export const CONCURRENCY_MODES = ['bench', 'task'] as const

/**
 * 并发模式类型
 * Concurrency mode type
 *
 * - `bench`: 所有任务串行执行，但 Bench 内部可以并行预热
 * - `task`: 每个任务可以并行执行
 * - `null`: 完全禁用并发
 */
export type ConcurrencyMode = typeof CONCURRENCY_MODES[number] | null

// ============================================================================
// 进度信息
// ============================================================================

/**
 * 进度信息接口
 * Progress information interface
 */
export interface ProgressInfo {
  /** 当前套件名称 / Current suite name */
  readonly suite: string
  /** 当前任务名称 / Current task name */
  readonly task: string
  /** 当前任务索引（从0开始） / Current task index (0-based) */
  readonly current: number
  /** 总任务数 / Total number of tasks */
  readonly total: number
  /** 进度百分比 (0-100) / Progress percentage (0-100) */
  readonly percentage: number
  /** 当前阶段 / Current phase */
  readonly phase: BenchmarkPhase
  /** 预计剩余时间（毫秒） / Estimated time remaining (ms) */
  readonly estimatedTimeRemaining?: number
  /** 当前迭代数 / Current iteration count */
  readonly currentIteration?: number
  /** 目标迭代数 / Target iteration count */
  readonly targetIterations?: number
}

// ============================================================================
// 基准测试选项
// ============================================================================

/**
 * Setup/Teardown 钩子上下文
 */
export interface HookContext {
  /** 任务名称 */
  taskName: string
  /** 执行模式 */
  mode: 'run' | 'warmup'
}

/**
 * Setup/Teardown 钩子函数类型
 */
export type HookFunction = (context: HookContext) => void | Promise<void>

/**
 * 基准测试选项
 */
export interface BenchmarkOptions {
  /**
   * 基准测试名称
   */
  name: string

  /**
   * 预热次数
   * @default 5
   */
  warmup?: number

  /**
   * 最小运行时间(毫秒)
   * @default 1000
   */
  time?: number

  /**
   * 最小迭代次数
   * @default 10
   */
  iterations?: number

  /**
   * 是否在运行前执行 setup
   * @default true
   */
  setup?: boolean

  /**
   * 是否在运行后执行 teardown
   * @default true
   */
  teardown?: boolean

  /**
   * 并发模式
   * - 'bench': 所有任务串行执行
   * - 'task': 任务内部可以并发
   * - null: 禁用并发
   */
  concurrency?: ConcurrencyMode

  /**
   * 是否保留样本数据
   * @default false
   */
  retainSamples?: boolean

  /**
   * Setup 钩子函数
   */
  setupHook?: HookFunction

  /**
   * Teardown 钩子函数
   */
  teardownHook?: HookFunction

  /**
   * 是否收集内存信息
   * @default false
   */
  collectMemory?: boolean

  /**
   * 进度回调
   */
  onProgress?: ProgressCallback

  /**
   * 失败重试次数
   * @default 0
   */
  retries?: number

  /**
   * 超时时间(毫秒)
   * @default 30000
   */
  timeout?: number

  /**
   * 标签用于过滤
   */
  tags?: string[]
}

// ============================================================================
// 统计信息
// ============================================================================

/**
 * 百分位数统计
 * Percentile statistics
 */
export interface PercentileStats {
  /** 第50百分位数(中位数) / 50th percentile (median) */
  readonly p50: number
  /** 第75百分位数 / 75th percentile */
  readonly p75: number
  /** 第90百分位数 / 90th percentile */
  readonly p90: number
  /** 第95百分位数 / 95th percentile */
  readonly p95: number
  /** 第99百分位数 / 99th percentile */
  readonly p99: number
  /** 第99.9百分位数 / 99.9th percentile */
  readonly p999?: number
}

/**
 * 内存统计
 * Memory statistics
 */
export interface MemoryStats {
  /** 堆使用量(字节) / Heap used (bytes) */
  readonly heapUsed: number
  /** 堆总量(字节) / Heap total (bytes) */
  readonly heapTotal: number
  /** 外部内存(字节) / External memory (bytes) */
  readonly external: number
  /** RSS(字节) / Resident set size (bytes) */
  readonly rss: number
  /** 内存增长量(字节) / Memory delta (bytes) */
  readonly delta: number
  /** 数组缓冲区(字节) / Array buffers (bytes) */
  readonly arrayBuffers?: number
}

/**
 * 扩展的统计信息
 * Extended statistics
 */
export interface ExtendedStats {
  /** 方差 / Variance */
  readonly variance: number
  /** 变异系数 (CV) / Coefficient of variation */
  readonly cv: number
  /** 四分位距 (IQR) / Interquartile range */
  readonly iqr: number
  /** 偏度 / Skewness */
  readonly skewness: number
  /** 峰度 / Kurtosis */
  readonly kurtosis: number
  /** 中位数绝对偏差 (MAD) / Median absolute deviation */
  readonly mad?: number
}

// ============================================================================
// 基准测试结果
// ============================================================================

/**
 * 基准测试结果
 * Benchmark result interface
 */
export interface BenchmarkResult {
  /**
   * 任务名称 / Task name
   */
  readonly name: string

  /**
   * 每秒操作数 / Operations per second
   */
  readonly opsPerSecond: number

  /**
   * 平均执行时间(毫秒) / Average execution time (ms)
   */
  readonly avgTime: number

  /**
   * 最小执行时间(毫秒) / Minimum execution time (ms)
   */
  readonly minTime: number

  /**
   * 最大执行时间(毫秒) / Maximum execution time (ms)
   */
  readonly maxTime: number

  /**
   * 标准差(毫秒) / Standard deviation (ms)
   */
  readonly stdDev: number

  /**
   * 相对误差百分比 / Relative margin of error (%)
   */
  readonly rme: number

  /**
   * 总迭代次数 / Total iterations
   */
  readonly iterations: number

  /**
   * 总运行时间(毫秒) / Total run time (ms)
   */
  readonly totalTime: number

  /**
   * 百分位数统计 / Percentile statistics
   */
  readonly percentiles?: PercentileStats

  /**
   * 内存统计 / Memory statistics
   */
  readonly memory?: MemoryStats

  /**
   * 扩展统计信息 / Extended statistics
   */
  readonly extendedStats?: ExtendedStats

  /**
   * 原始样本数据(毫秒) / Raw sample data (ms)
   */
  readonly samples?: readonly number[]

  /**
   * 标签 / Tags
   */
  readonly tags?: readonly string[]

  /**
   * 时间戳 / Timestamp
   */
  readonly timestamp?: number

  /**
   * 执行状态 / Execution status
   */
  readonly status?: BenchmarkStatus

  /**
   * 错误信息(如果失败) / Error message (if failed)
   */
  readonly error?: string

  /**
   * 任务分组名称 / Task group name
   */
  readonly group?: string

  /**
   * 自定义指标 / Custom metrics
   */
  readonly customMetrics?: Readonly<Record<string, number>>
}

// ============================================================================
// 基准测试套件
// ============================================================================

/**
 * 基准测试套件
 */
export interface BenchmarkSuite {
  /**
   * 套件名称
   */
  name: string

  /**
   * 测试结果
   */
  results: BenchmarkResult[]

  /**
   * 运行时间(毫秒)
   */
  duration: number

  /**
   * 运行时间戳
   */
  timestamp: number
}

// ============================================================================
// 环境信息
// ============================================================================

/**
 * 环境信息
 */
export interface EnvironmentInfo {
  /** 操作系统平台 */
  platform: string
  /** CPU 架构 */
  arch: string
  /** Node.js 版本 */
  nodeVersion: string
  /** CPU 型号 */
  cpuModel?: string
  /** CPU 核心数 */
  cpuCores?: number
  /** 总内存(字节) */
  totalMemory?: number
  /** 可用内存(字节) */
  freeMemory?: number
  /** 操作系统版本 */
  osVersion?: string
  /** 主机名 */
  hostname?: string
  /** Git 提交哈希 */
  gitCommit?: string
  /** Git 分支 */
  gitBranch?: string
}

// ============================================================================
// 基准测试报告
// ============================================================================

/**
 * 基准测试报告
 */
export interface BenchmarkReport {
  /**
   * 报告名称
   */
  name: string

  /**
   * 测试套件
   */
  suites: BenchmarkSuite[]

  /**
   * 生成时间
   */
  generatedAt: string

  /**
   * 环境信息
   */
  environment: EnvironmentInfo
}

// ============================================================================
// 基准测试实例接口
// ============================================================================

/**
 * 基准测试实例接口
 */
export interface Benchmark {
  /**
   * 添加测试任务
   *
   * @param name - 任务名称
   * @param fn - 任务函数
   * @returns this 支持链式调用
   */
  add(name: string, fn: BenchmarkTask): this

  /**
   * 运行所有任务
   *
   * @returns 测试结果数组
   */
  run(): Promise<BenchmarkResult[]>

  /**
   * 打印结果到控制台
   */
  printResults(): void

  /**
   * 获取结果
   *
   * @returns 测试结果数组
   */
  getResults(): BenchmarkResult[]

  /**
   * 导出结果为 JSON
   *
   * @returns 完整的基准测试报告
   */
  toJSON(): BenchmarkReport
}

// ============================================================================
// 阈值检查
// ============================================================================

/**
 * 单个任务的阈值配置
 */
export interface BenchmarkThreshold {
  /** 最大平均时间(毫秒) */
  maxAvgTime?: number
  /** 最小操作数/秒 */
  minOpsPerSecond?: number
  /** 最大相对误差百分比 */
  maxRme?: number
  /** 最大P95时间(毫秒) */
  maxP95?: number
  /** 最大P99时间(毫秒) */
  maxP99?: number
  /** 最大内存增长(字节) */
  maxMemoryDelta?: number
}

/**
 * 阈值配置映射
 * 键可以是 "suiteName::taskName" 或 "taskName"
 */
export type BenchmarkThresholds = Record<string, BenchmarkThreshold>

// ============================================================================
// 比较结果
// ============================================================================

/**
 * 比较结果
 */
export interface ComparisonResult {
  /** 套件名称 */
  suite: string
  /** 任务名称 */
  task: string
  /** 基线 ops/sec */
  baselineOps: number
  /** 当前 ops/sec */
  currentOps: number
  /** 改进百分比(正为提升，负为下降) */
  improvement: number
  /** 是否为回归 */
  isRegression: boolean
  /** 是否为提升 */
  isImprovement: boolean
  /** 基线平均时间 */
  baselineAvgTime: number
  /** 当前平均时间 */
  currentAvgTime: number
}

/**
 * 比较报告汇总
 */
export interface ComparisonSummary {
  /** 基线生成时间 */
  baseline: string
  /** 当前生成时间 */
  current: string
  /** 详细比较 */
  comparisons: ComparisonResult[]
  /** 汇总统计 */
  summary: {
    /** 比较总数 */
    totalComparisons: number
    /** 改进数量 */
    improvements: number
    /** 回归数量 */
    regressions: number
    /** 平均改进百分比 */
    avgImprovement: number
  }
}

// ============================================================================
// 趋势分析
// ============================================================================

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  /** 时间戳 */
  timestamp: number
  /** Git 提交 hash */
  commitHash?: string
  /** Git 分支 */
  branch?: string
  /** ops/sec */
  opsPerSecond: number
  /** 平均时间 */
  avgTime: number
  /** 内存使用 */
  memoryUsed?: number
}

/**
 * 趋势方向
 */
export type TrendDirection = 'improving' | 'stable' | 'degrading'

/**
 * 趋势分析结果
 * Trend analysis result
 */
export interface TrendAnalysis {
  /** 任务名称 / Task name */
  readonly task: string
  /** 数据点 / Data points */
  readonly dataPoints: readonly TrendDataPoint[]
  /** 趋势方向 / Trend direction */
  readonly trend: TrendDirection
  /** 变化率(百分比/周) / Change rate (%/week) */
  readonly changeRate: number
  /** 预测值 / Prediction */
  readonly prediction?: {
    /** 下周预测值 / Next week prediction */
    readonly nextWeek: number
    /** 置信度 / Confidence */
    readonly confidence: number
  }
}

// ============================================================================
// 类型工具 / Type Utilities
// ============================================================================

/**
 * 深度只读类型
 * Deep readonly type
 */
export type DeepReadonly<T> = T extends (infer R)[]
  ? ReadonlyArray<DeepReadonly<R>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

/**
 * 可变版本的类型（移除 readonly）
 * Mutable version of type (removes readonly)
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K]
}

/**
 * 深度可变类型
 * Deep mutable type
 */
export type DeepMutable<T> = T extends readonly (infer R)[]
  ? DeepMutable<R>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T

/**
 * 可选属性类型
 * Optional properties type
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * 必填属性类型
 * Required properties type
 */
export type RequiredFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * 基准测试结果创建参数（可变版本）
 * Benchmark result creation parameters (mutable version)
 */
export type BenchmarkResultInput = Mutable<Omit<BenchmarkResult, 'timestamp'>> & {
  timestamp?: number
}

/**
 * 部分基准测试选项
 * Partial benchmark options
 */
export type PartialBenchmarkOptions = Partial<Omit<BenchmarkOptions, 'name'>> & {
  name: string
}

/**
 * 基准测试配置（只读版本）
 * Benchmark configuration (readonly version)
 */
export type BenchmarkConfig = DeepReadonly<BenchmarkOptions>

/**
 * 环境信息（只读版本）
 * Environment info (readonly version)
 */
export type ReadonlyEnvironmentInfo = DeepReadonly<EnvironmentInfo>
