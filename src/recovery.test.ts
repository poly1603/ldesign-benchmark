/**
 * 错误恢复测试
 * 
 * **Feature: benchmark-enhancement, Property 17: 错误恢复数据保存**
 * **Validates: Requirements 9.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { RecoveryManager, createRecoveryManager } from './recovery'
import type { BenchmarkResult } from './types'

describe('RecoveryManager', () => {
  const testRecoveryDir = '.test-recovery'
  let manager: RecoveryManager

  beforeEach(() => {
    manager = new RecoveryManager(testRecoveryDir)
  })

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testRecoveryDir, { recursive: true, force: true })
    } catch {
      // 忽略错误
    }
  })

  describe('基本功能', () => {
    it('应该保存恢复数据', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'test-task',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      const error = new Error('Test error')
      const recoveryFile = await manager.saveRecoveryData(results, error, 'test-suite')

      expect(recoveryFile).toContain('recovery-')
      expect(recoveryFile).toContain('.json')

      // 验证文件存在
      const stat = await fs.stat(recoveryFile)
      expect(stat.isFile()).toBe(true)
    })

    it('应该加载恢复数据', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'test-task',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      const error = new Error('Test error')
      const recoveryFile = await manager.saveRecoveryData(results, error, 'test-suite')

      const data = await manager.loadRecoveryData(recoveryFile)

      expect(data.results).toHaveLength(1)
      expect(data.results[0].name).toBe('test-task')
      expect(data.error.name).toBe('Error')
      expect(data.error.message).toBe('Test error')
      expect(data.suiteName).toBe('test-suite')
    })

    it('应该列出恢复文件', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'task1',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      await manager.saveRecoveryData(results, new Error('Error 1'), 'suite1')
      await manager.saveRecoveryData(results, new Error('Error 2'), 'suite2')

      const files = await manager.listRecoveryFiles()

      expect(files.length).toBeGreaterThanOrEqual(2)
      expect(files[0].suiteName).toBeDefined()
      expect(files[0].resultCount).toBe(1)
    })

    it('应该删除恢复文件', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'test-task',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      const recoveryFile = await manager.saveRecoveryData(results, new Error('Test error'))

      await manager.deleteRecoveryFile(recoveryFile)

      // 验证文件已删除
      await expect(fs.access(recoveryFile)).rejects.toThrow()
    })

    it('应该清理所有恢复文件', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'test-task',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      await manager.saveRecoveryData(results, new Error('Error 1'))
      await manager.saveRecoveryData(results, new Error('Error 2'))

      const deleted = await manager.clearAllRecoveryFiles()

      expect(deleted).toBeGreaterThanOrEqual(2)

      const files = await manager.listRecoveryFiles()
      expect(files).toHaveLength(0)
    })

    it('应该从恢复数据创建报告', async () => {
      const results: BenchmarkResult[] = [
        {
          name: 'test-task',
          opsPerSecond: 1000,
          avgTime: 1,
          minTime: 0.5,
          maxTime: 2,
          stdDev: 0.3,
          rme: 5,
          iterations: 100,
          totalTime: 100,
          status: 'success',
        },
      ]

      const recoveryFile = await manager.saveRecoveryData(results, new Error('Test error'), 'test-suite')

      const report = await manager.createReportFromRecovery(recoveryFile)

      expect(report.name).toBe('test-suite')
      expect(report.suites).toHaveLength(1)
      expect(report.suites[0].results).toHaveLength(1)
      expect(report.suites[0].results[0].name).toBe('test-task')
    })
  })

  describe('属性 17: 错误恢复数据保存', () => {
    /**
     * 对于任意基准测试执行，如果在报告生成阶段发生错误，
     * 原始结果数据应该被保存到恢复文件中，且该文件可以被后续读取。
     */
    it('应该保存并恢复任意结果数据', () => {
      fc.assert(
        fc.asyncProperty(
          // 生成结果数组
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              opsPerSecond: fc.float({ min: 0, max: 1000000 }),
              avgTime: fc.float({ min: 0, max: 10000 }),
              minTime: fc.float({ min: 0, max: 10000 }),
              maxTime: fc.float({ min: 0, max: 10000 }),
              stdDev: fc.float({ min: 0, max: 1000 }),
              rme: fc.float({ min: 0, max: 100 }),
              iterations: fc.integer({ min: 1, max: 10000 }),
              totalTime: fc.float({ min: 0, max: 100000 }),
              status: fc.constantFrom('success', 'failed', 'timeout', 'skipped'),
            }),
            { minLength: 1, maxLength: 20 },
          ),
          // 生成错误消息
          fc.string({ minLength: 1, maxLength: 100 }),
          // 生成套件名称
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          async (results, errorMessage, suiteName) => {
            const error = new Error(errorMessage)

            // 保存恢复数据
            const recoveryFile = await manager.saveRecoveryData(
              results as BenchmarkResult[],
              error,
              suiteName,
            )

            // 验证文件存在
            const stat = await fs.stat(recoveryFile)
            expect(stat.isFile()).toBe(true)

            // 加载恢复数据
            const data = await manager.loadRecoveryData(recoveryFile)

            // 验证数据完整性
            expect(data.results).toHaveLength(results.length)
            expect(data.error.message).toBe(errorMessage)
            expect(data.suiteName).toBe(suiteName)

            // 验证每个结果
            for (let i = 0; i < results.length; i++) {
              const original = results[i]
              const recovered = data.results[i]

              expect(recovered.name).toBe(original.name)
              expect(recovered.opsPerSecond).toBeCloseTo(original.opsPerSecond, 5)
              expect(recovered.avgTime).toBeCloseTo(original.avgTime, 5)
              expect(recovered.minTime).toBeCloseTo(original.minTime, 5)
              expect(recovered.maxTime).toBeCloseTo(original.maxTime, 5)
              expect(recovered.stdDev).toBeCloseTo(original.stdDev, 5)
              expect(recovered.rme).toBeCloseTo(original.rme, 5)
              expect(recovered.iterations).toBe(original.iterations)
              expect(recovered.totalTime).toBeCloseTo(original.totalTime, 5)
              expect(recovered.status).toBe(original.status)
            }

            // 清理
            await manager.deleteRecoveryFile(recoveryFile)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('应该保存并恢复错误上下文', () => {
      fc.assert(
        fc.asyncProperty(
          // 生成简单结果
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              opsPerSecond: fc.float({ min: 0, max: 1000000 }),
              avgTime: fc.float({ min: 0, max: 10000 }),
              minTime: fc.float({ min: 0, max: 10000 }),
              maxTime: fc.float({ min: 0, max: 10000 }),
              stdDev: fc.float({ min: 0, max: 1000 }),
              rme: fc.float({ min: 0, max: 100 }),
              iterations: fc.integer({ min: 1, max: 10000 }),
              totalTime: fc.float({ min: 0, max: 100000 }),
              status: fc.constantFrom('success', 'failed', 'timeout', 'skipped'),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          // 生成错误信息
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            message: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          // 生成元数据
          fc.option(
            fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 }),
              fc.oneof(fc.string(), fc.integer(), fc.boolean()),
            ),
            { nil: undefined },
          ),
          async (results, errorInfo, metadata) => {
            const error = new Error(errorInfo.message)
            error.name = errorInfo.name

            // 保存恢复数据
            const recoveryFile = await manager.saveRecoveryData(
              results as BenchmarkResult[],
              error,
              'test-suite',
              undefined,
              metadata,
            )

            // 加载恢复数据
            const data = await manager.loadRecoveryData(recoveryFile)

            // 验证错误信息
            expect(data.error.name).toBe(errorInfo.name)
            expect(data.error.message).toBe(errorInfo.message)

            // 验证元数据
            if (metadata) {
              expect(data.metadata).toEqual(metadata)
            }

            // 清理
            await manager.deleteRecoveryFile(recoveryFile)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('应该能从恢复文件创建有效的报告', () => {
      fc.assert(
        fc.asyncProperty(
          // 生成结果数组
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              opsPerSecond: fc.float({ min: 0, max: 1000000 }),
              avgTime: fc.float({ min: 0, max: 10000 }),
              minTime: fc.float({ min: 0, max: 10000 }),
              maxTime: fc.float({ min: 0, max: 10000 }),
              stdDev: fc.float({ min: 0, max: 1000 }),
              rme: fc.float({ min: 0, max: 100 }),
              iterations: fc.integer({ min: 1, max: 10000 }),
              totalTime: fc.float({ min: 0, max: 100000 }),
              status: fc.constantFrom('success', 'failed', 'timeout', 'skipped'),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          // 生成套件名称
          fc.string({ minLength: 1, maxLength: 50 }),
          async (results, suiteName) => {
            const error = new Error('Test error')

            // 保存恢复数据
            const recoveryFile = await manager.saveRecoveryData(
              results as BenchmarkResult[],
              error,
              suiteName,
            )

            // 从恢复文件创建报告
            const report = await manager.createReportFromRecovery(recoveryFile)

            // 验证报告结构
            expect(report.name).toBe(suiteName)
            expect(report.suites).toHaveLength(1)
            expect(report.suites[0].name).toBe(suiteName)
            expect(report.suites[0].results).toHaveLength(results.length)

            // 验证结果数据
            for (let i = 0; i < results.length; i++) {
              const original = results[i]
              const reportResult = report.suites[0].results[i]

              expect(reportResult.name).toBe(original.name)
              expect(reportResult.opsPerSecond).toBeCloseTo(original.opsPerSecond, 5)
              expect(reportResult.iterations).toBe(original.iterations)
            }

            // 验证环境信息存在
            expect(report.environment).toBeDefined()
            expect(report.environment.platform).toBeDefined()
            expect(report.environment.arch).toBeDefined()
            expect(report.environment.nodeVersion).toBeDefined()

            // 清理
            await manager.deleteRecoveryFile(recoveryFile)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('createRecoveryManager 工厂函数', () => {
    it('应该创建 RecoveryManager 实例', () => {
      const manager = createRecoveryManager()
      expect(manager).toBeInstanceOf(RecoveryManager)
    })

    it('应该使用自定义目录', () => {
      const manager = createRecoveryManager('.custom-recovery')
      expect(manager).toBeInstanceOf(RecoveryManager)
    })
  })
})
