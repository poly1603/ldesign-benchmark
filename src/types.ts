/**
 * Benchmark 类型定义
 */

/**
 * Benchmark 任务函数
 */
export type BenchmarkTask = () => void | Promise<void>

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
  format?: 'console' | 'json' | 'markdown' | 'html'

  /**
   * 输出文件路径
   */
  output?: string

  /**
   * 是否显示详细信息
   * @default false
   */
  verbose?: boolean
}

