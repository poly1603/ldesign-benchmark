/**
 * Benchmark 核心实现
 */

import { Bench } from 'tinybench'
import type {
  Benchmark,
  BenchmarkOptions,
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkReport,
  PercentileStats,
  MemoryStats,
} from './types'
import { BenchmarkReporter } from './reporter'
import { environmentCollector } from './environment'

/**
 * 计算百分位数
 */
function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0
  const index = (percentile / 100) * (sortedValues.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] * (upper - index) + sortedValues[upper] * (index - lower)
}

/**
 * 计算所有百分位数
 */
function calculatePercentiles(samples: number[]): PercentileStats {
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    p50: calculatePercentile(sorted, 50),
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  }
}

/**
 * 获取当前内存快照
 */
function getMemorySnapshot(): MemoryStats {
  const mem = process.memoryUsage()
  return {
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
    delta: 0,
  }
}

/**
 * Benchmark 实现类
 */
export class BenchmarkImpl implements Benchmark {
  private bench: Bench
  private results: BenchmarkResult[] = []
  private reporter: BenchmarkReporter
  private taskCount: number = 0
  private completedTasks: number = 0
  private memorySnapshots: Map<string, { before: MemoryStats; after?: MemoryStats }> = new Map()

  constructor(private options: BenchmarkOptions) {
    const benchOptions: { [key: string]: unknown } = {}
    const {
      time,
      iterations,
      warmup,
      concurrency,
      setupHook,
      teardownHook,
      collectMemory,
      onProgress,
    } = options

    // 始终保留样本以便计算百分位数
    benchOptions.retainSamples = true

    if (typeof time === 'number') {
      benchOptions.time = time
    }

    if (typeof iterations === 'number') {
      benchOptions.iterations = iterations
    }

    if (typeof warmup === 'number') {
      if (warmup <= 0) {
        benchOptions.warmup = false
      } else {
        benchOptions.warmup = true
        benchOptions.warmupIterations = warmup
      }
    }

    if (concurrency === 'bench' || concurrency === 'task' || concurrency === null) {
      benchOptions.concurrency = concurrency
    }

    // 增强 setup hook 以收集内存
    const originalSetup = setupHook
    benchOptions.setup = async (task: any, mode?: 'run' | 'warmup') => {
      if (mode === 'run') {
        // 收集内存快照
        if (collectMemory) {
          global.gc?.() // 如果有 GC 则先执行
          this.memorySnapshots.set(task?.name ?? '', { before: getMemorySnapshot() })
        }

        // 触发进度回调
        if (onProgress) {
          onProgress({
            suite: this.options.name,
            task: task?.name ?? '',
            current: this.completedTasks,
            total: this.taskCount,
            percentage: (this.completedTasks / this.taskCount) * 100,
            phase: 'running',
          })
        }
      }

      if (originalSetup) {
        await originalSetup({
          taskName: task?.name ?? '',
          mode: mode ?? 'run',
        })
      }
    }

    // 增强 teardown hook
    const originalTeardown = teardownHook
    benchOptions.teardown = async (task: any, mode?: 'run' | 'warmup') => {
      if (mode === 'run') {
        // 收集结束内存快照
        if (collectMemory) {
          const snapshot = this.memorySnapshots.get(task?.name ?? '')
          if (snapshot) {
            snapshot.after = getMemorySnapshot()
          }
        }

        this.completedTasks++

        // 触发完成进度回调
        if (onProgress) {
          onProgress({
            suite: this.options.name,
            task: task?.name ?? '',
            current: this.completedTasks,
            total: this.taskCount,
            percentage: (this.completedTasks / this.taskCount) * 100,
            phase: this.completedTasks >= this.taskCount ? 'complete' : 'running',
          })
        }
      }

      if (originalTeardown) {
        await originalTeardown({
          taskName: task?.name ?? '',
          mode: mode ?? 'run',
        })
      }
    }

    this.bench = new Bench(benchOptions)
    this.reporter = new BenchmarkReporter()
  }

  /**
   * 添加测试任务
   */
  add(name: string, fn: BenchmarkTask): this {
    this.bench.add(name, fn)
    this.taskCount++
    return this
  }

  /**
   * 运行所有任务
   */
  async run(): Promise<BenchmarkResult[]> {
    // const startTime = Date.now() // Reserved for future use
    this.completedTasks = 0

    // 触发预热阶段回调
    if (this.options.onProgress) {
      this.options.onProgress({
        suite: this.options.name,
        task: '',
        current: 0,
        total: this.taskCount,
        percentage: 0,
        phase: 'warmup',
      })
    }

    await this.bench.run()

    this.results = this.bench.tasks.map((task) => {
      const result = task.result!
      const samples = result.samples || []

      // 计算百分位数
      const percentiles = calculatePercentiles(samples)

      // 获取内存统计
      let memory: MemoryStats | undefined
      if (this.options.collectMemory) {
        const snapshot = this.memorySnapshots.get(task.name)
        if (snapshot?.before && snapshot?.after) {
          memory = {
            ...snapshot.after,
            delta: snapshot.after.heapUsed - snapshot.before.heapUsed,
          }
        }
      }

      return {
        name: task.name,
        opsPerSecond: result.hz || 0,
        avgTime: result.mean || 0,
        minTime: result.min || 0,
        maxTime: result.max || 0,
        stdDev: result.sd || 0,
        rme: result.rme || 0,
        iterations: samples.length,
        totalTime: result.totalTime || 0,
        percentiles,
        memory,
        samples: this.options.retainSamples ? samples : undefined,
        tags: this.options.tags,
        timestamp: Date.now(),
        status: 'success' as const,
      }
    })

    return this.results
  }

  /**
   * 打印结果
   */
  printResults(): void {
    this.reporter.printConsole(this.results, this.options.name)
  }

  /**
   * 获取结果
   */
  getResults(): BenchmarkResult[] {
    return this.results
  }

  /**
   * 导出结果为 JSON
   */
  toJSON(): BenchmarkReport {
    return {
      name: this.options.name,
      suites: [
        {
          name: this.options.name,
          results: this.results,
          duration: this.results.reduce((sum, r) => sum + r.totalTime, 0),
          timestamp: Date.now(),
        },
      ],
      generatedAt: new Date().toISOString(),
      environment: environmentCollector.collect(),
    }
  }
}

/**
 * 创建 Benchmark 实例
 * 
 * @param name - 基准测试名称
 * @param options - 选项
 * @returns Benchmark 实例
 * 
 * @example
 * ```ts
 * const bench = createBenchmark('Array 操作性能')
 * 
 * bench.add('push', () => {
 *   const arr = []
 *   for (let i = 0; i < 1000; i++) {
 *     arr.push(i)
 *   }
 * })
 * 
 * bench.add('spread', () => {
 *   let arr = []
 *   for (let i = 0; i < 1000; i++) {
 *     arr = [...arr, i]
 *   }
 * })
 * 
 * await bench.run()
 * bench.printResults()
 * ```
 */
export function createBenchmark(
  name: string,
  options?: Partial<Omit<BenchmarkOptions, 'name'>>,
): Benchmark {
  return new BenchmarkImpl({
    name,
    ...options,
  })
}

