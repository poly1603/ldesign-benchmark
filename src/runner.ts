/**
 * Benchmark Runner
 * 
 * 用于批量运行多个 benchmark 套件
 */

import type {
  Benchmark,
  BenchmarkReport,
  BenchmarkSuite,
  BenchmarkThresholds,
} from './types'

/**
 * Benchmark Runner 类
 * 
 * 负责运行多个 benchmark 套件并生成汇总报告
 */
export class BenchmarkRunner {
  private suites: Map<string, Benchmark> = new Map()

  /**
   * 添加 benchmark 套件
   * 
   * @param name - 套件名称
   * @param benchmark - Benchmark 实例
   */
  addSuite(name: string, benchmark: Benchmark): this {
    this.suites.set(name, benchmark)
    return this
  }

  /**
   * 运行所有套件
   * 
   * @returns 汇总报告
   */
  async runAll(): Promise<BenchmarkReport> {
    const suites: BenchmarkSuite[] = []
    const startTime = Date.now()

    for (const [name, benchmark] of this.suites) {
      console.log(`\n🏃 运行套件: ${name}`)
      const suiteStart = Date.now()

      const results = await benchmark.run()
      benchmark.printResults()

      suites.push({
        name,
        results,
        duration: Date.now() - suiteStart,
        timestamp: Date.now(),
      })
    }

    const totalDuration = Date.now() - startTime

    console.log(`\n✅ 所有套件运行完成 (${totalDuration}ms)`)

    return {
      name: 'Benchmark Report',
      suites,
      generatedAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
    }
  }

  /**
   * 打印汇总报告
   * 
   * @param report - 报告数据
   */
  printSummary(report: BenchmarkReport): void {
    console.log('\n' + '='.repeat(80))
    console.log('📊 Benchmark 汇总报告')
    console.log('='.repeat(80))

    console.log(`\n环境信息:`)
    console.log(`  平台: ${report.environment.platform}`)
    console.log(`  架构: ${report.environment.arch}`)
    console.log(`  Node: ${report.environment.nodeVersion}`)

    console.log(`\n套件统计:`)
    console.log(`  总套件数: ${report.suites.length}`)
    console.log(`  总任务数: ${report.suites.reduce((sum, s) => sum + s.results.length, 0)}`)
    console.log(`  总耗时: ${report.suites.reduce((sum, s) => sum + s.duration, 0)}ms`)

    console.log(`\n生成时间: ${report.generatedAt}`)
    console.log('='.repeat(80))
  }

  /**
   * 导出报告为 JSON
   * 
   * @param report - 报告数据
   * @param filepath - 文件路径
   */
  async exportJSON(report: BenchmarkReport, filepath: string): Promise<void> {
    const fs = await import('node:fs/promises')
    await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8')
    console.log(`\n✅ 报告已导出: ${filepath}`)
  }
}

export interface ThresholdFailure {
  suite: string
  task: string
  reasons: string[]
}

export interface ThresholdCheckResult {
  passed: boolean
  failures: ThresholdFailure[]
}

export function checkThresholds(
  report: BenchmarkReport,
  thresholds: BenchmarkThresholds,
): ThresholdCheckResult {
  const failures: ThresholdFailure[] = []

  for (const suite of report.suites) {
    for (const result of suite.results) {
      const keyWithSuite = `${suite.name}::${result.name}`
      const keyTaskOnly = result.name

      const threshold =
        thresholds[keyWithSuite] !== undefined
          ? thresholds[keyWithSuite]
          : thresholds[keyTaskOnly]

      if (!threshold) continue

      const reasons: string[] = []

      if (
        typeof threshold.maxAvgTime === 'number' &&
        result.avgTime > threshold.maxAvgTime
      ) {
        reasons.push(
          `avgTime ${result.avgTime.toFixed(4)}ms > maxAvgTime ${threshold.maxAvgTime}ms`,
        )
      }

      if (
        typeof threshold.minOpsPerSecond === 'number' &&
        result.opsPerSecond < threshold.minOpsPerSecond
      ) {
        reasons.push(
          `opsPerSecond ${result.opsPerSecond.toFixed(2)} < minOpsPerSecond ${threshold.minOpsPerSecond}`,
        )
      }

      if (typeof threshold.maxRme === 'number' && result.rme > threshold.maxRme) {
        reasons.push(`rme ${result.rme.toFixed(2)}% > maxRme ${threshold.maxRme}%`)
      }

      if (reasons.length > 0) {
        failures.push({
          suite: suite.name,
          task: result.name,
          reasons,
        })
      }
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  }
}

/**
 * 创建 Benchmark Runner 实例
 * 
 * @returns BenchmarkRunner 实例
 * 
 * @example
 * ```ts
 * import { createBenchmark, createRunner } from '@ldesign/benchmark'
 * 
 * const runner = createRunner()
 * 
 * const bench1 = createBenchmark('Array 操作')
 * bench1.add('push', () => { ... })
 * bench1.add('concat', () => { ... })
 * 
 * const bench2 = createBenchmark('Object 操作')
 * bench2.add('assign', () => { ... })
 * bench2.add('spread', () => { ... })
 * 
 * runner.addSuite('Array', bench1)
 * runner.addSuite('Object', bench2)
 * 
 * const report = await runner.runAll()
 * runner.printSummary(report)
 * await runner.exportJSON(report, './benchmark-report.json')
 * ```
 */
export function createRunner(): BenchmarkRunner {
  return new BenchmarkRunner()
}

