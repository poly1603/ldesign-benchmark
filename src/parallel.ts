/**
 * 并行执行模块
 * 
 * 提供并行执行基准测试套件的能力，支持：
 * - 并行套件执行
 * - 并发限制控制
 * - 进度聚合
 * - 套件依赖声明
 * 
 * @module parallel
 */

import type {
  Benchmark,
  BenchmarkReport,
  BenchmarkSuite,
  BenchmarkResult,
  ProgressCallback,
  ProgressInfo,
} from './types'
import { getGitInfo } from './git'

/**
 * 并行执行配置
 */
export interface ParallelConfig {
  /** 是否启用并行执行 */
  enabled?: boolean
  /** 最大并行工作数 */
  maxWorkers?: number
  /** 是否隔离执行（每个套件独立进程） */
  isolate?: boolean
}

/**
 * 套件配置
 */
export interface SuiteConfig {
  /** 套件名称 */
  name: string
  /** Benchmark 实例 */
  benchmark: Benchmark
  /** 依赖的套件名称列表 */
  dependsOn?: string[]
  /** 套件标签 */
  tags?: string[]
}

/**
 * 并行执行选项
 */
export interface ParallelRunnerOptions {
  /** 并行配置 */
  parallel?: ParallelConfig
  /** 失败后继续执行 */
  continueOnError?: boolean
  /** 进度回调 */
  onProgress?: ProgressCallback
  /** 套件开始回调 */
  onSuiteStart?: (suite: string) => void
  /** 套件完成回调 */
  onSuiteComplete?: (suite: string, results: BenchmarkResult[]) => void
  /** 超时时间(毫秒) */
  timeout?: number
}

/**
 * 套件执行结果
 */
export interface SuiteExecutionResult {
  /** 套件名称 */
  name: string
  /** 执行结果 */
  results: BenchmarkResult[]
  /** 执行时长 */
  duration: number
  /** 时间戳 */
  timestamp: number
  /** 开始时间 */
  startTime: number
  /** 结束时间 */
  endTime: number
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: Error
}

/**
 * 并行执行状态
 */
export interface ParallelExecutionState {
  /** 当前运行中的套件数 */
  runningCount: number
  /** 已完成的套件数 */
  completedCount: number
  /** 总套件数 */
  totalCount: number
  /** 运行中的套件名称 */
  runningSuites: Set<string>
  /** 已完成的套件名称 */
  completedSuites: Set<string>
  /** 套件开始时间映射 */
  startTimes: Map<string, number>
}

/**
 * 信号量 - 用于控制并发数
 */
export class Semaphore {
  private permits: number
  private waiting: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  /**
   * 获取许可
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve)
    })
  }

  /**
   * 释放许可
   */
  release(): void {
    this.permits++
    const next = this.waiting.shift()
    if (next) {
      this.permits--
      next()
    }
  }

  /**
   * 获取当前可用许可数
   */
  getAvailablePermits(): number {
    return this.permits
  }

  /**
   * 获取当前使用中的许可数
   */
  getUsedPermits(): number {
    return this.waiting.length + (this.permits < 0 ? -this.permits : 0)
  }
}

/**
 * 拓扑排序 - 用于处理套件依赖
 * 
 * @param suites - 套件配置列表
 * @returns 排序后的套件名称列表
 * @throws 如果存在循环依赖
 */
export function topologicalSort(suites: SuiteConfig[]): string[] {
  const graph = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  const suiteNames = new Set<string>()

  // 初始化图
  for (const suite of suites) {
    suiteNames.add(suite.name)
    graph.set(suite.name, [])
    inDegree.set(suite.name, 0)
  }

  // 构建依赖图
  for (const suite of suites) {
    if (suite.dependsOn) {
      for (const dep of suite.dependsOn) {
        if (!suiteNames.has(dep)) {
          throw new Error(`套件 "${suite.name}" 依赖的套件 "${dep}" 不存在`)
        }
        graph.get(dep)!.push(suite.name)
        inDegree.set(suite.name, (inDegree.get(suite.name) || 0) + 1)
      }
    }
  }

  // Kahn's 算法
  const queue: string[] = []
  const result: string[] = []

  // 找出所有入度为 0 的节点
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    for (const neighbor of graph.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  // 检查是否有循环依赖
  if (result.length !== suites.length) {
    const remaining = suites
      .filter(s => !result.includes(s.name))
      .map(s => s.name)
    throw new Error(`检测到循环依赖，涉及套件: ${remaining.join(', ')}`)
  }

  return result
}

/**
 * 获取可以并行执行的套件组
 * 
 * @param suites - 套件配置列表
 * @param completed - 已完成的套件名称集合
 * @returns 可以并行执行的套件列表
 */
export function getExecutableSuites(
  suites: SuiteConfig[],
  completed: Set<string>
): SuiteConfig[] {
  return suites.filter(suite => {
    // 已完成的跳过
    if (completed.has(suite.name)) {
      return false
    }

    // 检查依赖是否都已完成
    if (suite.dependsOn && suite.dependsOn.length > 0) {
      return suite.dependsOn.every(dep => completed.has(dep))
    }

    return true
  })
}

/**
 * 聚合进度信息
 */
export class ProgressAggregator {
  private suiteProgress: Map<string, ProgressInfo> = new Map()
  private callback?: ProgressCallback

  constructor(callback?: ProgressCallback) {
    this.callback = callback
  }

  /**
   * 更新套件进度
   */
  update(suiteName: string, progress: ProgressInfo): void {
    this.suiteProgress.set(suiteName, progress)
    this.emit()
  }

  /**
   * 移除套件进度
   */
  remove(suiteName: string): void {
    this.suiteProgress.delete(suiteName)
  }

  /**
   * 发送聚合进度
   */
  private emit(): void {
    if (!this.callback) return

    // 计算聚合进度
    let totalCurrent = 0
    let totalTotal = 0
    let currentSuite = ''
    let currentTask = ''
    let currentPhase: 'warmup' | 'running' | 'complete' = 'running'

    for (const [suite, progress] of this.suiteProgress) {
      totalCurrent += progress.current
      totalTotal += progress.total
      // 使用最后更新的套件信息
      currentSuite = suite
      currentTask = progress.task
      currentPhase = progress.phase
    }

    const percentage = totalTotal > 0 ? (totalCurrent / totalTotal) * 100 : 0

    this.callback({
      suite: currentSuite,
      task: currentTask,
      current: totalCurrent,
      total: totalTotal,
      percentage,
      phase: currentPhase,
    })
  }

  /**
   * 获取所有套件的进度
   */
  getAllProgress(): Map<string, ProgressInfo> {
    return new Map(this.suiteProgress)
  }
}

/**
 * 并行 Benchmark Runner
 */
export class ParallelBenchmarkRunner {
  private suites: Map<string, SuiteConfig> = new Map()
  private options: ParallelRunnerOptions
  private state: ParallelExecutionState
  private semaphore: Semaphore
  private _progressAggregator: ProgressAggregator

  constructor(options: ParallelRunnerOptions = {}) {
    const maxWorkers = options.parallel?.maxWorkers ?? 4
    this.options = {
      continueOnError: true,
      ...options,
      parallel: {
        enabled: true,
        maxWorkers,
        isolate: false,
        ...options.parallel,
      },
    }

    this.semaphore = new Semaphore(maxWorkers)
    this._progressAggregator = new ProgressAggregator(options.onProgress)
    this.state = {
      runningCount: 0,
      completedCount: 0,
      totalCount: 0,
      runningSuites: new Set(),
      completedSuites: new Set(),
      startTimes: new Map(),
    }
  }

  /**
   * 添加套件
   */
  addSuite(config: SuiteConfig): this {
    this.suites.set(config.name, config)
    return this
  }

  /**
   * 添加简单套件（无依赖）
   */
  addSimpleSuite(name: string, benchmark: Benchmark): this {
    return this.addSuite({ name, benchmark })
  }

  /**
   * 获取套件列表
   */
  getSuites(): string[] {
    return Array.from(this.suites.keys())
  }

  /**
   * 移除套件
   */
  removeSuite(name: string): boolean {
    return this.suites.delete(name)
  }

  /**
   * 清空所有套件
   */
  clear(): void {
    this.suites.clear()
  }

  /**
   * 获取当前执行状态
   */
  getState(): ParallelExecutionState {
    return { ...this.state }
  }

  /**
   * 获取最大并行数
   */
  getMaxWorkers(): number {
    return this.options.parallel?.maxWorkers ?? 4
  }

  /**
   * 获取进度聚合器
   */
  getProgressAggregator(): ProgressAggregator {
    return this._progressAggregator
  }

  /**
   * 执行单个套件
   */
  private async executeSuite(config: SuiteConfig): Promise<SuiteExecutionResult> {
    const startTime = Date.now()
    this.state.startTimes.set(config.name, startTime)

    try {
      this.options.onSuiteStart?.(config.name)
      console.log(`\n🏃 运行套件: ${config.name}`)

      const results = await config.benchmark.run()
      config.benchmark.printResults()

      const endTime = Date.now()
      this.options.onSuiteComplete?.(config.name, results)

      return {
        name: config.name,
        results,
        duration: endTime - startTime,
        timestamp: endTime,
        startTime,
        endTime,
        success: true,
      }
    } catch (error) {
      const endTime = Date.now()
      console.error(`❌ 套件 ${config.name} 运行失败:`, error)

      return {
        name: config.name,
        results: [],
        duration: endTime - startTime,
        timestamp: endTime,
        startTime,
        endTime,
        success: false,
        error: error as Error,
      }
    }
  }

  /**
   * 并行执行所有套件
   */
  async runAll(): Promise<BenchmarkReport> {
    const suiteConfigs = Array.from(this.suites.values())
    const results: SuiteExecutionResult[] = []
    const errors: Array<{ suite: string; error: Error }> = []
    const startTime = Date.now()

    // 重置状态
    this.state = {
      runningCount: 0,
      completedCount: 0,
      totalCount: suiteConfigs.length,
      runningSuites: new Set(),
      completedSuites: new Set(),
      startTimes: new Map(),
    }

    // 获取 Git 信息
    const gitInfo = await getGitInfo()

    if (!this.options.parallel?.enabled) {
      // 串行执行
      for (const config of suiteConfigs) {
        const result = await this.executeSuite(config)
        results.push(result)
        this.state.completedCount++
        this.state.completedSuites.add(config.name)

        if (!result.success) {
          errors.push({ suite: config.name, error: result.error! })
          if (!this.options.continueOnError) {
            break
          }
        }
      }
    } else {
      // 检查是否有依赖关系
      const hasDependencies = suiteConfigs.some(s => s.dependsOn && s.dependsOn.length > 0)

      if (hasDependencies) {
        // 有依赖关系时，按拓扑顺序分批执行
        await this.runWithDependencies(suiteConfigs, results, errors)
      } else {
        // 无依赖关系时，完全并行执行
        await this.runParallel(suiteConfigs, results, errors)
      }
    }

    const totalDuration = Date.now() - startTime

    if (errors.length > 0) {
      console.log(`\n⚠️ ${errors.length} 个套件运行失败`)
    }

    console.log(`\n✅ 所有套件运行完成 (${totalDuration}ms)`)

    // 构建报告
    const suites: BenchmarkSuite[] = results
      .filter(r => r.success)
      .map(r => ({
        name: r.name,
        results: r.results,
        duration: r.duration,
        timestamp: r.timestamp,
      }))

    return {
      name: 'Benchmark Report',
      suites,
      generatedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        ...(gitInfo.commit && { gitCommit: gitInfo.commit }),
        ...(gitInfo.branch && { gitBranch: gitInfo.branch }),
      } as any,
    }
  }

  /**
   * 完全并行执行（无依赖）
   */
  private async runParallel(
    suiteConfigs: SuiteConfig[],
    results: SuiteExecutionResult[],
    errors: Array<{ suite: string; error: Error }>
  ): Promise<void> {
    const promises = suiteConfigs.map(async (config) => {
      // 获取信号量许可
      await this.semaphore.acquire()
      this.state.runningCount++
      this.state.runningSuites.add(config.name)

      try {
        const result = await this.executeSuite(config)
        results.push(result)

        if (!result.success) {
          errors.push({ suite: config.name, error: result.error! })
        }

        return result
      } finally {
        this.state.runningCount--
        this.state.runningSuites.delete(config.name)
        this.state.completedCount++
        this.state.completedSuites.add(config.name)
        this.semaphore.release()
      }
    })

    await Promise.all(promises)
  }

  /**
   * 按依赖顺序执行
   */
  private async runWithDependencies(
    suiteConfigs: SuiteConfig[],
    results: SuiteExecutionResult[],
    errors: Array<{ suite: string; error: Error }>
  ): Promise<void> {
    // 验证依赖关系并获取拓扑排序
    topologicalSort(suiteConfigs)

    const pending = new Set(suiteConfigs.map(s => s.name))
    const running = new Map<string, Promise<SuiteExecutionResult>>()

    while (pending.size > 0 || running.size > 0) {
      // 获取可执行的套件
      const executable = getExecutableSuites(
        suiteConfigs.filter(s => pending.has(s.name)),
        this.state.completedSuites
      )

      // 启动可执行的套件（受信号量限制）
      for (const config of executable) {
        if (running.has(config.name)) continue
        if (this.semaphore.getAvailablePermits() <= 0) break

        pending.delete(config.name)
        await this.semaphore.acquire()
        this.state.runningCount++
        this.state.runningSuites.add(config.name)

        const promise = this.executeSuite(config).then(result => {
          this.state.runningCount--
          this.state.runningSuites.delete(config.name)
          this.state.completedCount++
          this.state.completedSuites.add(config.name)
          this.semaphore.release()
          running.delete(config.name)

          results.push(result)
          if (!result.success) {
            errors.push({ suite: config.name, error: result.error! })
          }

          return result
        })

        running.set(config.name, promise)
      }

      // 等待至少一个任务完成
      if (running.size > 0) {
        await Promise.race(running.values())
      }
    }
  }

  /**
   * 打印汇总报告
   */
  printSummary(report: BenchmarkReport): void {
    console.log('\n' + '='.repeat(80))
    console.log('📊 Benchmark 汇总报告 (并行执行)')
    console.log('='.repeat(80))

    console.log(`\n环境信息:`)
    console.log(`  平台: ${report.environment.platform}`)
    console.log(`  架构: ${report.environment.arch}`)
    console.log(`  Node: ${report.environment.nodeVersion}`)
    console.log(`  最大并行数: ${this.getMaxWorkers()}`)

    console.log(`\n套件统计:`)
    console.log(`  总套件数: ${report.suites.length}`)
    console.log(`  总任务数: ${report.suites.reduce((sum, s) => sum + s.results.length, 0)}`)
    console.log(`  总耗时: ${report.suites.reduce((sum, s) => sum + s.duration, 0)}ms`)

    console.log(`\n生成时间: ${report.generatedAt}`)
    console.log('='.repeat(80))
  }
}

/**
 * 创建并行 Benchmark Runner
 */
export function createParallelRunner(options?: ParallelRunnerOptions): ParallelBenchmarkRunner {
  return new ParallelBenchmarkRunner(options)
}
