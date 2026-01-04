/**
 * 超时处理器测试
 * 
 * **Feature: benchmark-enhancement, Property 16: 超时处理正确性**
 * **Validates: Requirements 9.3**
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { TimeoutHandler, withTimeout, createTimeoutHandler } from './timeout-handler'
import { TimeoutError } from './errors'

describe('TimeoutHandler', () => {
  describe('基本功能', () => {
    it('应该正确记录迭代', () => {
      const handler = new TimeoutHandler(5000, 'test-task')
      handler.start()

      handler.recordIteration(10)
      handler.recordIteration(20)
      handler.recordIteration(15)

      const partial = handler.getPartialResult()
      expect(partial.completedIterations).toBe(3)
      expect(partial.samples).toEqual([10, 20, 15])
      expect(partial.totalTime).toBe(45)
    })

    it('应该检测超时', async () => {
      const handler = new TimeoutHandler(100, 'test-task')
      handler.start()

      // 等待超过超时时间
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(handler.isTimedOut()).toBe(true)
    })

    it('应该构建部分结果', () => {
      const handler = new TimeoutHandler(5000, 'test-task')
      handler.start()

      handler.recordIteration(10)
      handler.recordIteration(20)
      handler.recordIteration(15)

      const result = handler.buildPartialBenchmarkResult('test-task', ['tag1'])

      expect(result.name).toBe('test-task')
      expect(result.iterations).toBe(3)
      expect(result.status).toBe('timeout')
      expect(result.avgTime).toBeCloseTo(15, 1)
      expect(result.minTime).toBe(10)
      expect(result.maxTime).toBe(20)
      expect(result.tags).toEqual(['tag1'])
    })

    it('应该处理零迭代的情况', () => {
      const handler = new TimeoutHandler(5000, 'test-task')
      handler.start()

      const result = handler.buildPartialBenchmarkResult('test-task')

      expect(result.iterations).toBe(0)
      expect(result.status).toBe('timeout')
      expect(result.opsPerSecond).toBe(0)
      expect(result.error).toContain('no completed iterations')
    })
  })

  describe('withTimeout 函数', () => {
    it('应该在超时前完成', async () => {
      const result = await withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50))
          return 'success'
        },
        200,
        'test-task',
      )

      expect(result).toBe('success')
    })

    it('应该在超时时抛出 TimeoutError', async () => {
      await expect(
        withTimeout(
          async () => {
            await new Promise(resolve => setTimeout(resolve, 200))
            return 'success'
          },
          50,
          'test-task',
          'test-suite',
        ),
      ).rejects.toThrow(TimeoutError)
    })

    it('超时为 0 时应该不设置超时', async () => {
      const result = await withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100))
          return 'success'
        },
        0,
        'test-task',
      )

      expect(result).toBe('success')
    })
  })

  describe('属性 16: 超时处理正确性', () => {
    /**
     * 对于任意设置了超时的基准测试任务，如果任务执行时间超过超时值，
     * 应该返回部分结果（已完成的迭代）和超时状态。
     */
    it('应该在超时时返回部分结果', () => {
      fc.assert(
        fc.property(
          // 生成超时时间 (50-200ms)
          fc.integer({ min: 50, max: 200 }),
          // 生成迭代次数 (1-10)
          fc.integer({ min: 1, max: 10 }),
          // 生成每次迭代的时间 (5-20ms)
          fc.array(fc.integer({ min: 5, max: 20 }), { minLength: 1, maxLength: 10 }),
          (timeout, targetIterations, durations) => {
            const handler = new TimeoutHandler(timeout, 'property-test-task')
            handler.start()

            // 记录迭代直到达到目标或超时
            let recorded = 0
            for (let i = 0; i < Math.min(targetIterations, durations.length); i++) {
              if (handler.isTimedOut()) {
                break
              }
              handler.recordIteration(durations[i])
              recorded++
            }

            const partial = handler.getPartialResult()
            const result = handler.buildPartialBenchmarkResult('property-test-task')

            // 验证部分结果的正确性
            expect(partial.completedIterations).toBe(recorded)
            expect(partial.samples.length).toBe(recorded)
            expect(result.iterations).toBe(recorded)
            expect(result.status).toBe('timeout')

            // 如果有迭代完成，验证统计数据
            if (recorded > 0) {
              expect(result.avgTime).toBeGreaterThan(0)
              expect(result.minTime).toBeGreaterThan(0)
              expect(result.maxTime).toBeGreaterThan(0)
              expect(result.samples).toHaveLength(recorded)

              // 验证 avgTime 是样本的平均值
              const expectedAvg =
                partial.samples.reduce((a, b) => a + b, 0) / partial.samples.length
              expect(result.avgTime).toBeCloseTo(expectedAvg, 5)

              // 验证 minTime 和 maxTime
              expect(result.minTime).toBe(Math.min(...partial.samples))
              expect(result.maxTime).toBe(Math.max(...partial.samples))
            } else {
              // 没有完成任何迭代
              expect(result.opsPerSecond).toBe(0)
              expect(result.error).toContain('no completed iterations')
            }

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('应该正确计算部分结果的统计数据', () => {
      fc.assert(
        fc.property(
          // 生成样本数据 (1-100 个样本，每个 1-1000ms)
          fc.array(fc.float({ min: 1, max: 1000, noNaN: true }), { minLength: 1, maxLength: 100 }),
          samples => {
            // 过滤掉任何 NaN 或无效值
            const validSamples = samples.filter(s => !isNaN(s) && isFinite(s) && s > 0)

            // 如果没有有效样本，跳过此测试
            if (validSamples.length === 0) {
              return true
            }

            const handler = new TimeoutHandler(10000, 'stats-test-task')
            handler.start()

            // 记录所有有效样本
            validSamples.forEach(duration => handler.recordIteration(duration))

            const result = handler.buildPartialBenchmarkResult('stats-test-task')

            // 验证迭代次数
            expect(result.iterations).toBe(validSamples.length)

            // 验证平均值
            const expectedAvg = validSamples.reduce((a, b) => a + b, 0) / validSamples.length
            expect(result.avgTime).toBeCloseTo(expectedAvg, 5)

            // 验证最小值和最大值
            expect(result.minTime).toBeCloseTo(Math.min(...validSamples), 5)
            expect(result.maxTime).toBeCloseTo(Math.max(...validSamples), 5)

            // 验证总时间
            const expectedTotal = validSamples.reduce((a, b) => a + b, 0)
            expect(result.totalTime).toBeCloseTo(expectedTotal, 5)

            // 验证 ops/sec 计算
            const expectedOps = 1000 / expectedAvg
            expect(result.opsPerSecond).toBeCloseTo(expectedOps, 2)

            // 验证状态
            expect(result.status).toBe('timeout')

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('withTimeout 应该在超时时抛出错误，在时间内完成时返回结果', () => {
      fc.assert(
        fc.asyncProperty(
          // 生成超时时间 (50-200ms)
          fc.integer({ min: 50, max: 200 }),
          // 生成实际执行时间 (10-300ms)
          fc.integer({ min: 10, max: 300 }),
          async (timeout, executionTime) => {
            const shouldTimeout = executionTime > timeout

            try {
              const result = await withTimeout(
                async () => {
                  await new Promise(resolve => setTimeout(resolve, executionTime))
                  return 'completed'
                },
                timeout,
                'property-test',
                'property-suite',
              )

              // 如果没有超时，应该返回结果
              expect(shouldTimeout).toBe(false)
              expect(result).toBe('completed')
            } catch (error) {
              // 如果超时，应该抛出 TimeoutError
              expect(shouldTimeout).toBe(true)
              expect(error).toBeInstanceOf(TimeoutError)
              if (error instanceof TimeoutError) {
                expect(error.taskName).toBe('property-test')
                expect(error.timeout).toBe(timeout)
              }
            }

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('createTimeoutHandler 工厂函数', () => {
    it('应该创建 TimeoutHandler 实例', () => {
      const handler = createTimeoutHandler(5000, 'factory-test')
      expect(handler).toBeInstanceOf(TimeoutHandler)
    })
  })
})
