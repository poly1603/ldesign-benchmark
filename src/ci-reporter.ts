/**
 * CI/CD 集成报告生成器
 * 支持 GitHub Actions、GitLab CI 等 CI 环境的输出格式
 */

import type { BenchmarkResult, BenchmarkReport, ComparisonSummary } from './types'

/**
 * GitHub Actions 注释级别
 */
export type GitHubAnnotationLevel = 'notice' | 'warning' | 'error'

/**
 * GitHub Actions 注释
 */
export interface GitHubAnnotation {
  level: GitHubAnnotationLevel
  message: string
  title?: string
  file?: string
  line?: number
}

/**
 * CI 环境类型
 */
export type CIProvider = 'github' | 'gitlab' | 'jenkins' | 'azure' | 'unknown'

/**
 * CI 报告选项
 */
export interface CIReporterOptions {
  /** CI 提供商 */
  provider?: CIProvider
  /** 是否在检测到回归时失败 */
  failOnRegression?: boolean
  /** 回归阈值百分比 */
  regressionThreshold?: number
  /** 是否生成注释 */
  annotations?: boolean
}

/**
 * CI 报告生成器
 */
export class CIReporter {
  private options: Required<CIReporterOptions>

  constructor(options: CIReporterOptions = {}) {
    this.options = {
      provider: options.provider ?? this.detectCIProvider(),
      failOnRegression: options.failOnRegression ?? true,
      regressionThreshold: options.regressionThreshold ?? 5,
      annotations: options.annotations ?? true,
    }
  }

  /**
   * 检测 CI 环境
   */
  private detectCIProvider(): CIProvider {
    if (process.env.GITHUB_ACTIONS === 'true') return 'github'
    if (process.env.GITLAB_CI === 'true') return 'gitlab'
    if (process.env.JENKINS_URL) return 'jenkins'
    if (process.env.TF_BUILD === 'True') return 'azure'
    return 'unknown'
  }

  /**
   * 生成 GitHub Actions 注释
   * 
   * @param results - 基准测试结果
   * @param baseline - 基线报告（可选）
   * @returns GitHub Actions 注释数组
   */
  generateGitHubAnnotations(
    results: BenchmarkResult[],
    baseline?: BenchmarkReport
  ): GitHubAnnotation[] {
    const annotations: GitHubAnnotation[] = []

    // 如果有基线，进行对比
    if (baseline) {
      const comparison = this.compareWithBaseline(results, baseline)

      // 为每个回归生成错误注释
      comparison.regressions.forEach(regression => {
        annotations.push({
          level: 'error',
          title: `性能回归: ${regression.task}`,
          message: `性能下降 ${Math.abs(regression.improvement).toFixed(2)}% (${regression.baselineOps.toFixed(0)} → ${regression.currentOps.toFixed(0)} ops/sec)`,
        })
      })

      // 为每个提升生成通知注释
      comparison.improvements.forEach(improvement => {
        annotations.push({
          level: 'notice',
          title: `性能提升: ${improvement.task}`,
          message: `性能提升 ${improvement.improvement.toFixed(2)}% (${improvement.baselineOps.toFixed(0)} → ${improvement.currentOps.toFixed(0)} ops/sec)`,
        })
      })
    }

    // 为失败的测试生成错误注释
    results.forEach(result => {
      if (result.status === 'failed') {
        annotations.push({
          level: 'error',
          title: `测试失败: ${result.name}`,
          message: result.error || '测试执行失败',
        })
      } else if (result.status === 'timeout') {
        annotations.push({
          level: 'warning',
          title: `测试超时: ${result.name}`,
          message: `测试执行超时 (${result.iterations} 次迭代已完成)`,
        })
      }
    })

    return annotations
  }

  /**
   * 输出 GitHub Actions 注释到控制台
   * 
   * @param annotations - 注释数组
   */
  printGitHubAnnotations(annotations: GitHubAnnotation[]): void {
    annotations.forEach(annotation => {
      const { level, title, message, file, line } = annotation

      // GitHub Actions 命令格式: ::level file={file},line={line},title={title}::{message}
      let command = `::${level} `

      const params: string[] = []
      if (file) params.push(`file=${file}`)
      if (line) params.push(`line=${line}`)
      if (title) params.push(`title=${title}`)

      if (params.length > 0) {
        command += params.join(',')
      }

      command += `::${message}`

      console.log(command)
    })
  }

  /**
   * 生成 CI 摘要
   * 
   * @param results - 基准测试结果
   * @param comparison - 对比摘要（可选）
   * @returns 摘要文本
   */
  generateSummary(
    results: BenchmarkResult[],
    comparison?: ComparisonSummary
  ): string {
    const lines: string[] = []

    lines.push('# 📊 基准测试报告')
    lines.push('')

    // 基本统计
    const successCount = results.filter(r => r.status === 'success' || !r.status).length
    const failedCount = results.filter(r => r.status === 'failed').length
    const timeoutCount = results.filter(r => r.status === 'timeout').length

    lines.push('## 📈 测试统计')
    lines.push('')
    lines.push(`- 总测试数: ${results.length}`)
    lines.push(`- ✅ 成功: ${successCount}`)
    if (failedCount > 0) lines.push(`- ❌ 失败: ${failedCount}`)
    if (timeoutCount > 0) lines.push(`- ⏱️ 超时: ${timeoutCount}`)
    lines.push('')

    // 性能对比
    if (comparison) {
      lines.push('## 🔄 性能对比')
      lines.push('')
      lines.push(`- 总对比数: ${comparison.summary.totalComparisons}`)
      lines.push(`- 📈 提升: ${comparison.summary.improvements}`)
      lines.push(`- 📉 回归: ${comparison.summary.regressions}`)
      lines.push(`- 平均变化: ${comparison.summary.avgImprovement > 0 ? '+' : ''}${comparison.summary.avgImprovement.toFixed(2)}%`)
      lines.push('')

      if (comparison.comparisons.length > 0) {
        lines.push('### 详细对比')
        lines.push('')
        lines.push('| 任务 | 基线 ops/sec | 当前 ops/sec | 变化 |')
        lines.push('|------|-------------|-------------|------|')

        comparison.comparisons.forEach(c => {
          const emoji = c.improvement > 5 ? '📈' : c.improvement < -5 ? '📉' : '➡️'
          const change = c.improvement > 0 ? `+${c.improvement.toFixed(1)}%` : `${c.improvement.toFixed(1)}%`
          lines.push(`| ${c.task} | ${c.baselineOps.toFixed(0)} | ${c.currentOps.toFixed(0)} | ${emoji} ${change} |`)
        })
        lines.push('')
      }
    }

    // 测试结果
    lines.push('## 📋 测试结果')
    lines.push('')
    lines.push('| 任务 | ops/sec | 平均时间 (ms) | ±RME | 状态 |')
    lines.push('|------|---------|--------------|------|------|')

    results.forEach(result => {
      const statusEmoji = result.status === 'failed' ? '❌' :
        result.status === 'timeout' ? '⏱️' : '✅'
      const opsFormatted = this.formatOps(result.opsPerSecond)
      lines.push(`| ${result.name} | ${opsFormatted} | ${result.avgTime.toFixed(4)} | ±${result.rme.toFixed(2)}% | ${statusEmoji} |`)
    })

    return lines.join('\n')
  }

  /**
   * 检查是否应该失败
   * 
   * @param comparison - 对比摘要
   * @param threshold - 阈值百分比
   * @returns 是否应该失败
   */
  shouldFail(
    comparison: ComparisonSummary,
    threshold?: number
  ): boolean {
    if (!this.options.failOnRegression) {
      return false
    }

    const actualThreshold = threshold ?? this.options.regressionThreshold

    // 检查是否有超过阈值的回归
    return comparison.comparisons.some(c =>
      c.improvement < -actualThreshold
    )
  }

  /**
   * 与基线对比
   */
  private compareWithBaseline(
    results: BenchmarkResult[],
    baseline: BenchmarkReport
  ): {
    regressions: Array<{
      task: string
      improvement: number
      baselineOps: number
      currentOps: number
    }>
    improvements: Array<{
      task: string
      improvement: number
      baselineOps: number
      currentOps: number
    }>
  } {
    const regressions: Array<{
      task: string
      improvement: number
      baselineOps: number
      currentOps: number
    }> = []
    const improvements: Array<{
      task: string
      improvement: number
      baselineOps: number
      currentOps: number
    }> = []

    // 遍历当前结果
    for (const result of results) {
      // 在基线中查找对应的结果
      let baselineResult: BenchmarkResult | undefined

      for (const suite of baseline.suites) {
        baselineResult = suite.results.find(r => r.name === result.name)
        if (baselineResult) break
      }

      if (!baselineResult) continue

      // 计算改进百分比
      const improvement = ((result.opsPerSecond - baselineResult.opsPerSecond) / baselineResult.opsPerSecond) * 100

      const comparison = {
        task: result.name,
        improvement,
        baselineOps: baselineResult.opsPerSecond,
        currentOps: result.opsPerSecond,
      }

      if (improvement < -this.options.regressionThreshold) {
        regressions.push(comparison)
      } else if (improvement > this.options.regressionThreshold) {
        improvements.push(comparison)
      }
    }

    return { regressions, improvements }
  }

  /**
   * 格式化 ops/sec
   */
  private formatOps(ops: number): string {
    if (ops >= 1_000_000) {
      return `${(ops / 1_000_000).toFixed(2)}M`
    }
    if (ops >= 1_000) {
      return `${(ops / 1_000).toFixed(2)}K`
    }
    return ops.toFixed(2)
  }

  /**
   * 输出 CI 报告
   * 
   * @param results - 基准测试结果
   * @param baseline - 基线报告（可选）
   * @returns 是否应该失败（用于退出码）
   */
  report(
    results: BenchmarkResult[],
    baseline?: BenchmarkReport
  ): boolean {
    let comparison: ComparisonSummary | undefined

    // 如果有基线，生成对比
    if (baseline) {
      comparison = this.generateComparison(results, baseline)
    }

    // 生成并输出摘要
    const summary = this.generateSummary(results, comparison)
    console.log(summary)

    // 如果启用了注释，生成并输出注释
    if (this.options.annotations && this.options.provider === 'github') {
      const annotations = this.generateGitHubAnnotations(results, baseline)
      if (annotations.length > 0) {
        console.log('\n## GitHub Actions 注释\n')
        this.printGitHubAnnotations(annotations)
      }
    }

    // 检查是否应该失败
    if (comparison) {
      return this.shouldFail(comparison)
    }

    // 检查是否有失败的测试
    return results.some(r => r.status === 'failed')
  }

  /**
   * 生成完整的对比摘要
   */
  private generateComparison(
    results: BenchmarkResult[],
    baseline: BenchmarkReport
  ): ComparisonSummary {
    const comparisons: Array<{
      suite: string
      task: string
      baselineOps: number
      currentOps: number
      improvement: number
      isRegression: boolean
      isImprovement: boolean
      baselineAvgTime: number
      currentAvgTime: number
    }> = []

    // 遍历当前结果
    for (const result of results) {
      // 在基线中查找对应的结果
      let baselineResult: BenchmarkResult | undefined
      let suiteName = 'default'

      for (const suite of baseline.suites) {
        baselineResult = suite.results.find(r => r.name === result.name)
        if (baselineResult) {
          suiteName = suite.name
          break
        }
      }

      if (!baselineResult) continue

      // 计算改进百分比
      const improvement = ((result.opsPerSecond - baselineResult.opsPerSecond) / baselineResult.opsPerSecond) * 100

      comparisons.push({
        suite: suiteName,
        task: result.name,
        baselineOps: baselineResult.opsPerSecond,
        currentOps: result.opsPerSecond,
        improvement,
        isRegression: improvement < -this.options.regressionThreshold,
        isImprovement: improvement > this.options.regressionThreshold,
        baselineAvgTime: baselineResult.avgTime,
        currentAvgTime: result.avgTime,
      })
    }

    // 计算汇总统计
    const improvements = comparisons.filter(c => c.isImprovement).length
    const regressions = comparisons.filter(c => c.isRegression).length
    const avgImprovement = comparisons.length > 0
      ? comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length
      : 0

    return {
      baseline: baseline.generatedAt,
      current: new Date().toISOString(),
      comparisons,
      summary: {
        totalComparisons: comparisons.length,
        improvements,
        regressions,
        avgImprovement,
      },
    }
  }
}
