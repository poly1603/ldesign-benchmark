/**
 * 增强的性能分析器
 *
 * 提供统计分析、异常值检测、置信区间计算、火焰图数据导出和优化建议生成
 */

import { PerformanceAnalyzer, PerformanceAnalysis } from './analyzer.js'
import type { BenchmarkResult } from './types.js'

/**
 * 异常值检测结果
 */
export interface OutlierResult {
  /** 检测到的异常值 */
  outliers: number[]
  /** 异常值的索引 */
  outlierIndices: number[]
  /** 清洗后的样本数据 */
  cleanedSamples: number[]
  /** 使用的检测方法 */
  method: 'iqr' | 'zscore'
  /** 检测阈值 */
  threshold: number
}

/**
 * 置信区间结果
 */
export interface ConfidenceInterval {
  /** 下界 */
  lower: number
  /** 上界 */
  upper: number
  /** 样本均值 */
  mean: number
  /** 置信水平 (0.90, 0.95, 0.99) */
  level: number
  /** 误差边界 */
  marginOfError: number
}

/**
 * 统计分析结果
 */
export interface StatisticalAnalysis {
  /** 置信区间 */
  confidenceInterval: ConfidenceInterval
  /** 异常值检测结果 */
  outliers: OutlierResult
  /** 分布类型 */
  distribution: 'normal' | 'skewed' | 'bimodal' | 'unknown'
  /** 偏度 */
  skewness: number
  /** 峰度 */
  kurtosis: number
}

/**
 * 火焰图节点
 */
export interface FlameGraphNode {
  /** 节点名称 */
  name: string
  /** 节点值（时间或计数） */
  value: number
  /** 子节点 */
  children: FlameGraphNode[]
}

/**
 * 性能分析数据（用于火焰图）
 */
export interface ProfileData {
  /** 函数名称 */
  name: string
  /** 执行时间（毫秒） */
  duration: number
  /** 调用栈 */
  stack?: string[]
  /** 子调用 */
  children?: ProfileData[]
}

/**
 * GC 事件
 */
export interface GCEvent {
  /** GC 类型 */
  type: 'minor' | 'major'
  /** 时间戳 */
  timestamp: number
  /** 持续时间（毫秒） */
  duration: number
  /** GC 前堆大小 */
  heapBefore: number
  /** GC 后堆大小 */
  heapAfter: number
}

/**
 * GC 分析结果
 */
export interface GCAnalysis {
  /** 总 GC 时间 */
  totalGCTime: number
  /** GC 次数 */
  gcCount: number
  /** 平均 GC 持续时间 */
  avgGCDuration: number
  /** 回收的内存量 */
  memoryReclaimed: number
  /** GC 压力等级 */
  gcPressure: 'low' | 'medium' | 'high'
  /** 优化建议 */
  recommendations: string[]
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  /** 建议类型 */
  type: 'memory' | 'cpu' | 'io' | 'algorithm' | 'gc' | 'general'
  /** 优先级 */
  priority: 'low' | 'medium' | 'high' | 'critical'
  /** 标题 */
  title: string
  /** 详细描述 */
  description: string
  /** 预期改进 */
  expectedImprovement?: string
  /** 相关指标 */
  relatedMetrics?: string[]
}

/**
 * 增强的性能分析器
 */
export class EnhancedAnalyzer extends PerformanceAnalyzer {
  /**
   * 检测异常值
   *
   * @param samples - 样本数据
   * @param method - 检测方法 ('iqr' 或 'zscore')
   * @param threshold - 阈值（IQR 方法默认 1.5，Z-score 方法默认 3）
   * @returns 异常值检测结果
   */
  detectOutliers(
    samples: readonly number[],
    method: 'iqr' | 'zscore' = 'iqr',
    threshold?: number
  ): OutlierResult {
    if (samples.length === 0) {
      return {
        outliers: [],
        outlierIndices: [],
        cleanedSamples: [],
        method,
        threshold: threshold ?? (method === 'iqr' ? 1.5 : 3)
      }
    }

    if (method === 'iqr') {
      return this.detectOutliersIQR(samples, threshold ?? 1.5)
    } else {
      return this.detectOutliersZScore(samples, threshold ?? 3)
    }
  }

  /**
   * 使用 IQR（四分位距）方法检测异常值
   */
  private detectOutliersIQR(samples: readonly number[], threshold: number): OutlierResult {
    const sorted = [...samples].sort((a, b) => a - b)
    const n = sorted.length

    // 计算四分位数
    const q1Index = Math.floor(n * 0.25)
    const q3Index = Math.floor(n * 0.75)
    const q1 = sorted[q1Index]
    const q3 = sorted[q3Index]
    const iqr = q3 - q1

    // 计算边界
    const lowerBound = q1 - threshold * iqr
    const upperBound = q3 + threshold * iqr

    const outliers: number[] = []
    const outlierIndices: number[] = []
    const cleanedSamples: number[] = []

    samples.forEach((value, index) => {
      if (value < lowerBound || value > upperBound) {
        outliers.push(value)
        outlierIndices.push(index)
      } else {
        cleanedSamples.push(value)
      }
    })

    return {
      outliers,
      outlierIndices,
      cleanedSamples,
      method: 'iqr',
      threshold
    }
  }

  /**
   * 使用 Z-score 方法检测异常值
   */
  private detectOutliersZScore(samples: readonly number[], threshold: number): OutlierResult {
    const mean = this.calculateMean(samples)
    const stdDev = this.calculateStdDev(samples, mean)

    const outliers: number[] = []
    const outlierIndices: number[] = []
    const cleanedSamples: number[] = []

    // 如果标准差为 0，则没有异常值
    if (stdDev === 0) {
      return {
        outliers: [],
        outlierIndices: [],
        cleanedSamples: [...samples],
        method: 'zscore',
        threshold
      }
    }

    samples.forEach((value, index) => {
      const zScore = Math.abs((value - mean) / stdDev)
      if (zScore > threshold) {
        outliers.push(value)
        outlierIndices.push(index)
      } else {
        cleanedSamples.push(value)
      }
    })

    return {
      outliers,
      outlierIndices,
      cleanedSamples,
      method: 'zscore',
      threshold
    }
  }

  /**
   * 计算置信区间
   *
   * @param samples - 样本数据
   * @param confidenceLevel - 置信水平 (0.90, 0.95, 0.99)
   * @returns 置信区间结果
   */
  calculateConfidenceInterval(
    samples: number[],
    confidenceLevel: number = 0.95
  ): ConfidenceInterval {
    if (samples.length === 0) {
      return {
        lower: 0,
        upper: 0,
        mean: 0,
        level: confidenceLevel,
        marginOfError: 0
      }
    }

    const mean = this.calculateMean(samples)
    const stdDev = this.calculateStdDev(samples, mean)
    const n = samples.length

    // Z 值对应不同置信水平
    const zValues: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576
    }

    const z = zValues[confidenceLevel] ?? 1.96
    const standardError = stdDev / Math.sqrt(n)
    const marginOfError = z * standardError

    return {
      lower: mean - marginOfError,
      upper: mean + marginOfError,
      mean,
      level: confidenceLevel,
      marginOfError
    }
  }

  /**
   * 执行完整的统计分析
   *
   * @param samples - 样本数据
   * @returns 统计分析结果
   */
  analyzeStatistics(samples: number[]): StatisticalAnalysis {
    const outliers = this.detectOutliers(samples, 'iqr')
    const confidenceInterval = this.calculateConfidenceInterval(outliers.cleanedSamples)
    const skewness = this.calculateSkewness(samples)
    const kurtosis = this.calculateKurtosis(samples)
    const distribution = this.determineDistribution(skewness, kurtosis)

    return {
      confidenceInterval,
      outliers,
      distribution,
      skewness,
      kurtosis
    }
  }

  /**
   * 生成火焰图数据
   *
   * @param profileData - 性能分析数据
   * @returns 火焰图节点数组
   */
  generateFlameGraphData(profileData: ProfileData[]): FlameGraphNode[] {
    return profileData.map(data => this.convertToFlameGraphNode(data))
  }

  /**
   * 将性能数据转换为火焰图节点
   */
  private convertToFlameGraphNode(data: ProfileData): FlameGraphNode {
    return {
      name: data.name,
      value: data.duration,
      children: data.children
        ? data.children.map(child => this.convertToFlameGraphNode(child))
        : []
    }
  }

  /**
   * 导出火焰图数据为 JSON 格式
   *
   * @param profileData - 性能分析数据
   * @returns JSON 字符串
   */
  exportFlameGraphJSON(profileData: ProfileData[]): string {
    const flameGraphData = this.generateFlameGraphData(profileData)
    return JSON.stringify(flameGraphData, null, 2)
  }

  /**
   * 分析 GC 事件
   *
   * @param gcEvents - GC 事件列表
   * @returns GC 分析结果
   */
  analyzeGCEvents(gcEvents: GCEvent[]): GCAnalysis {
    if (gcEvents.length === 0) {
      return {
        totalGCTime: 0,
        gcCount: 0,
        avgGCDuration: 0,
        memoryReclaimed: 0,
        gcPressure: 'low',
        recommendations: ['GC 活动正常，无需优化']
      }
    }

    const totalGCTime = gcEvents.reduce((sum, event) => sum + event.duration, 0)
    const gcCount = gcEvents.length
    const avgGCDuration = totalGCTime / gcCount
    const memoryReclaimed = gcEvents.reduce(
      (sum, event) => sum + (event.heapBefore - event.heapAfter),
      0
    )

    // 确定 GC 压力等级
    let gcPressure: 'low' | 'medium' | 'high'
    if (avgGCDuration > 100 || gcCount > 50) {
      gcPressure = 'high'
    } else if (avgGCDuration > 50 || gcCount > 20) {
      gcPressure = 'medium'
    } else {
      gcPressure = 'low'
    }

    const recommendations = this.generateGCRecommendations(gcEvents, gcPressure)

    return {
      totalGCTime,
      gcCount,
      avgGCDuration,
      memoryReclaimed,
      gcPressure,
      recommendations
    }
  }

  /**
   * 生成 GC 优化建议
   */
  private generateGCRecommendations(
    gcEvents: GCEvent[],
    pressure: 'low' | 'medium' | 'high'
  ): string[] {
    const recommendations: string[] = []

    if (pressure === 'high') {
      recommendations.push('GC 压力较高，建议检查内存泄漏')
      recommendations.push('考虑增加堆内存大小 (--max-old-space-size)')
      recommendations.push('优化对象创建，减少临时对象')
    } else if (pressure === 'medium') {
      recommendations.push('GC 活动适中，可以考虑优化内存使用')
      recommendations.push('使用对象池减少对象创建')
    } else {
      recommendations.push('GC 活动正常')
    }

    // 检查 major GC 频率
    const majorGCCount = gcEvents.filter(e => e.type === 'major').length
    if (majorGCCount > gcEvents.length * 0.3) {
      recommendations.push('Major GC 频率较高，建议优化长生命周期对象的管理')
    }

    return recommendations
  }

  /**
   * 基于检测到的模式生成优化建议
   *
   * @param results - 基准测试结果
   * @param analysis - 性能分析结果
   * @returns 优化建议列表
   */
  generateOptimizationSuggestions(
    results: BenchmarkResult[],
    analysis?: PerformanceAnalysis
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = []

    for (const result of results) {
      // 检查高变异性
      if (result.rme > 5) {
        suggestions.push({
          type: 'general',
          priority: 'medium',
          title: '高变异性检测',
          description: `任务 "${result.name}" 的相对误差 (${result.rme.toFixed(2)}%) 较高，表明性能不稳定`,
          expectedImprovement: '减少变异性可提高测试可靠性',
          relatedMetrics: ['rme', 'stdDev']
        })
      }

      // 检查低吞吐量
      if (result.opsPerSecond < 100) {
        suggestions.push({
          type: 'algorithm',
          priority: 'high',
          title: '低吞吐量警告',
          description: `任务 "${result.name}" 的吞吐量 (${result.opsPerSecond.toFixed(2)} ops/sec) 较低`,
          expectedImprovement: '优化算法可能显著提升性能',
          relatedMetrics: ['opsPerSecond', 'avgTime']
        })
      }

      // 检查内存问题
      if (result.memory && result.memory.delta > 10 * 1024 * 1024) {
        suggestions.push({
          type: 'memory',
          priority: 'high',
          title: '内存增长警告',
          description: `任务 "${result.name}" 的内存增长 (${this.formatBytesEnhanced(result.memory.delta)}) 较大`,
          expectedImprovement: '减少内存分配可降低 GC 压力',
          relatedMetrics: ['memory.delta', 'memory.heapUsed']
        })
      }

      // 检查样本数据中的异常值
      if (result.samples && result.samples.length > 0) {
        const outlierResult = this.detectOutliers(result.samples)
        if (outlierResult.outliers.length > result.samples.length * 0.1) {
          suggestions.push({
            type: 'general',
            priority: 'medium',
            title: '异常值过多',
            description: `任务 "${result.name}" 有 ${outlierResult.outliers.length} 个异常值 (${((outlierResult.outliers.length / result.samples.length) * 100).toFixed(1)}%)`,
            expectedImprovement: '减少异常值可提高测试准确性',
            relatedMetrics: ['samples']
          })
        }
      }

      // 检查 P95/P99 与平均值的差距
      if (result.percentiles) {
        const p95Ratio = result.percentiles.p95 / result.avgTime
        if (p95Ratio > 2) {
          suggestions.push({
            type: 'general',
            priority: 'medium',
            title: '尾部延迟警告',
            description: `任务 "${result.name}" 的 P95 (${result.percentiles.p95.toFixed(2)}ms) 是平均值的 ${p95Ratio.toFixed(1)} 倍`,
            expectedImprovement: '优化尾部延迟可改善用户体验',
            relatedMetrics: ['percentiles.p95', 'avgTime']
          })
        }
      }
    }

    // 基于性能分析结果添加建议
    if (analysis) {
      if (analysis.memory.percentage > 80) {
        suggestions.push({
          type: 'memory',
          priority: 'critical',
          title: '内存使用率过高',
          description: `内存使用率达到 ${analysis.memory.percentage.toFixed(1)}%`,
          expectedImprovement: '降低内存使用可避免 OOM 错误',
          relatedMetrics: ['memory.used', 'memory.total']
        })
      }

      if (analysis.cpu.user + analysis.cpu.system > 1000) {
        suggestions.push({
          type: 'cpu',
          priority: 'high',
          title: 'CPU 使用时间过长',
          description: `CPU 使用时间 ${(analysis.cpu.user + analysis.cpu.system).toFixed(2)}ms`,
          expectedImprovement: '优化 CPU 密集型操作可提升性能',
          relatedMetrics: ['cpu.user', 'cpu.system']
        })
      }
    }

    // 按优先级排序
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    return suggestions
  }

  /**
   * 计算样本均值
   */
  private calculateMean(samples: readonly number[]): number {
    if (samples.length === 0) return 0
    return samples.reduce((sum, val) => sum + val, 0) / samples.length
  }

  /**
   * 计算样本标准差
   */
  private calculateStdDev(samples: readonly number[], mean?: number): number {
    if (samples.length < 2) return 0
    const m = mean ?? this.calculateMean(samples)
    const squaredDiffs = samples.map(val => Math.pow(val - m, 2))
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (samples.length - 1)
    return Math.sqrt(variance)
  }

  /**
   * 计算偏度
   */
  private calculateSkewness(samples: readonly number[]): number {
    if (samples.length < 3) return 0
    const mean = this.calculateMean(samples)
    const stdDev = this.calculateStdDev(samples, mean)
    if (stdDev === 0) return 0

    const n = samples.length
    const cubedDiffs = samples.map(val => Math.pow((val - mean) / stdDev, 3))
    const sum = cubedDiffs.reduce((acc, val) => acc + val, 0)

    return (n / ((n - 1) * (n - 2))) * sum
  }

  /**
   * 计算峰度
   */
  private calculateKurtosis(samples: readonly number[]): number {
    if (samples.length < 4) return 0
    const mean = this.calculateMean(samples)
    const stdDev = this.calculateStdDev(samples, mean)
    if (stdDev === 0) return 0

    const n = samples.length
    const fourthPowerDiffs = samples.map(val => Math.pow((val - mean) / stdDev, 4))
    const sum = fourthPowerDiffs.reduce((acc, val) => acc + val, 0)

    // 使用 excess kurtosis（正态分布为 0）
    const kurtosis =
      ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
      (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3))

    return kurtosis
  }

  /**
   * 确定分布类型
   */
  private determineDistribution(
    skewness: number,
    kurtosis: number
  ): 'normal' | 'skewed' | 'bimodal' | 'unknown' {
    // 正态分布：偏度接近 0，峰度接近 0
    if (Math.abs(skewness) < 0.5 && Math.abs(kurtosis) < 1) {
      return 'normal'
    }

    // 偏态分布：偏度绝对值较大
    if (Math.abs(skewness) > 1) {
      return 'skewed'
    }

    // 双峰分布：峰度为负且较大
    if (kurtosis < -1) {
      return 'bimodal'
    }

    return 'unknown'
  }

  /**
   * 格式化字节大小（增强版）
   */
  private formatBytesEnhanced(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = Math.abs(bytes)
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    const sign = bytes < 0 ? '-' : ''
    return `${sign}${size.toFixed(2)} ${units[unitIndex]}`
  }
}

/**
 * 创建增强的性能分析器实例
 */
export function createEnhancedAnalyzer(): EnhancedAnalyzer {
  return new EnhancedAnalyzer()
}
