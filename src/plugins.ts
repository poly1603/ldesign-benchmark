/**
 * Benchmark 插件系统
 * 
 * 提供可扩展的插件架构，支持自定义报告格式、分析工具等
 */
export interface BenchmarkPlugin {
  /** 插件名称 */
  name: string

  /** 插件版本 */
  version: string

  /** 插件描述 */
  description?: string

  /** 安装插件 */
  install?(context: PluginContext): void | Promise<void>

  /** 卸载插件 */
  uninstall?(context: PluginContext): void | Promise<void>

  /** 处理基准测试结果 */
  processResults?(results: any[], context: PluginContext): any[] | Promise<any[]>

  /** 生成自定义报告 */
  generateReport?(results: any[], context: PluginContext): string | Promise<string>

  /** 性能分析钩子 */
  onBenchmarkStart?(suite: string, task: string): void
  onBenchmarkComplete?(suite: string, task: string, result: any): void
}

export interface PluginContext {
  /** 插件管理器 */
  pluginManager: PluginManager

  /** 配置选项 */
  config: any

  /** 日志函数 */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void

  /** 工具函数 */
  utils: {
    formatOps: (ops: number) => string
    formatTime: (time: number) => string
    calculateImprovement: (baseline: number, current: number) => number
  }
}

export class PluginManager {
  private plugins: Map<string, BenchmarkPlugin> = new Map()
  private context: PluginContext

  constructor(config: any = {}) {
    this.context = {
      pluginManager: this,
      config,
      log: (message, level = 'info') => {
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
   * 注册插件
   */
  async register(plugin: BenchmarkPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      this.context.log(`插件 ${plugin.name} 已存在`, 'warn')
      return
    }

    this.plugins.set(plugin.name, plugin)

    if (plugin.install) {
      try {
        await plugin.install(this.context)
        this.context.log(`插件 ${plugin.name} 安装成功`)
      } catch (error) {
        this.context.log(`插件 ${plugin.name} 安装失败: ${error}`, 'error')
        this.plugins.delete(plugin.name)
        throw error
      }
    }
  }

  /**
   * 卸载插件
   */
  async unregister(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      this.context.log(`插件 ${pluginName} 不存在`, 'warn')
      return
    }

    if (plugin.uninstall) {
      try {
        await plugin.uninstall(this.context)
      } catch (error) {
        this.context.log(`插件 ${pluginName} 卸载失败: ${error}`, 'error')
      }
    }

    this.plugins.delete(pluginName)
    this.context.log(`插件 ${pluginName} 已卸载`)
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
   * 处理基准测试结果
   */
  async processResults(results: any[]): Promise<any[]> {
    let processedResults = [...results]

    for (const plugin of this.plugins.values()) {
      if (plugin.processResults) {
        try {
          processedResults = await plugin.processResults(processedResults, this.context)
        } catch (error) {
          this.context.log(`插件 ${plugin.name} 处理结果失败: ${error}`, 'error')
        }
      }
    }

    return processedResults
  }

  /**
   * 生成自定义报告
   */
  async generateCustomReports(results: any[]): Promise<Map<string, string>> {
    const reports = new Map<string, string>()

    for (const plugin of this.plugins.values()) {
      if (plugin.generateReport) {
        try {
          const report = await plugin.generateReport(results, this.context)
          reports.set(plugin.name, report)
        } catch (error) {
          this.context.log(`插件 ${plugin.name} 生成报告失败: ${error}`, 'error')
        }
      }
    }

    return reports
  }

  /**
   * 触发基准测试开始事件
   */
  emitBenchmarkStart(suite: string, task: string): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.onBenchmarkStart) {
        try {
          plugin.onBenchmarkStart(suite, task)
        } catch (error) {
          this.context.log(`插件 ${plugin.name} 处理开始事件失败: ${error}`, 'error')
        }
      }
    }
  }

  /**
   * 触发基准测试完成事件
   */
  emitBenchmarkComplete(suite: string, task: string, result: any): void {
    for (const plugin of this.plugins.values()) {
      if (plugin.onBenchmarkComplete) {
        try {
          plugin.onBenchmarkComplete(suite, task, result)
        } catch (error) {
          this.context.log(`插件 ${plugin.name} 处理完成事件失败: ${error}`, 'error')
        }
      }
    }
  }
}

// 内置插件示例

/**
 * 统计信息插件
 */
export class StatisticsPlugin implements BenchmarkPlugin {
  name = 'statistics'
  version = '1.0.0'
  description = '提供详细的统计信息和分析'

  private statistics: Map<string, any> = new Map()

  install(context: PluginContext): void {
    context.log('统计插件已安装')
  }

  processResults(results: any[]): any[] {
    // 计算总体统计
    const totalTasks = results.length
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

    // 添加统计信息到结果
    return results.map(result => ({
      ...result,
      statistics: {
        percentile: this.calculatePercentile(results, result),
        improvementPotential: this.calculateImprovementPotential(result, fastest)
      }
    }))
  }

  generateReport(results: any[]): string {
    const stats = this.statistics.get('overall')
    if (!stats) return ''

    return `# 性能统计报告

## 总体统计
- 总任务数: ${stats.totalTasks}
- 总操作数: ${this.formatLargeNumber(stats.totalOps)} ops/sec
- 平均操作数: ${this.formatLargeNumber(stats.avgOps)} ops/sec
- 最快任务: ${stats.fastestTask} (${this.formatLargeNumber(stats.fastestOps)} ops/sec)
- 最慢任务: ${stats.slowestTask} (${stats.slowestTime.toFixed(4)}ms)

## 性能分布
${this.generateDistributionChart(results)}
`
  }

  private calculatePercentile(results: any[], result: any): number {
    const sorted = [...results].sort((a, b) => a.opsPerSecond - b.opsPerSecond)
    const index = sorted.findIndex(r => r.name === result.name)
    return ((index + 1) / results.length) * 100
  }

  private calculateImprovementPotential(result: any, fastest: any): number {
    return ((fastest.opsPerSecond - result.opsPerSecond) / result.opsPerSecond) * 100
  }

  private formatLargeNumber(num: number): string {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toFixed(2)
  }

  private generateDistributionChart(results: any[]): string {
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

  generateReport(results: any[]): string {
    return `# 趋势分析报告

## 性能热点
${this.identifyHotspots(results)}

## 优化建议
${this.generateRecommendations(results)}
`
  }

  private identifyHotspots(results: any[]): string {
    const hotspots = results
      .filter(r => r.avgTime > 1) // 超过 1ms 的任务
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 5)

    if (hotspots.length === 0) {
      return '未发现明显的性能热点'
    }

    return hotspots.map(hotspot =>
      `- ${hotspot.name}: ${hotspot.avgTime.toFixed(4)}ms (${this.formatOps(hotspot.opsPerSecond)} ops/sec)`
    ).join('\n')
  }

  private generateRecommendations(results: any[]): string {
    const recommendations: string[] = []

    // 检测高误差任务
    const highVariance = results.filter(r => r.rme > 10)
    if (highVariance.length > 0) {
      recommendations.push(
        `以下任务误差较高，建议增加迭代次数:\n` +
        highVariance.map(r => `  - ${r.name}: ±${r.rme.toFixed(2)}%`).join('\n')
      )
    }

    // 检测慢速任务
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
    if (global.gc) {
      global.gc()
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

  processResults(results: any[]): any[] {
    return results.map(result => {
      const key = `${result.suite || 'default'}::${result.name}`
      const snapshot = this.memorySnapshots.get(key)

      if (snapshot) {
        const delta = snapshot.after - snapshot.before
        return {
          ...result,
          memoryAnalysis: {
            before: snapshot.before,
            after: snapshot.after,
            delta,
            leaked: delta > 1024 * 1024, // 超过 1MB 视为潜在泄漏
          }
        }
      }
      return result
    })
  }

  generateReport(results: any[]): string {
    const analyzed = results.filter(r => r.memoryAnalysis)
    const leaks = analyzed.filter(r => r.memoryAnalysis?.leaked)

    let report = `# 内存分析报告\n\n`
    report += `## 概览\n`
    report += `- 分析任务数: ${analyzed.length}\n`
    report += `- 潜在泄漏: ${leaks.length}\n\n`

    if (leaks.length > 0) {
      report += `## ⚠️ 潜在内存泄漏\n\n`
      leaks.forEach(r => {
        const delta = r.memoryAnalysis.delta
        report += `- **${r.name}**: +${this.formatBytes(delta)}\n`
      })
    }

    report += `\n## 内存使用详情\n\n`
    report += `| 任务 | 初始内存 | 结束内存 | 变化 |\n`
    report += `|------|----------|----------|------|\n`

    analyzed.forEach(r => {
      const ma = r.memoryAnalysis
      const delta = ma.delta
      const sign = delta >= 0 ? '+' : ''
      report += `| ${r.name} | ${this.formatBytes(ma.before)} | ${this.formatBytes(ma.after)} | ${sign}${this.formatBytes(delta)} |\n`
    })

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
  private threshold: number = 10 // 10% 性能下降视为回归

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

  processResults(results: any[]): any[] {
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
    })
  }

  generateReport(results: any[]): string {
    const analyzed = results.filter(r => r.regression)
    const regressions = analyzed.filter(r => r.regression.isRegression)
    const improvements = analyzed.filter(r => r.regression.isImprovement)

    let report = `# 回归检测报告\n\n`
    report += `## 概览\n`
    report += `- 检测阈值: ±${this.threshold}%\n`
    report += `- 分析任务数: ${analyzed.length}\n`
    report += `- 回归: ${regressions.length}\n`
    report += `- 提升: ${improvements.length}\n\n`

    if (regressions.length > 0) {
      report += `## 🔴 性能回归\n\n`
      regressions.forEach(r => {
        report += `- **${r.name}**: ${r.regression.change.toFixed(1)}% (基线: ${r.regression.baselineOps.toFixed(0)} ops/s)\n`
      })
      report += '\n'
    }

    if (improvements.length > 0) {
      report += `## 🟢 性能提升\n\n`
      improvements.forEach(r => {
        report += `- **${r.name}**: +${r.regression.change.toFixed(1)}% (基线: ${r.regression.baselineOps.toFixed(0)} ops/s)\n`
      })
    }

    return report
  }
}

/**
 * 创建默认插件管理器
 */
export function createDefaultPluginManager(): PluginManager {
  const manager = new PluginManager()

  // 注册内置插件
  manager.register(new StatisticsPlugin())
  manager.register(new TrendAnalysisPlugin())

  return manager
}

/**
 * 创建带内存分析的插件管理器
 */
export function createFullPluginManager(): PluginManager {
  const manager = new PluginManager()

  manager.register(new StatisticsPlugin())
  manager.register(new TrendAnalysisPlugin())
  manager.register(new MemoryAnalysisPlugin())

  return manager
}
