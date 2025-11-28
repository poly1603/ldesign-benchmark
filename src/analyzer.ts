/**
 * 性能分析工具
 * 
 * 提供深入的性能分析和优化建议
 */
import { performance, PerformanceObserver } from 'node:perf_hooks'

export interface PerformanceAnalysis {
  /** 内存使用情况 */
  memory: {
    used: number
    total: number
    percentage: number
  }

  /** CPU 使用情况 */
  cpu: {
    user: number
    system: number
  }

  /** 执行时间分析 */
  timing: {
    total: number
    setup: number
    execution: number
    teardown: number
  }

  /** 性能瓶颈 */
  bottlenecks: PerformanceBottleneck[]

  /** 优化建议 */
  recommendations: string[]
}

export interface PerformanceBottleneck {
  /** 瓶颈类型 */
  type: 'memory' | 'cpu' | 'io' | 'gc' | 'event-loop'

  /** 严重程度 */
  severity: 'low' | 'medium' | 'high' | 'critical'

  /** 描述 */
  description: string

  /** 影响的任务 */
  affectedTasks: string[]

  /** 建议的解决方案 */
  solution: string
}

export class PerformanceAnalyzer {
  private measurements: Map<string, any> = new Map()
  private observer?: PerformanceObserver

  /**
   * 开始性能分析
   */
  startAnalysis(taskName: string): void {
    const startMemory = process.memoryUsage()
    const startCpu = process.cpuUsage()
    const startTime = performance.now()

    this.measurements.set(taskName, {
      startMemory,
      startCpu,
      startTime,
      marks: []
    })

    // 设置性能观察器
    this.setupPerformanceObserver(taskName)
  }

  /**
   * 结束性能分析
   */
  endAnalysis(taskName: string): PerformanceAnalysis {
    const measurement = this.measurements.get(taskName)
    if (!measurement) {
      throw new Error(`未找到任务 ${taskName} 的性能测量数据`)
    }

    const endMemory = process.memoryUsage()
    const endCpu = process.cpuUsage(measurement.startCpu)
    const endTime = performance.now()

    // 清理观察器
    this.cleanupPerformanceObserver()

    const memoryUsed = endMemory.heapUsed - measurement.startMemory.heapUsed
    const memoryTotal = endMemory.heapTotal
    const memoryPercentage = (memoryUsed / memoryTotal) * 100

    const totalTime = endTime - measurement.startTime

    const analysis: PerformanceAnalysis = {
      memory: {
        used: memoryUsed,
        total: memoryTotal,
        percentage: memoryPercentage
      },
      cpu: {
        user: endCpu.user / 1000, // 转换为毫秒
        system: endCpu.system / 1000
      },
      timing: {
        total: totalTime,
        setup: 0, // 需要实际测量
        execution: totalTime,
        teardown: 0 // 需要实际测量
      },
      bottlenecks: this.identifyBottlenecks(taskName, measurement, {
        memoryUsed,
        memoryPercentage,
        cpuUsage: endCpu,
        totalTime
      }),
      recommendations: this.generateRecommendations(taskName, {
        memoryUsed,
        memoryPercentage,
        cpuUsage: endCpu,
        totalTime
      })
    }

    return analysis
  }

  /**
   * 添加性能标记
   */
  mark(taskName: string, markName: string): void {
    const measurement = this.measurements.get(taskName)
    if (measurement) {
      measurement.marks.push({
        name: markName,
        time: performance.now()
      })
    }
  }

  /**
   * 设置性能观察器
   */
  private setupPerformanceObserver(taskName: string): void {
    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      entries.forEach(entry => {
        if (entry.entryType === 'measure') {
          this.mark(taskName, `measure:${entry.name}`)
        } else if (entry.entryType === 'mark') {
          this.mark(taskName, `mark:${entry.name}`)
        }
      })
    })

    this.observer.observe({ entryTypes: ['measure', 'mark'] })
  }

  /**
   * 清理性能观察器
   */
  private cleanupPerformanceObserver(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = undefined
    }
  }

  /**
   * 识别性能瓶颈
   */
  private identifyBottlenecks(
    taskName: string,
    _measurement: any,
    metrics: any
  ): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = []

    // 内存瓶颈检测
    if (metrics.memoryUsed > 100 * 1024 * 1024) { // 100MB
      bottlenecks.push({
        type: 'memory',
        severity: 'high',
        description: '内存使用量过高',
        affectedTasks: [taskName],
        solution: '考虑优化内存使用，避免内存泄漏，使用对象池等技术'
      })
    } else if (metrics.memoryPercentage > 80) {
      bottlenecks.push({
        type: 'memory',
        severity: 'medium',
        description: '内存使用率较高',
        affectedTasks: [taskName],
        solution: '监控内存使用，考虑内存优化'
      })
    }

    // CPU 瓶颈检测
    const totalCpu = metrics.cpuUsage.user + metrics.cpuUsage.system
    if (totalCpu > 1000) { // 1秒 CPU 时间
      bottlenecks.push({
        type: 'cpu',
        severity: 'high',
        description: 'CPU 使用时间过长',
        affectedTasks: [taskName],
        solution: '优化算法复杂度，考虑使用 Worker 线程分担计算'
      })
    }

    // 执行时间瓶颈
    if (metrics.totalTime > 5000) { // 5秒
      bottlenecks.push({
        type: 'event-loop',
        severity: 'critical',
        description: '执行时间过长，可能阻塞事件循环',
        affectedTasks: [taskName],
        solution: '将长任务拆分为小块，使用异步处理，避免阻塞事件循环'
      })
    } else if (metrics.totalTime > 1000) { // 1秒
      bottlenecks.push({
        type: 'event-loop',
        severity: 'medium',
        description: '执行时间较长',
        affectedTasks: [taskName],
        solution: '考虑优化执行效率'
      })
    }

    return bottlenecks
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    taskName: string,
    metrics: any
  ): string[] {
    const recommendations: string[] = []

    // 内存优化建议
    if (metrics.memoryUsed > 50 * 1024 * 1024) {
      recommendations.push(
        `任务 "${taskName}" 内存使用较高 (${this.formatBytes(metrics.memoryUsed)})，建议：` +
        `\n  • 检查是否有内存泄漏` +
        `\n  • 使用对象池复用对象` +
        `\n  • 及时释放不再使用的引用`
      )
    }

    // CPU 优化建议
    const totalCpu = metrics.cpuUsage.user + metrics.cpuUsage.system
    if (totalCpu > 500) {
      recommendations.push(
        `任务 "${taskName}" CPU 使用较高 (${totalCpu.toFixed(2)}ms)，建议：` +
        `\n  • 优化算法时间复杂度` +
        `\n  • 使用缓存减少重复计算` +
        `\n  • 考虑使用 Worker 线程`
      )
    }

    // 执行时间优化建议
    if (metrics.totalTime > 1000) {
      recommendations.push(
        `任务 "${taskName}" 执行时间较长 (${metrics.totalTime.toFixed(2)}ms)，建议：` +
        `\n  • 分析性能热点进行针对性优化` +
        `\n  • 使用性能分析工具定位瓶颈` +
        `\n  • 考虑异步处理或分批执行`
      )
    }

    // 如果没有明显问题，给出一般性建议
    if (recommendations.length === 0) {
      recommendations.push(
        `任务 "${taskName}" 性能表现良好，可以关注：` +
        `\n  • 持续监控性能变化` +
        `\n  • 定期进行性能测试` +
        `\n  • 关注内存使用趋势`
      )
    }

    return recommendations
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  /**
   * 生成性能分析报告
   */
  generateReport(analysis: PerformanceAnalysis, taskName: string): string {
    let report = `# 性能分析报告: ${taskName}

## 📊 性能概览

### 内存使用
- 使用内存: ${this.formatBytes(analysis.memory.used)}
- 总内存: ${this.formatBytes(analysis.memory.total)}
- 使用率: ${analysis.memory.percentage.toFixed(2)}%

### CPU 使用
- 用户时间: ${analysis.cpu.user.toFixed(2)}ms
- 系统时间: ${analysis.cpu.system.toFixed(2)}ms

### 执行时间
- 总时间: ${analysis.timing.total.toFixed(2)}ms
- 执行时间: ${analysis.timing.execution.toFixed(2)}ms

`

    // 瓶颈分析
    if (analysis.bottlenecks.length > 0) {
      report += `## 🚨 性能瓶颈\n\n`
      analysis.bottlenecks.forEach(bottleneck => {
        const severityIcon = {
          low: '🔵',
          medium: '🟡',
          high: '🟠',
          critical: '🔴'
        }[bottleneck.severity]

        report += `${severityIcon} **${bottleneck.type.toUpperCase()} 瓶颈** (${bottleneck.severity})\n`
        report += `- 描述: ${bottleneck.description}\n`
        report += `- 影响: ${bottleneck.affectedTasks.join(', ')}\n`
        report += `- 建议: ${bottleneck.solution}\n\n`
      })
    } else {
      report += `## ✅ 无显著性能瓶颈\n\n`
    }

    // 优化建议
    report += `## 💡 优化建议\n\n`
    analysis.recommendations.forEach(rec => {
      report += `${rec}\n\n`
    })

    return report
  }

  /**
   * 比较多个分析结果
   */
  compareAnalyses(analyses: Map<string, PerformanceAnalysis>): string {
    let comparison = `# 性能分析对比报告\n\n`

    const tasks = Array.from(analyses.keys())

    comparison += `## 📈 性能指标对比\n\n`
    comparison += `| 任务 | 内存使用 | CPU 时间 | 执行时间 | 瓶颈数量 |\n`
    comparison += `|------|----------|----------|----------|----------|\n`

    tasks.forEach(taskName => {
      const analysis = analyses.get(taskName)!
      comparison += `| ${taskName} `
      comparison += `| ${this.formatBytes(analysis.memory.used)} `
      comparison += `| ${(analysis.cpu.user + analysis.cpu.system).toFixed(2)}ms `
      comparison += `| ${analysis.timing.total.toFixed(2)}ms `
      comparison += `| ${analysis.bottlenecks.length} |\n`
    })

    // 找出性能最差的任务
    const worstTask = tasks.reduce((worst, current) => {
      const currentAnalysis = analyses.get(current)!
      const worstAnalysis = analyses.get(worst)!

      const currentScore = currentAnalysis.timing.total +
        currentAnalysis.memory.used / (1024 * 1024) +
        (currentAnalysis.cpu.user + currentAnalysis.cpu.system)

      const worstScore = worstAnalysis.timing.total +
        worstAnalysis.memory.used / (1024 * 1024) +
        (worstAnalysis.cpu.user + worstAnalysis.cpu.system)

      return currentScore > worstScore ? current : worst
    }, tasks[0])

    comparison += `\n## 🎯 重点关注\n\n`
    comparison += `**性能最差的任务**: ${worstTask}\n`
    comparison += `**建议**: 优先优化此任务的性能瓶颈\n`

    return comparison
  }
}

/**
 * 创建性能分析器实例
 */
export function createPerformanceAnalyzer(): PerformanceAnalyzer {
  return new PerformanceAnalyzer()
}
