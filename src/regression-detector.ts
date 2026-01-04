/**
 * 性能回归检测器
 * 用于对比基线和当前基准测试结果，检测性能回归
 */

import type { BenchmarkResult, BenchmarkReport, ComparisonResult, ComparisonSummary } from './types'

/**
 * 回归检测选项
 */
export interface RegressionDetectorOptions {
  /** 回归阈值百分比 */
  threshold?: number
  /** 是否只检测显著变化 */
  significantOnly?: boolean
}

/**
 * 性能回归检测器
 */
export class RegressionDetector {
  private threshold: number
  private significantOnly: boolean

  constructor(options: RegressionDetectorOptions = {}) {
    this.threshold = options.threshold ?? 5
    this.significantOnly = options.significantOnly ?? false
  }

  /**
   * 对比两个报告
   * 
   * @param baseline - 基线报告
   * @param current - 当前报告
   * @returns 对比摘要
   */
  compare(baseline: BenchmarkReport, current: BenchmarkReport): ComparisonSummary {
    const comparisons: ComparisonResult[] = []

    // 遍历当前报告的所有套件
    for (const currentSuite of current.suites) {
      // 在基线中查找对应的套件
      const baselineSuite = baseline.suites.find(s => s.name === currentSuite.name)
      if (!baselineSuite) continue

      // 对比套件中的每个任务
      for (const currentResult of currentSuite.results) {
        const baselineResult = baselineSuite.results.find(r => r.name === currentResult.name)
        if (!baselineResult) continue

        // 计算改进百分比
        const improvement = this.calculateImprovement(
          baselineResult.opsPerSecond,
          currentResult.opsPerSecond
        )

        // 如果只检测显著变化，跳过不显著的
        if (this.significantOnly && Math.abs(improvement) < this.threshold) {
          continue
        }

        comparisons.push({
          suite: currentSuite.name,
          task: currentResult.name,
          baselineOps: baselineResult.opsPerSecond,
          currentOps: currentResult.opsPerSecond,
          improvement,
          isRegression: improvement < -this.threshold,
          isImprovement: improvement > this.threshold,
          baselineAvgTime: baselineResult.avgTime,
          currentAvgTime: currentResult.avgTime,
        })
      }
    }

    // 计算汇总统计
    const improvements = comparisons.filter(c => c.isImprovement).length
    const regressions = comparisons.filter(c => c.isRegression).length
    const avgImprovement = comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length
      : 0

    return {
      baseline: baseline.generatedAt,
      current: current.generatedAt,
      comparisons,
      summary: {
        totalComparisons: comparisons.length,
        improvements,
        regressions,
        avgImprovement,
      },
    }
  }

  /**
   * 对比单个结果与基线
   * 
   * @param baseline - 基线结果
   * @param current - 当前结果
   * @returns 对比结果
   */
  compareResult(baseline: BenchmarkResult, current: BenchmarkResult): ComparisonResult {
    const improvement = this.calculateImprovement(
      baseline.opsPerSecond,
      current.opsPerSecond
    )

    return {
      suite: 'default',
      task: current.name,
      baselineOps: baseline.opsPerSecond,
      currentOps: current.opsPerSecond,
      improvement,
      isRegression: improvement < -this.threshold,
      isImprovement: improvement > this.threshold,
      baselineAvgTime: baseline.avgTime,
      currentAvgTime: current.avgTime,
    }
  }

  /**
   * 计算改进百分比
   * 
   * @param baseline - 基线 ops/sec
   * @param current - 当前 ops/sec
   * @returns 改进百分比（正数表示提升，负数表示下降）
   */
  private calculateImprovement(baseline: number, current: number): number {
    if (baseline === 0) return 0
    return ((current - baseline) / baseline) * 100
  }

  /**
   * 检测是否有回归
   * 
   * @param comparison - 对比摘要
   * @returns 是否有回归
   */
  hasRegressions(comparison: ComparisonSummary): boolean {
    return comparison.summary.regressions > 0
  }

  /**
   * 获取所有回归
   * 
   * @param comparison - 对比摘要
   * @returns 回归列表
   */
  getRegressions(comparison: ComparisonSummary): ComparisonResult[] {
    return comparison.comparisons.filter(c => c.isRegression)
  }

  /**
   * 获取所有提升
   * 
   * @param comparison - 对比摘要
   * @returns 提升列表
   */
  getImprovements(comparison: ComparisonSummary): ComparisonResult[] {
    return comparison.comparisons.filter(c => c.isImprovement)
  }

  /**
   * 生成回归报告文本
   * 
   * @param comparison - 对比摘要
   * @returns 报告文本
   */
  generateReport(comparison: ComparisonSummary): string {
    const lines: string[] = []

    lines.push('# 性能回归检测报告')
    lines.push('')
    lines.push(`基线: ${new Date(comparison.baseline).toLocaleString('zh-CN')}`)
    lines.push(`当前: ${new Date(comparison.current).toLocaleString('zh-CN')}`)
    lines.push('')

    // 汇总
    lines.push('## 汇总')
    lines.push('')
    lines.push(`- 总对比数: ${comparison.summary.totalComparisons}`)
    lines.push(`- 📈 提升: ${comparison.summary.improvements}`)
    lines.push(`- 📉 回归: ${comparison.summary.regressions}`)
    lines.push(`- 平均变化: ${comparison.summary.avgImprovement > 0 ? '+' : ''}${comparison.summary.avgImprovement.toFixed(2)}%`)
    lines.push('')

    // 回归详情
    const regressions = this.getRegressions(comparison)
    if (regressions.length > 0) {
      lines.push('## ⚠️ 性能回归')
      lines.push('')
      lines.push('| 套件 | 任务 | 基线 ops/sec | 当前 ops/sec | 变化 |')
      lines.push('|------|------|-------------|-------------|------|')

      regressions.forEach(r => {
        lines.push(`| ${r.suite} | ${r.task} | ${r.baselineOps.toFixed(0)} | ${r.currentOps.toFixed(0)} | ${r.improvement.toFixed(2)}% |`)
      })
      lines.push('')
    }

    // 提升详情
    const improvements = this.getImprovements(comparison)
    if (improvements.length > 0) {
      lines.push('## ✅ 性能提升')
      lines.push('')
      lines.push('| 套件 | 任务 | 基线 ops/sec | 当前 ops/sec | 变化 |')
      lines.push('|------|------|-------------|-------------|------|')

      improvements.forEach(i => {
        lines.push(`| ${i.suite} | ${i.task} | ${i.baselineOps.toFixed(0)} | ${i.currentOps.toFixed(0)} | +${i.improvement.toFixed(2)}% |`)
      })
      lines.push('')
    }

    // 稳定的任务
    const stable = comparison.comparisons.filter(c => !c.isRegression && !c.isImprovement)
    if (stable.length > 0) {
      lines.push('## ➡️ 稳定任务')
      lines.push('')
      lines.push(`共 ${stable.length} 个任务性能保持稳定（变化小于 ±${this.threshold}%）`)
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * 设置阈值
   * 
   * @param threshold - 新的阈值百分比
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold
  }

  /**
   * 获取当前阈值
   * 
   * @returns 当前阈值百分比
   */
  getThreshold(): number {
    return this.threshold
  }
}

/**
 * 创建回归检测器
 * 
 * @param options - 选项
 * @returns 回归检测器实例
 */
export function createRegressionDetector(options?: RegressionDetectorOptions): RegressionDetector {
  return new RegressionDetector(options)
}
