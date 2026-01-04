/**
 * Benchmark 类型定义
 */

/**
 * Benchmark 任务函数
 */
export type BenchmarkTask = () => void | Promise<void>

/**
 * 进度回调函数
 */
export type ProgressCallback = (info: ProgressInfo) => void

/**
 * 进度信息
 */
export interface ProgressInfo {
  /** 当前套件名称 */
  suite: string
  /** 当前任务名称 */
  task: string
  /** 当前任务索引 */
  current: number
  /** 总任务数 */
  total: number
  /** 进度百分比 (0-100) */
  percentage: number
  /** 阶段 */
  phase: 'warmup' | 'running' | 'complete'
}

/**
 * Benchmark 选项
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
  concurrency?: 'bench' | 'task' | null
  retainSamples?: boolean
  setupHook?: (context: { taskName: string; mode: 'run' | 'warmup' }) => void | Promise<void>
  teardownHook?: (context: { taskName: string; mode: 'run' | 'warmup' }) => void | Promise<void>

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

/**
 * 百分位数统计
 */
export interface PercentileStats {
  /** 第50百分位数(中位数) */
  p50: number
  /** 第75百分位数 */
  p75: number
  /** 第90百分位数 */
  p90: number
  /** 第95百分位数 */
  p95: number
  /** 第99百分位数 */
  p99: number
}

/**
 * 内存统计
 */
export interface MemoryStats {
  /** 堆使用量(字节) */
  heapUsed: number
  /** 堆总量(字节) */
  heapTotal: number
  /** 外部内存(字节) */
  external: number
  /** RSS(字节) */
  rss: number
  /** 内存增长量(字节) */
  delta: number
}

/**
 * Benchmark 结果
 */
export interface BenchmarkResult {
  /**
   * 任务名称
   */
  name: string

  /**
   * 每秒操作数
   */
  opsPerSecond: number

  /**
   * 平均执行时间(毫秒)
   */
  avgTime: number

  /**
   * 最小执行时间(毫秒)
   */
  minTime: number

  /**
   * 最大执行时间(毫秒)
   */
  maxTime: number

  /**
   * 标准差
   */
  stdDev: number

  /**
   * 相对误差百分比
   */
  rme: number

  /**
   * 总迭代次数
   */
  iterations: number

  /**
   * 总运行时间(毫秒)
   */
  totalTime: number

  /**
   * 百分位数统计
   */
  percentiles?: PercentileStats

  /**
   * 内存统计
   */
  memory?: MemoryStats

  /**
   * 原始样本数据(毫秒)
   */
  samples?: number[]

  /**
   * 标签
   */
  tags?: string[]

  /**
   * 时间戳
   */
  timestamp?: number

  /**
   * 执行状态
   */
  status?: 'success' | 'failed' | 'skipped' | 'timeout'

  /**
   * 错误信息(如果失败)
   */
  error?: string
}

/**
 * Benchmark 实例
 */
export interface Benchmark {
  /**
   * 添加测试任务
   * 
   * @param name - 任务名称
   * @param fn - 任务函数
   */
  add(name: string, fn: BenchmarkTask): this

  /**
   * 运行所有任务
   */
  run(): Promise<BenchmarkResult[]>

  /**
   * 打印结果
   */
  printResults(): void

  /**
   * 获取结果
   */
  getResults(): BenchmarkResult[]

  /**
   * 导出结果为 JSON
   */
  toJSON(): BenchmarkReport
}

/**
 * Benchmark 测试套件
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

/**
 * Benchmark 报告
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
  environment: {
    platform: string
    arch: string
    nodeVersion: string
    cpuModel?: string
    cpuCores?: number
    totalMemory?: number
    freeMemory?: number
    osVersion?: string
    hostname?: string
  }
}

/**
 * Reporter 选项
 */
export interface ReporterOptions {
  /**
   * 输出格式
   * @default 'console'
   */
  format?: 'console' | 'json' | 'markdown' | 'html' | 'csv' | 'pdf'

  /**
   * 输出文件路径
   */
  output?: string

  /**
   * 是否显示详细信息
   * @default false
   */
  verbose?: boolean

  /**
   * 是否使用颜色输出
   * @default true (auto-detect)
   */
  colors?: boolean

  /**
   * 自定义模板路径（用于 HTML 格式）
   */
  template?: string

  /**
   * 模板变量（传递给模板）
   */
  templateVars?: Record<string, unknown>
}

export interface BenchmarkThreshold {
  maxAvgTime?: number
  minOpsPerSecond?: number
  maxRme?: number
  /** 最大P95时间(毫秒) */
  maxP95?: number
  /** 最大内存增长(字节) */
  maxMemoryDelta?: number
}

export type BenchmarkThresholds = Record<string, BenchmarkThreshold>

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
    totalComparisons: number
    improvements: number
    regressions: number
    avgImprovement: number
  }
}

/**
 * Runner 选项
 */
export interface RunnerOptions {
  /** 过滤器 - 只运行匹配的套件 */
  filter?: string | RegExp
  /** 标签过滤 */
  tags?: string[]
  /** 并行执行 */
  parallel?: boolean
  /** 最大并行数 */
  maxConcurrency?: number
  /** 失败后继续 */
  continueOnError?: boolean
  /** 进度回调 */
  onProgress?: ProgressCallback
  /** 套件开始回调 */
  onSuiteStart?: (suite: string) => void
  /** 套件完成回调 */
  onSuiteComplete?: (suite: string, results: BenchmarkResult[]) => void
  /** 是否保留样本数据 */
  retainSamples?: boolean
  /** 超时时间(毫秒) */
  timeout?: number
}

/**
 * 配置文件结构
 */
export interface BenchmarkConfig {
  /** 默认选项 */
  defaults?: Partial<BenchmarkOptions>
  /** 测试文件 pattern */
  pattern?: string | string[]
  /** 忽略文件 */
  ignore?: string[]
  /** 输出目录 */
  outputDir?: string
  /** 历史记录目录 */
  historyDir?: string
  /** 阈值配置 */
  thresholds?: BenchmarkThresholds
  /** 报告格式 */
  reporters?: ('console' | 'json' | 'markdown' | 'html' | 'csv')[]
  /** 插件列表 */
  plugins?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** Git 集成 */
  git?: {
    enabled: boolean
    trackCommit?: boolean
    trackBranch?: boolean
  }
}

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
 * 趋势分析
 */
export interface TrendAnalysis {
  /** 任务名称 */
  task: string
  /** 数据点 */
  dataPoints: TrendDataPoint[]
  /** 趋势方向 */
  trend: 'improving' | 'stable' | 'degrading'
  /** 变化率(百分比/周) */
  changeRate: number
  /** 预测值 */
  prediction?: {
    nextWeek: number
    confidence: number
  }
}

/**
 * CI 环境配置
 */
export interface CIConfig {
  /** 是否启用 CI 模式 */
  enabled: boolean
  /** CI 提供商 */
  provider?: 'github' | 'gitlab' | 'jenkins' | 'azure'
  /** 是否在回归时失败 */
  failOnRegression: boolean
  /** 回归阈值百分比 */
  regressionThreshold: number
  /** 是否生成注释 */
  annotations: boolean
}

/**
 * 增强的配置结构（包含 CI 配置）
 */
export interface EnhancedBenchmarkConfig extends BenchmarkConfig {
  /** CI/CD 配置 */
  ci?: CIConfig
  /** 并行执行配置 */
  parallel?: {
    enabled: boolean
    maxWorkers: number
    isolate: boolean
  }
  /** 存储配置 */
  storage?: {
    type: 'json' | 'sqlite'
    path: string
    retention: {
      maxAge: number
      maxCount: number
    }
  }
  /** 国际化配置 */
  locale?: {
    language: 'zh-CN' | 'en-US'
    dateFormat: string
    numberFormat: string
  }
}

