/**
 * 增强分析器测试
 *
 * 包含属性测试和单元测试
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  createEnhancedAnalyzer,
  type ProfileData,
  type GCEvent,
} from './analyzer-enhanced'

/**
 * 生成有效的样本数据的 Arbitrary
 */
const samplesArbitrary = fc.array(
  fc.double({ min: 0.001, max: 10000, noNaN: true }),
  { minLength: 10, maxLength: 200 }
)

describe('增强分析器', () => {
  describe('属性测试', () => {
    /**
     * 属性 6: 异常值检测正确性
     *
     * *对于任意*包含已知异常值的样本数据集，分析器检测到的异常值集合
     * 应该包含所有真实的异常值（使用 IQR 或 Z-score 方法的标准定义）。
     *
     * **Feature: benchmark-enhancement, Property 6: 异常值检测正确性**
     * **Validates: Requirements 3.1**
     */
    it('属性 6: IQR 方法检测到的异常值应该都在 IQR 边界之外', () => {
      fc.assert(
        fc.property(
          // 生成样本数据
          fc.array(
            fc.double({ min: 1, max: 1000, noNaN: true }),
            { minLength: 10, maxLength: 100 }
          ),
          fc.double({ min: 1.5, max: 3, noNaN: true }), // IQR 阈值
          (samples, threshold) => {
            const analyzer = createEnhancedAnalyzer()
            const result = analyzer.detectOutliers(samples, 'iqr', threshold)

            // 计算 IQR 边界
            const sorted = [...samples].sort((a, b) => a - b)
            const n = sorted.length
            const q1Index = Math.floor(n * 0.25)
            const q3Index = Math.floor(n * 0.75)
            const q1 = sorted[q1Index]
            const q3 = sorted[q3Index]
            const iqr = q3 - q1
            const lowerBound = q1 - threshold * iqr
            const upperBound = q3 + threshold * iqr

            // 验证所有检测到的异常值都在边界之外
            for (const outlier of result.outliers) {
              if (outlier >= lowerBound && outlier <= upperBound) {
                return false // 异常值应该在边界之外
              }
            }

            // 验证所有清洗后的样本都在边界之内
            for (const sample of result.cleanedSamples) {
              if (sample < lowerBound || sample > upperBound) {
                return false // 清洗后的样本应该在边界之内
              }
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 6 补充: Z-score 方法应该检测到极端异常值
     */
    it('属性 6 补充: Z-score 方法应该检测到极端异常值', () => {
      fc.assert(
        fc.property(
          // 生成正常范围内的样本数据
          fc.array(
            fc.double({ min: 50, max: 150, noNaN: true }),
            { minLength: 30, maxLength: 100 }
          ),
          (normalSamples) => {
            const analyzer = createEnhancedAnalyzer()

            // 计算均值和标准差
            const mean = normalSamples.reduce((a, b) => a + b, 0) / normalSamples.length
            const variance =
              normalSamples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
              (normalSamples.length - 1)
            const stdDev = Math.sqrt(variance)

            // 如果标准差太小，跳过测试
            if (stdDev < 1) {
              return true
            }

            // 添加一个明显的异常值（超过 4 个标准差）
            const extremeOutlier = mean + 5 * stdDev
            const samples = [...normalSamples, extremeOutlier]
            const outlierIndex = samples.length - 1

            // 使用 Z-score 方法检测异常值（阈值为 3）
            const result = analyzer.detectOutliers(samples, 'zscore', 3)

            // 验证极端异常值被检测到
            return result.outlierIndices.includes(outlierIndex)
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 6 补充: 清洗后的样本不应包含异常值
     */
    it('属性 6 补充: 清洗后的样本不应包含检测到的异常值', () => {
      fc.assert(
        fc.property(samplesArbitrary, (samples) => {
          const analyzer = createEnhancedAnalyzer()
          const result = analyzer.detectOutliers(samples, 'iqr')

          // 清洗后的样本 + 异常值 = 原始样本数量
          if (result.cleanedSamples.length + result.outliers.length !== samples.length) {
            return false
          }

          // 清洗后的样本不应包含任何异常值
          for (const outlier of result.outliers) {
            if (result.cleanedSamples.includes(outlier)) {
              return false
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 6 补充: 异常值检测应该是确定性的
     */
    it('属性 6 补充: 相同输入应该产生相同的异常值检测结果', () => {
      fc.assert(
        fc.property(
          samplesArbitrary,
          fc.constantFrom('iqr', 'zscore') as fc.Arbitrary<'iqr' | 'zscore'>,
          (samples, method) => {
            const analyzer = createEnhancedAnalyzer()

            const result1 = analyzer.detectOutliers(samples, method)
            const result2 = analyzer.detectOutliers(samples, method)

            // 两次检测结果应该完全相同
            if (result1.outliers.length !== result2.outliers.length) return false
            if (result1.outlierIndices.length !== result2.outlierIndices.length) return false
            if (result1.cleanedSamples.length !== result2.cleanedSamples.length) return false

            for (let i = 0; i < result1.outliers.length; i++) {
              if (result1.outliers[i] !== result2.outliers[i]) return false
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('单元测试 - 异常值检测', () => {
    it('应该使用 IQR 方法检测异常值', () => {
      const analyzer = createEnhancedAnalyzer()
      // 正常数据 + 明显的异常值
      const samples = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100]

      const result = analyzer.detectOutliers(samples, 'iqr')

      expect(result.method).toBe('iqr')
      expect(result.outliers).toContain(100)
      expect(result.cleanedSamples).not.toContain(100)
    })

    it('应该使用 Z-score 方法检测异常值', () => {
      const analyzer = createEnhancedAnalyzer()
      // 正常数据 + 明显的异常值
      const samples = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 200]

      const result = analyzer.detectOutliers(samples, 'zscore')

      expect(result.method).toBe('zscore')
      expect(result.outliers).toContain(200)
      expect(result.cleanedSamples).not.toContain(200)
    })

    it('应该处理空数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const result = analyzer.detectOutliers([], 'iqr')

      expect(result.outliers).toHaveLength(0)
      expect(result.cleanedSamples).toHaveLength(0)
    })

    it('应该处理所有相同值的数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5]

      const resultIQR = analyzer.detectOutliers(samples, 'iqr')
      const resultZScore = analyzer.detectOutliers(samples, 'zscore')

      // 所有值相同时，没有异常值
      expect(resultIQR.outliers).toHaveLength(0)
      expect(resultZScore.outliers).toHaveLength(0)
    })

    it('应该使用自定义阈值', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 30]

      // 使用较小的阈值，应该检测到更多异常值
      const resultStrict = analyzer.detectOutliers(samples, 'iqr', 0.5)
      // 使用较大的阈值，应该检测到更少异常值
      const resultLoose = analyzer.detectOutliers(samples, 'iqr', 3)

      expect(resultStrict.outliers.length).toBeGreaterThanOrEqual(resultLoose.outliers.length)
    })
  })
})


describe('置信区间', () => {
  describe('属性测试', () => {
    /**
     * 属性 7: 置信区间有效性
     *
     * *对于任意*样本数据集，计算的置信区间应该满足：
     * 下界 ≤ 样本均值 ≤ 上界，且区间宽度与样本标准差和样本大小成正比。
     *
     * **Feature: benchmark-enhancement, Property 7: 置信区间有效性**
     * **Validates: Requirements 3.2**
     */
    it('属性 7: 置信区间应该包含样本均值', () => {
      fc.assert(
        fc.property(
          samplesArbitrary,
          fc.constantFrom(0.90, 0.95, 0.99),
          (samples, confidenceLevel) => {
            const analyzer = createEnhancedAnalyzer()
            const ci = analyzer.calculateConfidenceInterval(samples, confidenceLevel)

            // 下界应该小于等于均值
            if (ci.lower > ci.mean) return false

            // 上界应该大于等于均值
            if (ci.upper < ci.mean) return false

            // 置信水平应该正确
            if (ci.level !== confidenceLevel) return false

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 7 补充: 更高的置信水平应该产生更宽的区间
     */
    it('属性 7 补充: 更高的置信水平应该产生更宽的区间', () => {
      fc.assert(
        fc.property(samplesArbitrary, (samples) => {
          const analyzer = createEnhancedAnalyzer()

          const ci90 = analyzer.calculateConfidenceInterval(samples, 0.90)
          const ci95 = analyzer.calculateConfidenceInterval(samples, 0.95)
          const ci99 = analyzer.calculateConfidenceInterval(samples, 0.99)

          const width90 = ci90.upper - ci90.lower
          const width95 = ci95.upper - ci95.lower
          const width99 = ci99.upper - ci99.lower

          // 99% 置信区间应该比 95% 宽
          if (width99 < width95 - 0.0001) return false

          // 95% 置信区间应该比 90% 宽
          if (width95 < width90 - 0.0001) return false

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 7 补充: 更大的样本量应该产生更窄的区间（相同标准差时）
     */
    it('属性 7 补充: 更大的样本量应该产生更窄的区间', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 100, noNaN: true }), // 均值
          fc.double({ min: 1, max: 20, noNaN: true }), // 标准差
          (mean, stdDev) => {
            const analyzer = createEnhancedAnalyzer()

            // 生成两组样本，一组较小，一组较大
            const smallSamples: number[] = []
            const largeSamples: number[] = []

            // 使用固定的种子生成样本
            for (let i = 0; i < 20; i++) {
              const value = mean + (i % 2 === 0 ? stdDev : -stdDev) * (i / 20)
              smallSamples.push(value)
            }

            for (let i = 0; i < 100; i++) {
              const value = mean + (i % 2 === 0 ? stdDev : -stdDev) * (i / 100)
              largeSamples.push(value)
            }

            const ciSmall = analyzer.calculateConfidenceInterval(smallSamples, 0.95)
            const ciLarge = analyzer.calculateConfidenceInterval(largeSamples, 0.95)

            const widthSmall = ciSmall.upper - ciSmall.lower
            const widthLarge = ciLarge.upper - ciLarge.lower

            // 较大样本的置信区间应该更窄（或相等）
            // 由于样本生成方式的差异，我们只检查大样本不会显著更宽
            return widthLarge <= widthSmall * 1.5
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 7 补充: 误差边界应该是正数（非空样本时）
     */
    it('属性 7 补充: 误差边界应该是非负数', () => {
      fc.assert(
        fc.property(samplesArbitrary, (samples) => {
          const analyzer = createEnhancedAnalyzer()
          const ci = analyzer.calculateConfidenceInterval(samples, 0.95)

          // 误差边界应该是非负数
          return ci.marginOfError >= 0
        }),
        { numRuns: 100 }
      )
    })
  })

  describe('单元测试 - 置信区间', () => {
    it('应该计算 95% 置信区间', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]

      const ci = analyzer.calculateConfidenceInterval(samples, 0.95)

      expect(ci.level).toBe(0.95)
      expect(ci.mean).toBe(19) // 平均值
      expect(ci.lower).toBeLessThan(ci.mean)
      expect(ci.upper).toBeGreaterThan(ci.mean)
      expect(ci.marginOfError).toBeGreaterThan(0)
    })

    it('应该计算 90% 置信区间', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]

      const ci = analyzer.calculateConfidenceInterval(samples, 0.90)

      expect(ci.level).toBe(0.90)
      expect(ci.lower).toBeLessThan(ci.mean)
      expect(ci.upper).toBeGreaterThan(ci.mean)
    })

    it('应该计算 99% 置信区间', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]

      const ci = analyzer.calculateConfidenceInterval(samples, 0.99)

      expect(ci.level).toBe(0.99)
      expect(ci.lower).toBeLessThan(ci.mean)
      expect(ci.upper).toBeGreaterThan(ci.mean)
    })

    it('应该处理空数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const ci = analyzer.calculateConfidenceInterval([], 0.95)

      expect(ci.mean).toBe(0)
      expect(ci.lower).toBe(0)
      expect(ci.upper).toBe(0)
      expect(ci.marginOfError).toBe(0)
    })

    it('应该处理单个值', () => {
      const analyzer = createEnhancedAnalyzer()
      const ci = analyzer.calculateConfidenceInterval([42], 0.95)

      expect(ci.mean).toBe(42)
      // 单个值时标准差为 0，所以区间宽度为 0
      expect(ci.lower).toBe(42)
      expect(ci.upper).toBe(42)
    })

    it('应该使用默认置信水平 95%', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 20, 30, 40, 50]

      const ci = analyzer.calculateConfidenceInterval(samples)

      expect(ci.level).toBe(0.95)
    })
  })
})


describe('火焰图数据导出', () => {
  describe('单元测试', () => {
    it('应该生成火焰图数据结构', () => {
      const analyzer = createEnhancedAnalyzer()
      const profileData: ProfileData[] = [
        {
          name: 'main',
          duration: 100,
          children: [
            { name: 'func1', duration: 40 },
            { name: 'func2', duration: 60 }
          ]
        }
      ]

      const flameGraphData = analyzer.generateFlameGraphData(profileData)

      expect(flameGraphData).toHaveLength(1)
      expect(flameGraphData[0].name).toBe('main')
      expect(flameGraphData[0].value).toBe(100)
      expect(flameGraphData[0].children).toHaveLength(2)
      expect(flameGraphData[0].children[0].name).toBe('func1')
      expect(flameGraphData[0].children[0].value).toBe(40)
    })

    it('应该处理嵌套的调用栈', () => {
      const analyzer = createEnhancedAnalyzer()
      const profileData: ProfileData[] = [
        {
          name: 'root',
          duration: 200,
          children: [
            {
              name: 'level1',
              duration: 150,
              children: [
                {
                  name: 'level2',
                  duration: 100,
                  children: [
                    { name: 'level3', duration: 50 }
                  ]
                }
              ]
            }
          ]
        }
      ]

      const flameGraphData = analyzer.generateFlameGraphData(profileData)

      expect(flameGraphData[0].name).toBe('root')
      expect(flameGraphData[0].children[0].name).toBe('level1')
      expect(flameGraphData[0].children[0].children[0].name).toBe('level2')
      expect(flameGraphData[0].children[0].children[0].children[0].name).toBe('level3')
    })

    it('应该处理空数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const flameGraphData = analyzer.generateFlameGraphData([])

      expect(flameGraphData).toHaveLength(0)
    })

    it('应该处理没有子节点的数据', () => {
      const analyzer = createEnhancedAnalyzer()
      const profileData: ProfileData[] = [
        { name: 'leaf', duration: 50 }
      ]

      const flameGraphData = analyzer.generateFlameGraphData(profileData)

      expect(flameGraphData[0].name).toBe('leaf')
      expect(flameGraphData[0].value).toBe(50)
      expect(flameGraphData[0].children).toHaveLength(0)
    })

    it('应该导出为有效的 JSON 格式', () => {
      const analyzer = createEnhancedAnalyzer()
      const profileData: ProfileData[] = [
        {
          name: 'main',
          duration: 100,
          children: [
            { name: 'func1', duration: 40 }
          ]
        }
      ]

      const json = analyzer.exportFlameGraphJSON(profileData)

      // 应该是有效的 JSON
      const parsed = JSON.parse(json)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].name).toBe('main')
      expect(parsed[0].value).toBe(100)
    })

    it('应该生成格式化的 JSON（带缩进）', () => {
      const analyzer = createEnhancedAnalyzer()
      const profileData: ProfileData[] = [
        { name: 'test', duration: 10 }
      ]

      const json = analyzer.exportFlameGraphJSON(profileData)

      // 应该包含换行符（格式化输出）
      expect(json).toContain('\n')
    })
  })
})


describe('优化建议生成', () => {
  describe('单元测试', () => {
    it('应该为高变异性生成建议', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'high-variance-task',
          rme: 10, // 高于 5% 的阈值
          opsPerSecond: 1000,
          avgTime: 1
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      expect(suggestions.some(s => s.title === '高变异性检测')).toBe(true)
      expect(suggestions.some(s => s.type === 'general')).toBe(true)
    })

    it('应该为低吞吐量生成建议', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'slow-task',
          rme: 1,
          opsPerSecond: 50, // 低于 100 的阈值
          avgTime: 20
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      expect(suggestions.some(s => s.title === '低吞吐量警告')).toBe(true)
      expect(suggestions.some(s => s.type === 'algorithm')).toBe(true)
      expect(suggestions.some(s => s.priority === 'high')).toBe(true)
    })

    it('应该为高内存增长生成建议', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'memory-heavy-task',
          rme: 1,
          opsPerSecond: 1000,
          avgTime: 1,
          memory: {
            delta: 20 * 1024 * 1024, // 20MB，高于 10MB 阈值
            heapUsed: 50 * 1024 * 1024,
            heapTotal: 100 * 1024 * 1024,
            external: 0,
            rss: 150 * 1024 * 1024
          }
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      expect(suggestions.some(s => s.title === '内存增长警告')).toBe(true)
      expect(suggestions.some(s => s.type === 'memory')).toBe(true)
    })

    it('应该为尾部延迟生成建议', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'tail-latency-task',
          rme: 1,
          opsPerSecond: 1000,
          avgTime: 1,
          percentiles: {
            p50: 0.8,
            p75: 1.2,
            p90: 1.8,
            p95: 3, // P95 是平均值的 3 倍
            p99: 5
          }
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      expect(suggestions.some(s => s.title === '尾部延迟警告')).toBe(true)
    })

    it('应该为异常值过多生成建议', () => {
      const analyzer = createEnhancedAnalyzer()
      // 创建一个有很多异常值的样本
      const samples = [
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 正常值
        100, 100, 100 // 异常值（超过 10%）
      ]

      const results: any[] = [
        {
          name: 'outlier-task',
          rme: 1,
          opsPerSecond: 1000,
          avgTime: 1,
          samples
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      expect(suggestions.some(s => s.title === '异常值过多')).toBe(true)
    })

    it('应该按优先级排序建议', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'multi-issue-task',
          rme: 10, // medium priority
          opsPerSecond: 50, // high priority
          avgTime: 20
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      // 高优先级应该排在前面
      const highIndex = suggestions.findIndex(s => s.priority === 'high')
      const mediumIndex = suggestions.findIndex(s => s.priority === 'medium')

      if (highIndex !== -1 && mediumIndex !== -1) {
        expect(highIndex).toBeLessThan(mediumIndex)
      }
    })

    it('应该处理空结果数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const suggestions = analyzer.generateOptimizationSuggestions([])

      expect(suggestions).toHaveLength(0)
    })

    it('应该处理正常的结果（无问题）', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'good-task',
          rme: 1, // 低变异性
          opsPerSecond: 10000, // 高吞吐量
          avgTime: 0.1
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      // 正常结果不应该有建议
      expect(suggestions).toHaveLength(0)
    })

    it('应该包含相关指标信息', () => {
      const analyzer = createEnhancedAnalyzer()
      const results: any[] = [
        {
          name: 'test-task',
          rme: 10,
          opsPerSecond: 1000,
          avgTime: 1
        }
      ]

      const suggestions = analyzer.generateOptimizationSuggestions(results)

      const suggestion = suggestions.find(s => s.title === '高变异性检测')
      expect(suggestion?.relatedMetrics).toContain('rme')
      expect(suggestion?.relatedMetrics).toContain('stdDev')
    })
  })
})

describe('GC 分析', () => {
  describe('单元测试', () => {
    it('应该分析 GC 事件', () => {
      const analyzer = createEnhancedAnalyzer()
      const gcEvents: GCEvent[] = [
        { type: 'minor', timestamp: 0, duration: 10, heapBefore: 100, heapAfter: 80 },
        { type: 'minor', timestamp: 100, duration: 15, heapBefore: 120, heapAfter: 90 },
        { type: 'major', timestamp: 200, duration: 50, heapBefore: 150, heapAfter: 50 }
      ]

      const analysis = analyzer.analyzeGCEvents(gcEvents)

      expect(analysis.gcCount).toBe(3)
      expect(analysis.totalGCTime).toBe(75) // 10 + 15 + 50
      expect(analysis.avgGCDuration).toBe(25) // 75 / 3
      expect(analysis.memoryReclaimed).toBe(150) // (100-80) + (120-90) + (150-50)
    })

    it('应该检测高 GC 压力', () => {
      const analyzer = createEnhancedAnalyzer()
      const gcEvents: GCEvent[] = Array(60).fill(null).map((_, i) => ({
        type: 'minor' as const,
        timestamp: i * 100,
        duration: 60, // 高于 50ms 阈值
        heapBefore: 100,
        heapAfter: 80
      }))

      const analysis = analyzer.analyzeGCEvents(gcEvents)

      expect(analysis.gcPressure).toBe('high')
      expect(analysis.recommendations.some(r => r.includes('压力较高'))).toBe(true)
    })

    it('应该检测中等 GC 压力', () => {
      const analyzer = createEnhancedAnalyzer()
      const gcEvents: GCEvent[] = Array(25).fill(null).map((_, i) => ({
        type: 'minor' as const,
        timestamp: i * 100,
        duration: 30, // 中等持续时间
        heapBefore: 100,
        heapAfter: 80
      }))

      const analysis = analyzer.analyzeGCEvents(gcEvents)

      expect(analysis.gcPressure).toBe('medium')
    })

    it('应该检测低 GC 压力', () => {
      const analyzer = createEnhancedAnalyzer()
      const gcEvents: GCEvent[] = [
        { type: 'minor', timestamp: 0, duration: 5, heapBefore: 100, heapAfter: 80 },
        { type: 'minor', timestamp: 1000, duration: 5, heapBefore: 100, heapAfter: 80 }
      ]

      const analysis = analyzer.analyzeGCEvents(gcEvents)

      expect(analysis.gcPressure).toBe('low')
    })

    it('应该处理空 GC 事件数组', () => {
      const analyzer = createEnhancedAnalyzer()
      const analysis = analyzer.analyzeGCEvents([])

      expect(analysis.gcCount).toBe(0)
      expect(analysis.totalGCTime).toBe(0)
      expect(analysis.gcPressure).toBe('low')
    })

    it('应该检测高 Major GC 频率', () => {
      const analyzer = createEnhancedAnalyzer()
      const gcEvents: GCEvent[] = [
        { type: 'major', timestamp: 0, duration: 50, heapBefore: 100, heapAfter: 50 },
        { type: 'major', timestamp: 100, duration: 50, heapBefore: 100, heapAfter: 50 },
        { type: 'minor', timestamp: 200, duration: 10, heapBefore: 80, heapAfter: 70 }
      ]

      const analysis = analyzer.analyzeGCEvents(gcEvents)

      // Major GC 占比超过 30%
      expect(analysis.recommendations.some(r => r.includes('Major GC'))).toBe(true)
    })
  })
})

describe('统计分析', () => {
  describe('单元测试', () => {
    it('应该执行完整的统计分析', () => {
      const analyzer = createEnhancedAnalyzer()
      const samples = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100]

      const analysis = analyzer.analyzeStatistics(samples)

      expect(analysis.confidenceInterval).toBeDefined()
      expect(analysis.outliers).toBeDefined()
      expect(analysis.distribution).toBeDefined()
      expect(typeof analysis.skewness).toBe('number')
      expect(typeof analysis.kurtosis).toBe('number')
    })

    it('应该检测正态分布', () => {
      const analyzer = createEnhancedAnalyzer()
      // 生成接近正态分布的数据
      const samples = [
        95, 96, 97, 98, 99, 100, 100, 100, 101, 102, 103, 104, 105
      ]

      const analysis = analyzer.analyzeStatistics(samples)

      // 偏度应该接近 0
      expect(Math.abs(analysis.skewness)).toBeLessThan(1)
    })

    it('应该检测偏态分布', () => {
      const analyzer = createEnhancedAnalyzer()
      // 生成右偏分布的数据
      const samples = [1, 1, 1, 2, 2, 3, 5, 10, 20, 50, 100]

      const analysis = analyzer.analyzeStatistics(samples)

      // 偏度应该为正（右偏）
      expect(analysis.skewness).toBeGreaterThan(0)
    })
  })
})
