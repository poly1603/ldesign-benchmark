/**
 * 并行执行模块测试
 * 
 * 包含属性测试和单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import {
  ParallelBenchmarkRunner,
  createParallelRunner,
  Semaphore,
  topologicalSort,
  getExecutableSuites,
  ProgressAggregator,
  type SuiteConfig,
  type ParallelRunnerOptions,
} from './parallel'
import { createBenchmark } from './benchmark'
import type { Benchmark, BenchmarkResult, ProgressInfo } from './types'

/**
 * 创建一个简单的模拟 Benchmark
 */
function createMockBenchmark(name: string, delay: number = 10): Benchmark {
  const bench = createBenchmark(name, { time: 50, iterations: 5, warmup: 1 })
  bench.add('task1', async () => {
    await new Promise(resolve => setTimeout(resolve, delay))
  })
  return bench
}

/**
 * 创建一个快速完成的模拟 Benchmark
 */
function createFastBenchmark(name: string): Benchmark {
  const bench = createBenchmark(name, { time: 10, iterations: 2, warmup: 0 })
  bench.add('fast-task', () => {
    // 同步快速任务
    let sum = 0
    for (let i = 0; i < 100; i++) sum += i
    // 不返回值，符合 BenchmarkTask 类型
  })
  return bench
}

describe('并行执行模块', () => {
  describe('Semaphore', () => {
    it('应该正确控制并发数', async () => {
      const semaphore = new Semaphore(2)
      let concurrent = 0
      let maxConcurrent = 0

      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        await semaphore.acquire()
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise(resolve => setTimeout(resolve, 10))
        concurrent--
        semaphore.release()
      })

      await Promise.all(tasks.map(t => t()))

      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })

    it('应该正确报告可用许可数', () => {
      const semaphore = new Semaphore(3)
      expect(semaphore.getAvailablePermits()).toBe(3)
    })
  })

  describe('topologicalSort', () => {
    it('应该正确排序无依赖的套件', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A') },
        { name: 'B', benchmark: createFastBenchmark('B') },
        { name: 'C', benchmark: createFastBenchmark('C') },
      ]

      const sorted = topologicalSort(suites)
      expect(sorted).toHaveLength(3)
      expect(sorted).toContain('A')
      expect(sorted).toContain('B')
      expect(sorted).toContain('C')
    })

    it('应该正确排序有依赖的套件', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A') },
        { name: 'B', benchmark: createFastBenchmark('B'), dependsOn: ['A'] },
        { name: 'C', benchmark: createFastBenchmark('C'), dependsOn: ['B'] },
      ]

      const sorted = topologicalSort(suites)
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'))
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'))
    })

    it('应该检测循环依赖', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A'), dependsOn: ['C'] },
        { name: 'B', benchmark: createFastBenchmark('B'), dependsOn: ['A'] },
        { name: 'C', benchmark: createFastBenchmark('C'), dependsOn: ['B'] },
      ]

      expect(() => topologicalSort(suites)).toThrow(/循环依赖/)
    })

    it('应该检测不存在的依赖', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A'), dependsOn: ['NonExistent'] },
      ]

      expect(() => topologicalSort(suites)).toThrow(/不存在/)
    })
  })

  describe('getExecutableSuites', () => {
    it('应该返回所有无依赖的套件', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A') },
        { name: 'B', benchmark: createFastBenchmark('B') },
        { name: 'C', benchmark: createFastBenchmark('C'), dependsOn: ['A'] },
      ]

      const executable = getExecutableSuites(suites, new Set())
      expect(executable.map(s => s.name)).toEqual(['A', 'B'])
    })

    it('应该在依赖完成后返回依赖套件', () => {
      const suites: SuiteConfig[] = [
        { name: 'A', benchmark: createFastBenchmark('A') },
        { name: 'B', benchmark: createFastBenchmark('B'), dependsOn: ['A'] },
      ]

      const completed = new Set(['A'])
      const executable = getExecutableSuites(suites, completed)
      expect(executable.map(s => s.name)).toEqual(['B'])
    })
  })

  describe('ProgressAggregator', () => {
    it('应该聚合多个套件的进度', () => {
      let lastProgress: ProgressInfo | null = null
      const aggregator = new ProgressAggregator((progress) => {
        lastProgress = progress
      })

      aggregator.update('Suite1', {
        suite: 'Suite1',
        task: 'task1',
        current: 1,
        total: 2,
        percentage: 50,
        phase: 'running',
      })

      aggregator.update('Suite2', {
        suite: 'Suite2',
        task: 'task2',
        current: 2,
        total: 4,
        percentage: 50,
        phase: 'running',
      })

      expect(lastProgress).not.toBeNull()
      expect(lastProgress!.current).toBe(3) // 1 + 2
      expect(lastProgress!.total).toBe(6) // 2 + 4
    })
  })

  describe('ParallelBenchmarkRunner', () => {
    it('应该正确添加和获取套件', () => {
      const runner = createParallelRunner()
      runner.addSimpleSuite('Suite1', createFastBenchmark('Suite1'))
      runner.addSimpleSuite('Suite2', createFastBenchmark('Suite2'))

      expect(runner.getSuites()).toEqual(['Suite1', 'Suite2'])
    })

    it('应该正确移除套件', () => {
      const runner = createParallelRunner()
      runner.addSimpleSuite('Suite1', createFastBenchmark('Suite1'))
      runner.addSimpleSuite('Suite2', createFastBenchmark('Suite2'))

      runner.removeSuite('Suite1')
      expect(runner.getSuites()).toEqual(['Suite2'])
    })

    it('应该正确清空套件', () => {
      const runner = createParallelRunner()
      runner.addSimpleSuite('Suite1', createFastBenchmark('Suite1'))
      runner.addSimpleSuite('Suite2', createFastBenchmark('Suite2'))

      runner.clear()
      expect(runner.getSuites()).toEqual([])
    })

    it('应该返回正确的最大并行数', () => {
      const runner = createParallelRunner({ parallel: { maxWorkers: 8 } })
      expect(runner.getMaxWorkers()).toBe(8)
    })
  })
})

describe('并行执行完整性属性测试', () => {
  /**
   * 属性 8: 并行执行完整性
   * 
   * *对于任意*基准测试套件集合，无论是串行还是并行执行，
   * 最终的结果集合应该包含所有套件的结果（除非某个套件失败且配置为不继续）。
   * 
   * **Feature: benchmark-enhancement, Property 8: 并行执行完整性**
   * **Validates: Requirements 6.1, 6.4**
   */
  it('属性 8: 并行执行完整性 - 所有套件都应该被执行', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 1-5 个套件名称
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
          .filter(names => new Set(names).size === names.length), // 确保名称唯一
        // 生成并行配置
        fc.record({
          enabled: fc.boolean(),
          maxWorkers: fc.integer({ min: 1, max: 4 }),
        }),
        async (suiteNames, parallelConfig) => {
          const runner = createParallelRunner({
            parallel: parallelConfig,
            continueOnError: true,
          })

          // 添加所有套件
          for (const name of suiteNames) {
            runner.addSimpleSuite(name, createFastBenchmark(name))
          }

          // 执行
          const report = await runner.runAll()

          // 验证: 所有套件都应该在结果中
          const resultSuiteNames = new Set(report.suites.map(s => s.name))
          for (const name of suiteNames) {
            if (!resultSuiteNames.has(name)) {
              return false
            }
          }

          // 验证: 结果数量应该等于输入数量
          return report.suites.length === suiteNames.length
        }
      ),
      { numRuns: 20 }
    )
  }, 60000) // 增加超时时间
})


describe('并发限制遵守属性测试', () => {
  /**
   * 属性 9: 并发限制遵守
   * 
   * *对于任意*并行执行配置（max-workers = N），在任意时刻同时运行的任务数不应超过 N。
   * 
   * **Feature: benchmark-enhancement, Property 9: 并发限制遵守**
   * **Validates: Requirements 6.2**
   */
  it('属性 9: 并发限制遵守 - 同时运行的任务数不应超过 maxWorkers', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 maxWorkers 配置 (1-4)
        fc.integer({ min: 1, max: 4 }),
        // 生成套件数量 (2-8)
        fc.integer({ min: 2, max: 8 }),
        async (maxWorkers, suiteCount) => {
          let currentConcurrent = 0
          let maxConcurrent = 0
          const concurrencyLog: number[] = []

          const runner = createParallelRunner({
            parallel: {
              enabled: true,
              maxWorkers,
            },
            onSuiteStart: () => {
              currentConcurrent++
              maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
              concurrencyLog.push(currentConcurrent)
            },
            onSuiteComplete: () => {
              currentConcurrent--
            },
          })

          // 添加套件
          for (let i = 0; i < suiteCount; i++) {
            runner.addSimpleSuite(`Suite-${i}`, createFastBenchmark(`Suite-${i}`))
          }

          // 执行
          await runner.runAll()

          // 验证: 最大并发数不应超过 maxWorkers
          return maxConcurrent <= maxWorkers
        }
      ),
      { numRuns: 20 }
    )
  }, 120000) // 增加超时时间
})


describe('依赖顺序正确性属性测试', () => {
  /**
   * 属性 10: 依赖顺序正确性
   * 
   * *对于任意*带有依赖声明的套件集合，如果套件 A 依赖套件 B，
   * 则 A 的开始时间应该晚于 B 的结束时间。
   * 
   * **Feature: benchmark-enhancement, Property 10: 依赖顺序正确性**
   * **Validates: Requirements 6.5**
   */
  it('属性 10: 依赖顺序正确性 - 依赖套件应在被依赖套件之后执行', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 maxWorkers 配置 (1-3)
        fc.integer({ min: 1, max: 3 }),
        async (maxWorkers) => {
          // 创建带依赖的套件: A -> B -> C (C 依赖 B, B 依赖 A)
          const executionOrder: string[] = []
          const startTimes: Map<string, number> = new Map()
          const endTimes: Map<string, number> = new Map()

          const runner = createParallelRunner({
            parallel: {
              enabled: true,
              maxWorkers,
            },
            onSuiteStart: (suite) => {
              startTimes.set(suite, Date.now())
              executionOrder.push(`start:${suite}`)
            },
            onSuiteComplete: (suite) => {
              endTimes.set(suite, Date.now())
              executionOrder.push(`end:${suite}`)
            },
          })

          // 添加带依赖的套件
          runner.addSuite({
            name: 'Suite-A',
            benchmark: createFastBenchmark('Suite-A'),
          })
          runner.addSuite({
            name: 'Suite-B',
            benchmark: createFastBenchmark('Suite-B'),
            dependsOn: ['Suite-A'],
          })
          runner.addSuite({
            name: 'Suite-C',
            benchmark: createFastBenchmark('Suite-C'),
            dependsOn: ['Suite-B'],
          })

          // 执行
          await runner.runAll()

          // 验证依赖顺序: B 应该在 A 之后开始, C 应该在 B 之后开始
          const startA = startTimes.get('Suite-A')!
          const endA = endTimes.get('Suite-A')!
          const startB = startTimes.get('Suite-B')!
          const endB = endTimes.get('Suite-B')!
          const startC = startTimes.get('Suite-C')!

          // B 的开始时间应该 >= A 的结束时间
          if (startB < endA) {
            return false
          }

          // C 的开始时间应该 >= B 的结束时间
          if (startC < endB) {
            return false
          }

          return true
        }
      ),
      { numRuns: 10 }
    )
  }, 60000)
})
