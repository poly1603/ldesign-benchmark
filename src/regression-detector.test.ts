/**
 * 回归检测器测试
 * 
 * Feature: benchmark-enhancement
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { RegressionDetector, createRegressionDetector } from './regression-detector'
import type { BenchmarkResult, BenchmarkReport } from './types'

/**
 * 生成随机的基准测试结果
 */
const benchmarkResultArbitrary = (): fc.Arbitrary<BenchmarkResult> => {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    opsPerSecond: fc.double({ min: 100, max: 10_000_000, noNaN: true }),
    avgTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    minTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    maxTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    stdDev: fc.double({ min: 0, max: 100, noNaN: true }),
    rme: fc.double({ min: 0, max: 50, noNaN: true }),
    iterations: fc.integer({ min: 10, max: 10000 }),
    totalTime: fc.double({ min: 100, max: 100000, noNaN: true }),
  })
}

/**
 * 生成随机的基准测试报告
 */
const benchmarkReportArbitrary = (): fc.Arbitrary<BenchmarkReport> => {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    suites: fc.array(
      fc.record({
        name: fc.string({ minLength: 1, maxLength: 50 }),
        results: fc.array(benchmarkResultArbitrary(), { minLength: 1, maxLength: 10 }),
        duration: fc.integer({ min: 100, max: 100000 }),
        timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
    generatedAt: fc.date().map(d => d.toISOString()),
    environment: fc.record({
      platform: fc.constantFrom('linux', 'darwin', 'win32'),
      arch: fc.constantFrom('x64', 'arm64'),
      nodeVersion: fc.string({ minLength: 5, maxLength: 10 }),
    }),
  })
}

describe('RegressionDetector', () => {
  describe('回归检测正确性', () => {
    /**
     * 属性 12: 性能回归检测正确性
     * 验证: 需求 1.2
     * 
     * 对于任意基线报告和当前报告，如果当前报告中某个任务的 ops/sec 比基线低超过阈值百分比，
     * 则该任务应被标记为回归
     */
    it('Property 12: 应该正确检测性能回归', () => {
      fc.assert(
        fc.property(
          benchmarkReportArbitrary(),
          fc.double({ min: 1, max: 20 }), // 阈值百分比
          (baselineReport, threshold) => {
            // 创建当前报告，其中一些任务性能下降
            const currentReport: BenchmarkReport = {
              ...baselineReport,
              generatedAt: new Date(Date.now() + 1000).toISOString(),
              suites: baselineReport.suites.map(suite => ({
                ...suite,
                results: suite.results.map((result, idx) => {
                  // 每隔一个任务降低性能（超过阈值）
                  if (idx % 2 === 0) {
                    const degradationFactor = 1 - (threshold + 5) / 100 // 确保超过阈值
                    return {
                      ...result,
                      opsPerSecond: result.opsPerSecond * degradationFactor,
                      avgTime: result.avgTime / degradationFactor,
                    }
                  }
                  return result
                }),
              })),
            }

            const detector = new RegressionDetector({ threshold })
            const comparison = detector.compare(baselineReport, currentReport)

            // 验证：每个性能下降超过阈值的任务都应该被标记为回归
            for (const comp of comparison.comparisons) {
              const actualImprovement = ((comp.currentOps - comp.baselineOps) / comp.baselineOps) * 100

              if (actualImprovement < -threshold) {
                // 如果实际下降超过阈值，应该被标记为回归
                expect(comp.isRegression).toBe(true)
                expect(comp.isImprovement).toBe(false)
              } else if (actualImprovement > threshold) {
                // 如果实际提升超过阈值，应该被标记为提升
                expect(comp.isImprovement).toBe(true)
                expect(comp.isRegression).toBe(false)
              } else {
                // 否则，既不是回归也不是提升
                expect(comp.isRegression).toBe(false)
                expect(comp.isImprovement).toBe(false)
              }
            }

            // 验证汇总统计的正确性
            const actualRegressions = comparison.comparisons.filter(c => c.isRegression).length
            const actualImprovements = comparison.comparisons.filter(c => c.isImprovement).length

            expect(comparison.summary.regressions).toBe(actualRegressions)
            expect(comparison.summary.improvements).toBe(actualImprovements)
            expect(comparison.summary.totalComparisons).toBe(comparison.comparisons.length)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('应该正确计算改进百分比', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 100, max: 10000, noNaN: true }),
          fc.double({ min: 100, max: 10000, noNaN: true }),
          (baselineOps, currentOps) => {
            const detector = new RegressionDetector()

            const baseline: BenchmarkResult = {
              name: 'test',
              opsPerSecond: baselineOps,
              avgTime: 1 / baselineOps * 1000,
              minTime: 0.9 / baselineOps * 1000,
              maxTime: 1.1 / baselineOps * 1000,
              stdDev: 0.05,
              rme: 5,
              iterations: 100,
              totalTime: 100,
            }

            const current: BenchmarkResult = {
              ...baseline,
              opsPerSecond: currentOps,
              avgTime: 1 / currentOps * 1000,
            }

            const result = detector.compareResult(baseline, current)

            // 验证改进百分比的计算
            const expectedImprovement = ((currentOps - baselineOps) / baselineOps) * 100
            expect(Math.abs(result.improvement - expectedImprovement)).toBeLessThan(0.01)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('应该在没有匹配任务时返回空对比', () => {
      const detector = new RegressionDetector()

      const baseline: BenchmarkReport = {
        name: 'baseline',
        suites: [
          {
            name: 'suite1',
            results: [
              {
                name: 'task1',
                opsPerSecond: 1000,
                avgTime: 1,
                minTime: 0.9,
                maxTime: 1.1,
                stdDev: 0.05,
                rme: 5,
                iterations: 100,
                totalTime: 100,
              },
            ],
            duration: 100,
            timestamp: Date.now(),
          },
        ],
        generatedAt: new Date().toISOString(),
        environment: {
          platform: 'linux',
          arch: 'x64',
          nodeVersion: 'v18.0.0',
        },
      }

      const current: BenchmarkReport = {
        ...baseline,
        suites: [
          {
            name: 'suite2', // 不同的套件名
            results: [
              {
                name: 'task2', // 不同的任务名
                opsPerSecond: 1100,
                avgTime: 0.9,
                minTime: 0.8,
                maxTime: 1.0,
                stdDev: 0.05,
                rme: 5,
                iterations: 100,
                totalTime: 90,
              },
            ],
            duration: 90,
            timestamp: Date.now(),
          },
        ],
        generatedAt: new Date().toISOString(),
      }

      const comparison = detector.compare(baseline, current)

      expect(comparison.comparisons).toHaveLength(0)
      expect(comparison.summary.totalComparisons).toBe(0)
      expect(comparison.summary.regressions).toBe(0)
      expect(comparison.summary.improvements).toBe(0)
    })
  })

  describe('阈值配置', () => {
    it('应该使用自定义阈值', () => {
      const customThreshold = 10
      const detector = new RegressionDetector({ threshold: customThreshold })

      expect(detector.getThreshold()).toBe(customThreshold)

      const baseline: BenchmarkResult = {
        name: 'test',
        opsPerSecond: 1000,
        avgTime: 1,
        minTime: 0.9,
        maxTime: 1.1,
        stdDev: 0.05,
        rme: 5,
        iterations: 100,
        totalTime: 100,
      }

      // 下降 8%（小于阈值）
      const current: BenchmarkResult = {
        ...baseline,
        opsPerSecond: 920,
        avgTime: 1.087,
      }

      const result = detector.compareResult(baseline, current)

      // 应该不被标记为回归（因为 8% < 10%）
      expect(result.isRegression).toBe(false)
    })

    it('应该允许动态修改阈值', () => {
      const detector = new RegressionDetector({ threshold: 5 })

      expect(detector.getThreshold()).toBe(5)

      detector.setThreshold(10)

      expect(detector.getThreshold()).toBe(10)
    })
  })

  describe('报告生成', () => {
    it('应该生成包含所有部分的报告', () => {
      const detector = new RegressionDetector({ threshold: 5 })

      const baseline: BenchmarkReport = {
        name: 'baseline',
        suites: [
          {
            name: 'suite1',
            results: [
              {
                name: 'task1',
                opsPerSecond: 1000,
                avgTime: 1,
                minTime: 0.9,
                maxTime: 1.1,
                stdDev: 0.05,
                rme: 5,
                iterations: 100,
                totalTime: 100,
              },
              {
                name: 'task2',
                opsPerSecond: 2000,
                avgTime: 0.5,
                minTime: 0.45,
                maxTime: 0.55,
                stdDev: 0.025,
                rme: 2.5,
                iterations: 100,
                totalTime: 50,
              },
            ],
            duration: 150,
            timestamp: Date.now(),
          },
        ],
        generatedAt: new Date().toISOString(),
        environment: {
          platform: 'linux',
          arch: 'x64',
          nodeVersion: 'v18.0.0',
        },
      }

      const current: BenchmarkReport = {
        ...baseline,
        suites: [
          {
            ...baseline.suites[0],
            results: [
              {
                ...baseline.suites[0].results[0],
                opsPerSecond: 900, // 下降 10%
              },
              {
                ...baseline.suites[0].results[1],
                opsPerSecond: 2200, // 提升 10%
              },
            ],
          },
        ],
        generatedAt: new Date(Date.now() + 1000).toISOString(),
      }

      const comparison = detector.compare(baseline, current)
      const report = detector.generateReport(comparison)

      // 验证报告包含所有必需部分
      expect(report).toContain('# 性能回归检测报告')
      expect(report).toContain('## 汇总')
      expect(report).toContain('## ⚠️ 性能回归')
      expect(report).toContain('## ✅ 性能提升')
      expect(report).toContain('task1') // 回归的任务
      expect(report).toContain('task2') // 提升的任务
    })
  })

  describe('辅助方法', () => {
    it('hasRegressions 应该正确检测回归', () => {
      const detector = new RegressionDetector()

      const comparisonWithRegression = {
        baseline: new Date().toISOString(),
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'task1',
            baselineOps: 1000,
            currentOps: 900,
            improvement: -10,
            isRegression: true,
            isImprovement: false,
            baselineAvgTime: 1,
            currentAvgTime: 1.1,
          },
        ],
        summary: {
          totalComparisons: 1,
          improvements: 0,
          regressions: 1,
          avgImprovement: -10,
        },
      }

      expect(detector.hasRegressions(comparisonWithRegression)).toBe(true)

      const comparisonWithoutRegression = {
        ...comparisonWithRegression,
        comparisons: [
          {
            ...comparisonWithRegression.comparisons[0],
            isRegression: false,
          },
        ],
        summary: {
          ...comparisonWithRegression.summary,
          regressions: 0,
        },
      }

      expect(detector.hasRegressions(comparisonWithoutRegression)).toBe(false)
    })

    it('getRegressions 应该返回所有回归', () => {
      const detector = new RegressionDetector()

      const comparison = {
        baseline: new Date().toISOString(),
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'task1',
            baselineOps: 1000,
            currentOps: 900,
            improvement: -10,
            isRegression: true,
            isImprovement: false,
            baselineAvgTime: 1,
            currentAvgTime: 1.1,
          },
          {
            suite: 'suite1',
            task: 'task2',
            baselineOps: 2000,
            currentOps: 2200,
            improvement: 10,
            isRegression: false,
            isImprovement: true,
            baselineAvgTime: 0.5,
            currentAvgTime: 0.45,
          },
        ],
        summary: {
          totalComparisons: 2,
          improvements: 1,
          regressions: 1,
          avgImprovement: 0,
        },
      }

      const regressions = detector.getRegressions(comparison)

      expect(regressions).toHaveLength(1)
      expect(regressions[0].task).toBe('task1')
      expect(regressions[0].isRegression).toBe(true)
    })

    it('getImprovements 应该返回所有提升', () => {
      const detector = new RegressionDetector()

      const comparison = {
        baseline: new Date().toISOString(),
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'task1',
            baselineOps: 1000,
            currentOps: 900,
            improvement: -10,
            isRegression: true,
            isImprovement: false,
            baselineAvgTime: 1,
            currentAvgTime: 1.1,
          },
          {
            suite: 'suite1',
            task: 'task2',
            baselineOps: 2000,
            currentOps: 2200,
            improvement: 10,
            isRegression: false,
            isImprovement: true,
            baselineAvgTime: 0.5,
            currentAvgTime: 0.45,
          },
        ],
        summary: {
          totalComparisons: 2,
          improvements: 1,
          regressions: 1,
          avgImprovement: 0,
        },
      }

      const improvements = detector.getImprovements(comparison)

      expect(improvements).toHaveLength(1)
      expect(improvements[0].task).toBe('task2')
      expect(improvements[0].isImprovement).toBe(true)
    })
  })

  describe('工厂函数', () => {
    it('createRegressionDetector 应该创建实例', () => {
      const detector = createRegressionDetector({ threshold: 10 })

      expect(detector).toBeInstanceOf(RegressionDetector)
      expect(detector.getThreshold()).toBe(10)
    })
  })
})
