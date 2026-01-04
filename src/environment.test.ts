/**
 * 环境元数据收集器测试
 * 
 * Feature: benchmark-enhancement, Property 14: 报告环境元数据完整性
 * Validates: Requirements 2.4
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { EnvironmentCollector, environmentCollector } from './environment'
import { createBenchmark } from './benchmark'

describe('EnvironmentCollector', () => {
  describe('基本功能测试', () => {
    it('应该收集基本环境信息', () => {
      const collector = new EnvironmentCollector()
      const env = collector.collectBasic()

      expect(env).toHaveProperty('platform')
      expect(env).toHaveProperty('arch')
      expect(env).toHaveProperty('nodeVersion')
      expect(typeof env.platform).toBe('string')
      expect(typeof env.arch).toBe('string')
      expect(typeof env.nodeVersion).toBe('string')
    })

    it('应该收集完整环境元数据', () => {
      const collector = new EnvironmentCollector()
      const env = collector.collect()

      // 必需字段
      expect(env).toHaveProperty('platform')
      expect(env).toHaveProperty('arch')
      expect(env).toHaveProperty('nodeVersion')
      expect(typeof env.platform).toBe('string')
      expect(typeof env.arch).toBe('string')
      expect(typeof env.nodeVersion).toBe('string')

      // 可选字段（应该存在）
      expect(env).toHaveProperty('cpuModel')
      expect(env).toHaveProperty('cpuCores')
      expect(env).toHaveProperty('totalMemory')
      expect(env).toHaveProperty('freeMemory')
      expect(env).toHaveProperty('osVersion')
      expect(env).toHaveProperty('hostname')
    })

    it('应该格式化内存大小', () => {
      const collector = new EnvironmentCollector()

      expect(collector.formatMemory(1024 * 1024 * 1024)).toBe('1.00 GB')
      expect(collector.formatMemory(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
      expect(collector.formatMemory(512 * 1024 * 1024)).toBe('0.50 GB')
    })

    it('应该生成环境摘要', () => {
      const collector = new EnvironmentCollector()
      const summary = collector.getSummary()

      expect(typeof summary).toBe('string')
      expect(summary.length).toBeGreaterThan(0)
      expect(summary).toContain('Node')
    })
  })

  describe('属性 14: 报告环境元数据完整性', () => {
    /**
     * Property 14: 报告环境元数据完整性
     * 
     * 对于任意生成的报告，环境元数据应该包含所有必需字段（platform、arch、nodeVersion），
     * 且这些值应该与当前运行环境一致。
     * 
     * Validates: Requirements 2.4
     */
    it('对于任意基准测试，生成的报告应包含完整的环境元数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.nat({ max: 10 }),
          async (suiteName, taskName, iterations) => {
            // 创建基准测试
            const bench = createBenchmark(suiteName, {
              iterations: Math.max(1, iterations),
              warmup: 0,
              time: 10, // 最小运行时间 10ms
            })

            // 添加简单任务
            bench.add(taskName, () => {
              let sum = 0
              for (let i = 0; i < 10; i++) {
                sum += i
              }
              return sum
            })

            // 运行测试
            await bench.run()

            // 获取报告
            const report = bench.toJSON()

            // 验证必需字段存在
            expect(report.environment).toBeDefined()
            expect(report.environment.platform).toBeDefined()
            expect(report.environment.arch).toBeDefined()
            expect(report.environment.nodeVersion).toBeDefined()

            // 验证字段类型
            expect(typeof report.environment.platform).toBe('string')
            expect(typeof report.environment.arch).toBe('string')
            expect(typeof report.environment.nodeVersion).toBe('string')

            // 验证字段非空
            expect(report.environment.platform.length).toBeGreaterThan(0)
            expect(report.environment.arch.length).toBeGreaterThan(0)
            expect(report.environment.nodeVersion.length).toBeGreaterThan(0)

            // 验证值与当前环境一致
            expect(report.environment.platform).toBe(process.platform)
            expect(report.environment.arch).toBe(process.arch)
            expect(report.environment.nodeVersion).toBe(process.version)

            // 验证可选字段（如果存在，应该是正确的类型）
            if (report.environment.cpuModel !== undefined) {
              expect(typeof report.environment.cpuModel).toBe('string')
            }
            if (report.environment.cpuCores !== undefined) {
              expect(typeof report.environment.cpuCores).toBe('number')
              expect(report.environment.cpuCores).toBeGreaterThan(0)
            }
            if (report.environment.totalMemory !== undefined) {
              expect(typeof report.environment.totalMemory).toBe('number')
              expect(report.environment.totalMemory).toBeGreaterThan(0)
            }
            if (report.environment.freeMemory !== undefined) {
              expect(typeof report.environment.freeMemory).toBe('number')
              expect(report.environment.freeMemory).toBeGreaterThanOrEqual(0)
            }
            if (report.environment.osVersion !== undefined) {
              expect(typeof report.environment.osVersion).toBe('string')
            }
            if (report.environment.hostname !== undefined) {
              expect(typeof report.environment.hostname).toBe('string')
            }
          }
        ),
        { numRuns: 20 } // 减少运行次数以避免超时
      )
    }, 120000) // 增加超时时间到 120 秒

    it('环境收集器应该在多次调用时返回一致的必需字段', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 10 }),
          (callCount) => {
            const collector = new EnvironmentCollector()
            const results = []

            // 多次调用收集器
            for (let i = 0; i <= callCount; i++) {
              results.push(collector.collect())
            }

            // 验证所有结果的必需字段一致
            for (let i = 1; i < results.length; i++) {
              expect(results[i].platform).toBe(results[0].platform)
              expect(results[i].arch).toBe(results[0].arch)
              expect(results[i].nodeVersion).toBe(results[0].nodeVersion)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('默认环境收集器实例应该返回有效的元数据', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const env = environmentCollector.collect()

            // 验证必需字段
            expect(env.platform).toBe(process.platform)
            expect(env.arch).toBe(process.arch)
            expect(env.nodeVersion).toBe(process.version)

            // 验证字段非空
            expect(env.platform.length).toBeGreaterThan(0)
            expect(env.arch.length).toBeGreaterThan(0)
            expect(env.nodeVersion.length).toBeGreaterThan(0)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
