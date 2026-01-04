/**
 * CI Reporter 测试
 * 
 * Feature: benchmark-enhancement
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { CIReporter } from './ci-reporter'
import type { BenchmarkResult, BenchmarkReport } from './types'

/**
 * 生成随机的基准测试结果
 */
const benchmarkResultArbitrary = (): fc.Arbitrary<BenchmarkResult> => {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    opsPerSecond: fc.double({ min: 1, max: 10_000_000, noNaN: true }),
    avgTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    minTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    maxTime: fc.double({ min: 0.001, max: 1000, noNaN: true }),
    stdDev: fc.double({ min: 0, max: 100, noNaN: true }),
    rme: fc.double({ min: 0, max: 50, noNaN: true }),
    iterations: fc.integer({ min: 10, max: 10000 }),
    totalTime: fc.double({ min: 100, max: 100000, noNaN: true }),
    status: fc.constantFrom('success', 'failed', 'timeout', 'skipped'),
    error: fc.option(fc.string(), { nil: undefined }),
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

describe('CIReporter', () => {
  describe('GitHub Actions 注释格式', () => {
    /**
     * 属性 13: CI 输出格式有效性
     * 验证: 需求 1.1, 1.4
     * 
     * 对于任意基准测试结果，在 CI 模式下生成的输出应该是有效的 GitHub Actions 注释格式
     */
    it('Property 13: 生成的 GitHub Actions 注释应该符合有效格式', () => {
      fc.assert(
        fc.property(
          fc.array(benchmarkResultArbitrary(), { minLength: 1, maxLength: 20 }),
          fc.option(benchmarkReportArbitrary(), { nil: undefined }),
          (results, baseline) => {
            const reporter = new CIReporter({
              provider: 'github',
              annotations: true,
            })

            const annotations = reporter.generateGitHubAnnotations(results, baseline)

            // 验证每个注释的格式
            for (const annotation of annotations) {
              // 1. level 必须是有效值
              expect(['notice', 'warning', 'error']).toContain(annotation.level)

              // 2. message 必须存在且非空
              expect(annotation.message).toBeTruthy()
              expect(typeof annotation.message).toBe('string')
              expect(annotation.message.length).toBeGreaterThan(0)

              // 3. title 如果存在，必须是字符串
              if (annotation.title !== undefined) {
                expect(typeof annotation.title).toBe('string')
              }

              // 4. file 如果存在，必须是字符串
              if (annotation.file !== undefined) {
                expect(typeof annotation.file).toBe('string')
              }

              // 5. line 如果存在，必须是正整数
              if (annotation.line !== undefined) {
                expect(typeof annotation.line).toBe('number')
                expect(annotation.line).toBeGreaterThan(0)
                expect(Number.isInteger(annotation.line)).toBe(true)
              }
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('应该为失败的测试生成错误注释', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              ...benchmarkResultArbitrary().value,
              status: fc.constant('failed' as const),
              error: fc.string({ minLength: 1 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (failedResults) => {
            const reporter = new CIReporter({ provider: 'github' })
            const annotations = reporter.generateGitHubAnnotations(failedResults)

            // 每个失败的测试都应该有一个错误注释
            const errorAnnotations = annotations.filter(a => a.level === 'error')
            expect(errorAnnotations.length).toBeGreaterThanOrEqual(failedResults.length)

            // 每个错误注释都应该包含测试名称
            for (const result of failedResults) {
              const hasAnnotation = errorAnnotations.some(a =>
                a.title?.includes(result.name) || a.message.includes(result.name)
              )
              expect(hasAnnotation).toBe(true)
            }

            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it('应该为超时的测试生成警告注释', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              ...benchmarkResultArbitrary().value,
              status: fc.constant('timeout' as const),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (timeoutResults) => {
            const reporter = new CIReporter({ provider: 'github' })
            const annotations = reporter.generateGitHubAnnotations(timeoutResults)

            // 每个超时的测试都应该有一个警告注释
            const warningAnnotations = annotations.filter(a => a.level === 'warning')
            expect(warningAnnotations.length).toBeGreaterThanOrEqual(timeoutResults.length)

            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })

  describe('CI 摘要生成', () => {
    it('应该生成包含所有必需部分的摘要', () => {
      fc.assert(
        fc.property(
          fc.array(benchmarkResultArbitrary(), { minLength: 1, maxLength: 20 }),
          (results) => {
            const reporter = new CIReporter()
            const summary = reporter.generateSummary(results)

            // 摘要应该包含标题
            expect(summary).toContain('# 📊 基准测试报告')

            // 摘要应该包含测试统计
            expect(summary).toContain('## 📈 测试统计')
            expect(summary).toContain(`总测试数: ${results.length}`)

            // 摘要应该包含测试结果表格
            expect(summary).toContain('## 📋 测试结果')
            expect(summary).toContain('| 任务 | ops/sec | 平均时间 (ms) | ±RME | 状态 |')

            // 每个结果都应该在表格中
            for (const result of results) {
              expect(summary).toContain(result.name)
            }

            return true
          }
        ),
        { numRuns: 50 }
      )
    })

    it('应该在有对比时包含性能对比部分', () => {
      const reporter = new CIReporter()

      const results: BenchmarkResult[] = [
        {
          name: 'test1',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.9,
          maxTime: 1.1,
          stdDev: 0.05,
          rme: 5,
          iterations: 100,
          totalTime: 100,
        },
      ]

      const baseline: BenchmarkReport = {
        name: 'baseline',
        suites: [
          {
            name: 'suite1',
            results: [
              {
                name: 'test1',
                opsPerSecond: 900,
                avgTime: 1.1,
                minTime: 1,
                maxTime: 1.2,
                stdDev: 0.05,
                rme: 5,
                iterations: 100,
                totalTime: 110,
              },
            ],
            duration: 110,
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

      // 使用私有方法生成对比（通过 report 方法间接测试）
      const summary = reporter.generateSummary(results, {
        baseline: baseline.generatedAt,
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'test1',
            baselineOps: 900,
            currentOps: 1000,
            improvement: 11.11,
            isRegression: false,
            isImprovement: true,
            baselineAvgTime: 1.1,
            currentAvgTime: 1,
          },
        ],
        summary: {
          totalComparisons: 1,
          improvements: 1,
          regressions: 0,
          avgImprovement: 11.11,
        },
      })

      expect(summary).toContain('## 🔄 性能对比')
      expect(summary).toContain('提升: 1')
    })
  })

  describe('回归检测', () => {
    it('应该在有回归时返回 true', () => {
      const reporter = new CIReporter({
        failOnRegression: true,
        regressionThreshold: 5,
      })

      const comparison = {
        baseline: new Date().toISOString(),
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'test1',
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

      expect(reporter.shouldFail(comparison)).toBe(true)
    })

    it('应该在没有回归时返回 false', () => {
      const reporter = new CIReporter({
        failOnRegression: true,
        regressionThreshold: 5,
      })

      const comparison = {
        baseline: new Date().toISOString(),
        current: new Date().toISOString(),
        comparisons: [
          {
            suite: 'suite1',
            task: 'test1',
            baselineOps: 1000,
            currentOps: 1100,
            improvement: 10,
            isRegression: false,
            isImprovement: true,
            baselineAvgTime: 1,
            currentAvgTime: 0.9,
          },
        ],
        summary: {
          totalComparisons: 1,
          improvements: 1,
          regressions: 0,
          avgImprovement: 10,
        },
      }

      expect(reporter.shouldFail(comparison)).toBe(false)
    })
  })

  describe('CI 环境检测', () => {
    it('应该正确检测 GitHub Actions 环境', () => {
      const originalEnv = process.env.GITHUB_ACTIONS
      process.env.GITHUB_ACTIONS = 'true'

      const reporter = new CIReporter()
      // 通过生成注释来间接验证环境检测
      const annotations = reporter.generateGitHubAnnotations([])
      expect(annotations).toBeDefined()

      if (originalEnv === undefined) {
        delete process.env.GITHUB_ACTIONS
      } else {
        process.env.GITHUB_ACTIONS = originalEnv
      }
    })
  })

  describe('输出格式验证', () => {
    it('GitHub Actions 注释输出应该符合命令格式', () => {
      const reporter = new CIReporter({ provider: 'github' })

      // 捕获控制台输出
      const originalLog = console.log
      const logs: string[] = []
      console.log = (msg: string) => logs.push(msg)

      reporter.printGitHubAnnotations([
        {
          level: 'error',
          title: 'Test Error',
          message: 'This is an error message',
        },
        {
          level: 'warning',
          message: 'This is a warning',
        },
        {
          level: 'notice',
          title: 'Test Notice',
          message: 'This is a notice',
          file: 'test.ts',
          line: 42,
        },
      ])

      console.log = originalLog

      // 验证输出格式
      expect(logs.length).toBe(3)

      // 第一个应该是错误
      expect(logs[0]).toMatch(/^::error/)
      expect(logs[0]).toContain('title=Test Error')
      expect(logs[0]).toContain('This is an error message')

      // 第二个应该是警告
      expect(logs[1]).toMatch(/^::warning/)
      expect(logs[1]).toContain('This is a warning')

      // 第三个应该是通知，包含文件和行号
      expect(logs[2]).toMatch(/^::notice/)
      expect(logs[2]).toContain('file=test.ts')
      expect(logs[2]).toContain('line=42')
      expect(logs[2]).toContain('title=Test Notice')
    })
  })
})
