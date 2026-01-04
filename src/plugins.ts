/**
 * Benchmark 插件系统
 * 
 * 提供可扩展的插件架构，支持自定义报告格式、分析工具等
 * 支持异步插件生命周期和错误隔离
 */

import type { BenchmarkResult } from './types'

/**
 * 插件错误 - 用于标识插件执行过程中的错误
 */
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginName: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'PluginError'
  }
}

/**
 * 插件执行结果
 */
export interface PluginExecutionResult<T = void> {
  /** 插件名称 */
  pluginName: string
  /** 是否成功 */
  success: boolean
  /** 结果数据 */
  result?: T
  /** 错误信息 */
  error?: PluginError
}

/**
 * 通知消息接口
 */
export interface NotificationMessage {
  title: string
  body: string
  level: 'info' | 'warning' | 'error' | 'success'
  data?: Record<string, unknown>
}

/**
 * 通知插件接口
 */
export interface NotificationPlugin extends BenchmarkPlugin {
  notify(message: NotificationMessage): Promise<void>
}

export interface BenchmarkPlugin {
  /** 插件名称 */
  name: string

  /** 插件版本 */
  version: string

  /** 插件描述 */
  description?: string

  /** 安装插件 - 支持异步 */
  install?(context: PluginContext): void | Promise<void>

  /** 卸载插件 - 支持异步 */
  uninstall?(context: PluginContext): void | Promise<void>

  /** 处理基准测试结果 - 支持异步 */
  processResults?(results: BenchmarkResult[], context: PluginContext): BenchmarkResult[] | Promise<BenchmarkResult[]>

  /** 生成自定义报告 - 支持异步 */
  generateReport?(results: BenchmarkResult[], context: PluginContext): string | Promise<string>

  /** 性能分析钩子 - 支持异步 */
  onBenchmarkStart?(suite: string, task: string): void | Promise<void>
  onBenchmarkComplete?(suite: string, task: string, result: BenchmarkResult): void | Promise<void>

  /** 套件级别钩子 - 支持异步 */
  onSuiteStart?(suite: string): void | Promise<void>
  onSuiteComplete?(suite: string, results: BenchmarkResult[]): void | Promise<void>

  /** 运行级别钩子 - 支持异步 */
  onRunStart?(): void | Promise<void>
  onRunComplete?(results: BenchmarkResult[]): void | Promise<void>
}

export interface PluginContext {
  /** 插件管理器 */
  pluginManager: PluginManager

  /** 配置选项 */
  config: Record<string, unknown>

  /** 日志函数 */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void

  /** 工具函数 */
  utils: {
    formatOps: (ops: number) => string
    formatTime: (time: number) => string
    calculateImprovement: (baseline: number, current: number) => number
  }
}

/**
 * 插件管理器配置
 */
export interface PluginManagerOptions {
  /** 是否隔离插件错误 */
  isolateErrors?: boolean
  /** 是否启用详细日志 */
  verbose?: boolean
  /** 配置对象 */
  config?: Record<string, unknown>
}

export class PluginManager {
  private plugins: Map<string, BenchmarkPlugin> = new Map()
  private context: PluginContext
  private isolateErrors: boolean
  private verbose: boolean
  private executionResults: PluginExecutionResult[] = []

  constructor(options: PluginManagerOptions = {}) {
    this.isolateErrors = options.isolateErrors ?? true
    this.verbose = options.verbose ?? false

    this.context = {
      pluginManager: this,
      config: options.config ?? {},
      log: (message, level = 'info') => {
        if (!this.verbose && level === 'info') return
        const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'
        console.log(`${prefix} [Plugin] ${message}`)
      },
      utils: {
        formatOps: (ops: number) => {
          if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
          if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
          return ops.toFixed(2)
        },
        formatTime: (time: number) => {
          if (time < 1) return `${(time * 1000).toFixed(2)}μs`
          return `${time.toFixed(4)}ms`
        },
        calculateImprovement: (baseline: number, current: number) => {
          return ((current - baseline) / baseline) * 100
        }
      }
    }
  }

  /**
   * 注册插件 - 支持异步安装
   */
  async register(plugin: BenchmarkPlugin): Promise<PluginExecutionResult> {
    if (this.plugins.has(plugin.name)) {
      this.context.log(`插件 ${plugin.name} 已存在`, 'warn')
      return {
        pluginName: plugin.name,
        success: false,
        error: new PluginError(`插件 ${plugin.name} 已存在`, plugin.name)
      }
    }

    this.plugins.set(plugin.name, plugin)

    if (plugin.install) {
      try {
        await Promise.resolve(plugin.install(this.context))
        this.context.log(`插件 ${plugin.name} 安装成功`)
        return { pluginName: plugin.name, success: true }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        const pluginError = new PluginError(
          `插件 ${plugin.name} 安装失败: ${error.message}`,
          plugin.name,
          error
        )
        this.context.log(pluginError.message, 'error')
        this.plugins.delete(plugin.name)

        if (!this.isolateErrors) {
          throw pluginError
        }
        return { pluginName: plugin.name, success: false, error: pluginError }
      }
    }

    return { pluginName: plugin.name, success: true }
  }

  /**
   * 卸载插件 - 支持异步卸载
   */
  async unregister(pluginName: string): Promise<PluginExecutionResult> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      this.context.log(`插件 ${pluginName} 不存在`, 'warn')
      return {
        pluginName,
        success: false,
        error: new PluginError(`插件 ${pluginName} 不存在`, pluginName)
      }
    }

    if (plugin.uninstall) {
      try {
        await Promise.resolve(plugin.uninstall(this.context))
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        const pluginError = new PluginError(
          `插件 ${pluginName} 卸载失败: ${error.message}`,
          pluginName,
          error
        )
        this.context.log(pluginError.message, 'error')

        if (!this.isolateErrors) {
          throw pluginError
        }
        // 即使卸载失败，也从列表中移除
        this.plugins.delete(pluginName)
        return { pluginName, success: false, error: pluginError }
      }
    }

    this.plugins.delete(pluginName)
    this.context.log(`插件 ${pluginName} 已卸载`)
    return { pluginName, success: true }
  }

  /**
   * 获取所有插件
   */
  getPlugins(): BenchmarkPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取特定插件
   */
  getPlugin(name: string): BenchmarkPlugin | undefined {
    return this.plugins.get(name)
  }

  /**
   * 获取最近的执行结果
   */
  getExecutionResults(): PluginExecutionResult[] {
    return [...this.executionResults]
  }

  /**
   * 清除执行结果
   */
  clearExecutionResults(): void {
    this.executionResults = []
  }

  /**
   * 安全执行插件方法 - 支持错误隔离
   */
  private async safeExecute<T>(
    pluginName: string,
    operation: string,
    fn: () => T | Promise<T>
  ): Promise<PluginExecutionResult<T>> {
    try {
      const result = await Promise.resolve(fn())
      const execResult: PluginExecutionResult<T> = {
        pluginName,
        success: true,
        result
      }
      this.executionResults.push(execResult as PluginExecutionResult)
      return execResult
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const pluginError = new PluginError(
        `插件 ${pluginName} ${operation}失败: ${error.message}`,
        pluginName,
        error
      )
      this.context.log(pluginError.message, 'error')

      const execResult: PluginExecutionResult<T> = {
        pluginName,
        success: false,
        error: pluginError
      }
      this.executionResults.push(execResult as PluginExecutionResult)

      if (!this.isolateErrors) {
        throw pluginError
      }
      return execResult
    }
  }

  /**
   * 处理基准测试结果 - 支持异步和错误隔离
   */
  async processResults(results: BenchmarkResult[]): Promise<BenchmarkResult[]> {
    let processedResults = [...results]

    for (const plugin of this.plugins.values()) {
      if (plugin.processResults) {
        const execResult = await this.safeExecute(
          plugin.name,
          '处理结果',
          () => plugin.processResults!(processedResults, this.context)
        )
        if (execResult.success && execResult.result) {
          processedResults = execResult.result
        }
      }
    }

    return processedResults
  }

  /**
   * 生成自定义报告 - 支持异步和错误隔离
   */
  async generateCustomReports(results: BenchmarkResult[]): Promise<Map<string, string>> {
    const reports = new Map<string, string>()

    for (const plugin of this.plugins.values()) {
      if (plugin.generateReport) {
        const execResult = await this.safeExecute(
          plugin.name,
          '生成报告',
          () => plugin.generateReport!(results, this.context)
        )
        if (execResult.success && execResult.result) {
          reports.set(plugin.name, execResult.result)
        }
      }
    }

    return reports
  }

  /**
   * 触发运行开始事件 - 支持异步和错误隔离
   */
  async emitRunStart(): Promise<PluginExecutionResult[]> {
    const results: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onRunStart) {
        const result = await this.safeExecute(
          plugin.name,
          '处理运行开始事件',
          () => plugin.onRunStart!()
        )
        results.push(result)
      }
    }

    return results
  }

  /**
   * 触发运行完成事件 - 支持异步和错误隔离
   */
  async emitRunComplete(results: BenchmarkResult[]): Promise<PluginExecutionResult[]> {
    const execResults: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onRunComplete) {
        const result = await this.safeExecute(
          plugin.name,
          '处理运行完成事件',
          () => plugin.onRunComplete!(results)
        )
        execResults.push(result)
      }
    }

    return execResults
  }

  /**
   * 触发套件开始事件 - 支持异步和错误隔离
   */
  async emitSuiteStart(suite: string): Promise<PluginExecutionResult[]> {
    const results: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onSuiteStart) {
        const result = await this.safeExecute(
          plugin.name,
          '处理套件开始事件',
          () => plugin.onSuiteStart!(suite)
        )
        results.push(result)
      }
    }

    return results
  }

  /**
   * 触发套件完成事件 - 支持异步和错误隔离
   */
  async emitSuiteComplete(suite: string, results: BenchmarkResult[]): Promise<PluginExecutionResult[]> {
    const execResults: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onSuiteComplete) {
        const result = await this.safeExecute(
          plugin.name,
          '处理套件完成事件',
          () => plugin.onSuiteComplete!(suite, results)
        )
        execResults.push(result)
      }
    }

    return execResults
  }

  /**
   * 触发基准测试开始事件 - 支持异步和错误隔离
   */
  async emitBenchmarkStart(suite: string, task: string): Promise<PluginExecutionResult[]> {
    const results: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onBenchmarkStart) {
        const result = await this.safeExecute(
          plugin.name,
          '处理开始事件',
          () => plugin.onBenchmarkStart!(suite, task)
        )
        results.push(result)
      }
    }

    return results
  }

  /**
   * 触发基准测试完成事件 - 支持异步和错误隔离
   */
  async emitBenchmarkComplete(suite: string, task: string, result: BenchmarkResult): Promise<PluginExecutionResult[]> {
    const execResults: PluginExecutionResult[] = []

    for (const plugin of this.plugins.values()) {
      if (plugin.onBenchmarkComplete) {
        const execResult = await this.safeExecute(
          plugin.name,
          '处理完成事件',
          () => plugin.onBenchmarkComplete!(suite, task, result)
        )
        execResults.push(execResult)
      }
    }

    return execResults
  }
}


// 内置插件

/**
 * 统计信息插件
 */
export class StatisticsPlugin implements BenchmarkPlugin {
  name = 'statistics'
  version = '1.0.0'
  description = '提供详细的统计信息和分析'

  private statistics: Map<string, Record<string, unknown>> = new Map()

  install(context: PluginContext): void {
    context.log('统计插件已安装')
  }

  processResults(results: BenchmarkResult[]): BenchmarkResult[] {
    const totalTasks = results.length
    if (totalTasks === 0) return results

    const totalOps = results.reduce((sum, r) => sum + r.opsPerSecond, 0)
    const avgOps = totalOps / totalTasks
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )
    const slowest = results.reduce((prev, curr) =>
      curr.avgTime > prev.avgTime ? curr : prev
    )

    this.statistics.set('overall', {
      totalTasks,
      totalOps,
      avgOps,
      fastestTask: fastest.name,
      fastestOps: fastest.opsPerSecond,
      slowestTask: slowest.name,
      slowestTime: slowest.avgTime
    })

    return results.map(result => ({
      ...result,
      statistics: {
        percentile: this.calculatePercentile(results, result),
        improvementPotential: this.calculateImprovementPotential(result, fastest)
      }
    })) as BenchmarkResult[]
  }

  generateReport(results: BenchmarkResult[]): string {
    const stats = this.statistics.get('overall')
    if (!stats) return ''

    return `# 性能统计报告

## 总体统计
- 总任务数: ${stats.totalTasks}
- 总操作数: ${this.formatLargeNumber(stats.totalOps as number)} ops/sec
- 平均操作数: ${this.formatLargeNumber(stats.avgOps as number)} ops/sec
- 最快任务: ${stats.fastestTask} (${this.formatLargeNumber(stats.fastestOps as number)} ops/sec)
- 最慢任务: ${stats.slowestTask} (${(stats.slowestTime as number).toFixed(4)}ms)

## 性能分布
${this.generateDistributionChart(results)}
`
  }

  private calculatePercentile(results: BenchmarkResult[], result: BenchmarkResult): number {
    const sorted = [...results].sort((a, b) => a.opsPerSecond - b.opsPerSecond)
    const index = sorted.findIndex(r => r.name === result.name)
    return ((index + 1) / results.length) * 100
  }

  private calculateImprovementPotential(result: BenchmarkResult, fastest: BenchmarkResult): number {
    return ((fastest.opsPerSecond - result.opsPerSecond) / result.opsPerSecond) * 100
  }

  private formatLargeNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toFixed(2)
  }

  private generateDistributionChart(results: BenchmarkResult[]): string {
    const buckets = [0, 1000, 10000, 100000, 1000000, Infinity]
    const distribution = new Array(buckets.length - 1).fill(0)

    results.forEach(result => {
      for (let i = 0; i < buckets.length - 1; i++) {
        if (result.opsPerSecond >= buckets[i] && result.opsPerSecond < buckets[i + 1]) {
          distribution[i]++
          break
        }
      }
    })

    let chart = ''
    distribution.forEach((count, i) => {
      const range = i === buckets.length - 2
        ? `≥${this.formatLargeNumber(buckets[i])}`
        : `${this.formatLargeNumber(buckets[i])}-${this.formatLargeNumber(buckets[i + 1])}`

      const bar = '█'.repeat(Math.ceil((count / results.length) * 20))
      chart += `${range}: ${bar} (${count})\n`
    })

    return chart
  }
}


/**
 * 趋势分析插件
 */
export class TrendAnalysisPlugin implements BenchmarkPlugin {
  name = 'trend-analysis'
  version = '1.0.0'
  description = '分析性能趋势和回归检测'

  install(context: PluginContext): void {
    context.log('趋势分析插件已安装')
  }

  generateReport(results: BenchmarkResult[]): string {
    return `# 趋势分析报告

## 性能热点
${this.identifyHotspots(results)}

## 优化建议
${this.generateRecommendations(results)}
`
  }

  private identifyHotspots(results: BenchmarkResult[]): string {
    const hotspots = results
      .filter(r => r.avgTime > 1)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5)

    if (hotspots.length === 0) {
      return '未发现明显的性能热点'
    }

    return hotspots.map(hotspot =>
      `- ${hotspot.name}: ${hotspot.avgTime.toFixed(4)}ms (${this.formatOps(hotspot.opsPerSecond)} ops/sec)`
    ).join('\n')
  }

  private generateRecommendations(results: BenchmarkResult[]): string {
    const recommendations: string[] = []

    const highVariance = results.filter(r => r.rme > 10)
    if (highVariance.length > 0) {
      recommendations.push(
        `以下任务误差较高，建议增加迭代次数:\n` +
        highVariance.map(r => `  - ${r.name}: ±${r.rme.toFixed(2)}%`).join('\n')
      )
    }

    const slowTasks = results.filter(r => r.opsPerSecond < 1000)
    if (slowTasks.length > 0) {
      recommendations.push(
        `以下任务性能较低，建议优化:\n` +
        slowTasks.map(r => `  - ${r.name}: ${this.formatOps(r.opsPerSecond)} ops/sec`).join('\n')
      )
    }

    return recommendations.length > 0
      ? recommendations.join('\n\n')
      : '所有任务性能表现良好，无需特别优化'
  }

  private formatOps(ops: number): string {
    if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
    if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
    return ops.toFixed(2)
  }
}

/**
 * 内存分析插件
 */
export class MemoryAnalysisPlugin implements BenchmarkPlugin {
  name = 'memory-analysis'
  version = '1.0.0'
  description = '分析内存使用情况和潜在泄漏'

  private memorySnapshots: Map<string, { before: number; after: number }> = new Map()

  install(context: PluginContext): void {
    context.log('内存分析插件已安装')
  }

  onBenchmarkStart(suite: string, task: string): void {
    if (typeof global !== 'undefined' && typeof (global as unknown as Record<string, unknown>).gc === 'function') {
      ((global as unknown as Record<string, () => void>).gc)()
    }
    const mem = process.memoryUsage()
    this.memorySnapshots.set(`${suite}::${task}`, { before: mem.heapUsed, after: 0 })
  }

  onBenchmarkComplete(suite: string, task: string): void {
    const snapshot = this.memorySnapshots.get(`${suite}::${task}`)
    if (snapshot) {
      const mem = process.memoryUsage()
      snapshot.after = mem.heapUsed
    }
  }

  processResults(results: BenchmarkResult[]): BenchmarkResult[] {
    return results.map(result => {
      const key = `default::${result.name}`
      const snapshot = this.memorySnapshots.get(key)

      if (snapshot) {
        const delta = snapshot.after - snapshot.before
        return {
          ...result,
          memoryAnalysis: {
            before: snapshot.before,
            after: snapshot.after,
            delta,
            leaked: delta > 1024 * 1024,
          }
        }
      }
      return result
    }) as BenchmarkResult[]
  }

  generateReport(results: BenchmarkResult[]): string {
    const analyzed = results.filter(r => (r as unknown as Record<string, unknown>).memoryAnalysis)
    const leaks = analyzed.filter(r => ((r as unknown as Record<string, unknown>).memoryAnalysis as Record<string, unknown>)?.leaked)

    let report = `# 内存分析报告\n\n`
    report += `## 概览\n`
    report += `- 分析任务数: ${analyzed.length}\n`
    report += `- 潜在泄漏: ${leaks.length}\n\n`

    if (leaks.length > 0) {
      report += `## ⚠️ 潜在内存泄漏\n\n`
      leaks.forEach(r => {
        const ma = (r as unknown as Record<string, unknown>).memoryAnalysis as Record<string, number>
        report += `- **${r.name}**: +${this.formatBytes(ma.delta)}\n`
      })
    }

    return report
  }

  private formatBytes(bytes: number): string {
    const abs = Math.abs(bytes)
    if (abs >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    if (abs >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${bytes} B`
  }
}


/**
 * 回归检测插件
 */
export class RegressionDetectorPlugin implements BenchmarkPlugin {
  name = 'regression-detector'
  version = '1.0.0'
  description = '自动检测性能回归'

  private baseline: Map<string, number> = new Map()
  private threshold: number = 10

  constructor(options?: { threshold?: number; baseline?: Record<string, number> }) {
    if (options?.threshold) this.threshold = options.threshold
    if (options?.baseline) {
      Object.entries(options.baseline).forEach(([key, value]) => {
        this.baseline.set(key, value)
      })
    }
  }

  install(context: PluginContext): void {
    context.log(`回归检测插件已安装 (阈值: ${this.threshold}%)`)
  }

  setBaseline(taskName: string, opsPerSecond: number): void {
    this.baseline.set(taskName, opsPerSecond)
  }

  processResults(results: BenchmarkResult[]): BenchmarkResult[] {
    return results.map(result => {
      const baselineOps = this.baseline.get(result.name)

      if (baselineOps !== undefined) {
        const change = ((result.opsPerSecond - baselineOps) / baselineOps) * 100
        const isRegression = change < -this.threshold
        const isImprovement = change > this.threshold

        return {
          ...result,
          regression: {
            baselineOps,
            change,
            isRegression,
            isImprovement,
            status: isRegression ? 'regression' : isImprovement ? 'improvement' : 'stable'
          }
        }
      }
      return result
    }) as BenchmarkResult[]
  }

  generateReport(results: BenchmarkResult[]): string {
    const analyzed = results.filter(r => (r as unknown as Record<string, unknown>).regression)
    const regressions = analyzed.filter(r => ((r as unknown as Record<string, unknown>).regression as Record<string, unknown>).isRegression)
    const improvements = analyzed.filter(r => ((r as unknown as Record<string, unknown>).regression as Record<string, unknown>).isImprovement)

    let report = `# 回归检测报告\n\n`
    report += `## 概览\n`
    report += `- 检测阈值: ±${this.threshold}%\n`
    report += `- 分析任务数: ${analyzed.length}\n`
    report += `- 回归: ${regressions.length}\n`
    report += `- 提升: ${improvements.length}\n\n`

    if (regressions.length > 0) {
      report += `## 🔴 性能回归\n\n`
      regressions.forEach(r => {
        const reg = (r as unknown as Record<string, unknown>).regression as Record<string, number>
        report += `- **${r.name}**: ${reg.change.toFixed(1)}% (基线: ${reg.baselineOps.toFixed(0)} ops/s)\n`
      })
      report += '\n'
    }

    if (improvements.length > 0) {
      report += `## 🟢 性能提升\n\n`
      improvements.forEach(r => {
        const reg = (r as unknown as Record<string, unknown>).regression as Record<string, number>
        report += `- **${r.name}**: +${reg.change.toFixed(1)}% (基线: ${reg.baselineOps.toFixed(0)} ops/s)\n`
      })
    }

    return report
  }
}


/**
 * Slack 通知插件配置
 */
export interface SlackNotificationOptions {
  /** Webhook URL */
  webhookUrl: string
  /** 频道名称 (可选) */
  channel?: string
  /** 用户名 (可选) */
  username?: string
  /** 图标 emoji (可选) */
  iconEmoji?: string
  /** 是否只在失败时通知 */
  onlyOnFailure?: boolean
  /** 性能回归阈值 (百分比) */
  regressionThreshold?: number
}

/**
 * Slack 通知插件
 */
export class SlackNotificationPlugin implements NotificationPlugin {
  name = 'slack-notification'
  version = '1.0.0'
  description = 'Slack 通知插件 - 发送基准测试结果到 Slack'

  private options: SlackNotificationOptions
  private startTime: number = 0

  constructor(options: SlackNotificationOptions) {
    this.options = {
      username: 'Benchmark Bot',
      iconEmoji: ':chart_with_upwards_trend:',
      onlyOnFailure: false,
      regressionThreshold: 10,
      ...options
    }
  }

  async install(context: PluginContext): Promise<void> {
    context.log('Slack 通知插件已安装')
  }

  onRunStart(): void {
    this.startTime = Date.now()
  }

  async onRunComplete(results: BenchmarkResult[]): Promise<void> {
    const duration = Date.now() - this.startTime
    const hasRegressions = this.detectRegressions(results)

    if (this.options.onlyOnFailure && !hasRegressions) {
      return
    }

    await this.notify({
      title: hasRegressions ? '⚠️ 性能回归检测' : '✅ 基准测试完成',
      body: this.formatResultsSummary(results, duration),
      level: hasRegressions ? 'warning' : 'success',
      data: { results, duration }
    })
  }

  async notify(message: NotificationMessage): Promise<void> {
    const color = this.getColorForLevel(message.level)

    const payload = {
      channel: this.options.channel,
      username: this.options.username,
      icon_emoji: this.options.iconEmoji,
      attachments: [{
        color,
        title: message.title,
        text: message.body,
        footer: 'LDesign Benchmark',
        ts: Math.floor(Date.now() / 1000)
      }]
    }

    try {
      const response = await fetch(this.options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Slack API 返回错误: ${response.status}`)
      }
    } catch (error) {
      throw new PluginError(
        `发送 Slack 通知失败: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        error instanceof Error ? error : undefined
      )
    }
  }

  private detectRegressions(results: BenchmarkResult[]): boolean {
    return results.some(r => {
      const regression = (r as unknown as Record<string, unknown>).regression as Record<string, unknown> | undefined
      return regression?.isRegression === true
    })
  }

  private formatResultsSummary(results: BenchmarkResult[], duration: number): string {
    const totalTasks = results.length
    const avgOps = results.reduce((sum, r) => sum + r.opsPerSecond, 0) / totalTasks
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )

    return `📊 *测试摘要*
• 任务数: ${totalTasks}
• 平均性能: ${this.formatOps(avgOps)} ops/sec
• 最快任务: ${fastest.name} (${this.formatOps(fastest.opsPerSecond)} ops/sec)
• 总耗时: ${(duration / 1000).toFixed(2)}s`
  }

  private formatOps(ops: number): string {
    if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
    if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
    return ops.toFixed(2)
  }

  private getColorForLevel(level: NotificationMessage['level']): string {
    switch (level) {
      case 'success': return '#36a64f'
      case 'warning': return '#ff9800'
      case 'error': return '#dc3545'
      default: return '#2196f3'
    }
  }
}


/**
 * Discord 通知插件配置
 */
export interface DiscordNotificationOptions {
  /** Webhook URL */
  webhookUrl: string
  /** 用户名 (可选) */
  username?: string
  /** 头像 URL (可选) */
  avatarUrl?: string
  /** 是否只在失败时通知 */
  onlyOnFailure?: boolean
  /** 性能回归阈值 (百分比) */
  regressionThreshold?: number
}

/**
 * Discord 通知插件
 */
export class DiscordNotificationPlugin implements NotificationPlugin {
  name = 'discord-notification'
  version = '1.0.0'
  description = 'Discord 通知插件 - 发送基准测试结果到 Discord'

  private options: DiscordNotificationOptions
  private startTime: number = 0

  constructor(options: DiscordNotificationOptions) {
    this.options = {
      username: 'Benchmark Bot',
      onlyOnFailure: false,
      regressionThreshold: 10,
      ...options
    }
  }

  async install(context: PluginContext): Promise<void> {
    context.log('Discord 通知插件已安装')
  }

  onRunStart(): void {
    this.startTime = Date.now()
  }

  async onRunComplete(results: BenchmarkResult[]): Promise<void> {
    const duration = Date.now() - this.startTime
    const hasRegressions = this.detectRegressions(results)

    if (this.options.onlyOnFailure && !hasRegressions) {
      return
    }

    await this.notify({
      title: hasRegressions ? '⚠️ 性能回归检测' : '✅ 基准测试完成',
      body: this.formatResultsSummary(results, duration),
      level: hasRegressions ? 'warning' : 'success',
      data: { results, duration }
    })
  }

  async notify(message: NotificationMessage): Promise<void> {
    const color = this.getColorForLevel(message.level)

    const payload = {
      username: this.options.username,
      avatar_url: this.options.avatarUrl,
      embeds: [{
        title: message.title,
        description: message.body,
        color,
        footer: {
          text: 'LDesign Benchmark'
        },
        timestamp: new Date().toISOString()
      }]
    }

    try {
      const response = await fetch(this.options.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Discord API 返回错误: ${response.status}`)
      }
    } catch (error) {
      throw new PluginError(
        `发送 Discord 通知失败: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        error instanceof Error ? error : undefined
      )
    }
  }

  private detectRegressions(results: BenchmarkResult[]): boolean {
    return results.some(r => {
      const regression = (r as unknown as Record<string, unknown>).regression as Record<string, unknown> | undefined
      return regression?.isRegression === true
    })
  }

  private formatResultsSummary(results: BenchmarkResult[], duration: number): string {
    const totalTasks = results.length
    const avgOps = results.reduce((sum, r) => sum + r.opsPerSecond, 0) / totalTasks
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )

    return `📊 **测试摘要**
• 任务数: ${totalTasks}
• 平均性能: ${this.formatOps(avgOps)} ops/sec
• 最快任务: ${fastest.name} (${this.formatOps(fastest.opsPerSecond)} ops/sec)
• 总耗时: ${(duration / 1000).toFixed(2)}s`
  }

  private formatOps(ops: number): string {
    if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`
    if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`
    return ops.toFixed(2)
  }

  private getColorForLevel(level: NotificationMessage['level']): number {
    switch (level) {
      case 'success': return 0x36a64f
      case 'warning': return 0xff9800
      case 'error': return 0xdc3545
      default: return 0x2196f3
    }
  }
}


/**
 * 创建默认插件管理器
 */
export function createDefaultPluginManager(options?: PluginManagerOptions): PluginManager {
  const manager = new PluginManager(options)
  return manager
}

/**
 * 创建带内置插件的插件管理器
 */
export async function createPluginManagerWithBuiltins(options?: PluginManagerOptions): Promise<PluginManager> {
  const manager = new PluginManager(options)

  await manager.register(new StatisticsPlugin())
  await manager.register(new TrendAnalysisPlugin())

  return manager
}

/**
 * 创建带完整插件的插件管理器
 */
export async function createFullPluginManager(options?: PluginManagerOptions): Promise<PluginManager> {
  const manager = new PluginManager(options)

  await manager.register(new StatisticsPlugin())
  await manager.register(new TrendAnalysisPlugin())
  await manager.register(new MemoryAnalysisPlugin())

  return manager
}
