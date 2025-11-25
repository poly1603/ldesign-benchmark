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
} from './types'
import { BenchmarkReporter } from './reporter'

/**
 * Benchmark 实现类
 */
export class BenchmarkImpl implements Benchmark {
  private bench: Bench
  private results: BenchmarkResult[] = []
  private reporter: BenchmarkReporter

  constructor(private options: BenchmarkOptions) {
    // 使用 tinybench 默认配置
    this.bench = new Bench()

    this.reporter = new BenchmarkReporter()
  }

  /**
   * 添加测试任务
   */
  add(name: string, fn: BenchmarkTask): this {
    this.bench.add(name, fn)
    return this
  }

  /**
   * 运行所有任务
   */
  async run(): Promise<BenchmarkResult[]> {
    await this.bench.run()

    this.results = this.bench.tasks.map((task) => {
      const result = task.result!
      return {
        name: task.name,
        opsPerSecond: result.hz || 0,
        avgTime: result.mean || 0,
        minTime: result.min || 0,
        maxTime: result.max || 0,
        stdDev: result.sd || 0,
        rme: result.rme || 0,
        iterations: result.samples?.length || 0,
        totalTime: result.totalTime || 0,
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
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
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

