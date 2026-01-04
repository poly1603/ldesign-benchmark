/**
 * 插件系统测试
 * 
 * Feature: benchmark-enhancement
 * Property 11: 插件错误隔离
 * Validates: 需求 8.4
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import {
  PluginManager,
  BenchmarkPlugin,
  PluginContext,
  PluginError,
  StatisticsPlugin,
  TrendAnalysisPlugin,
  SlackNotificationPlugin,
  DiscordNotificationPlugin
} from './plugins'
import type { BenchmarkResult } from './types'

/**
 * 创建一个会抛出错误的插件
 */
function createFailingPlugin(name: string, failOn: string[]): BenchmarkPlugin {
  return {
    name,
    version: '1.0.0',
    description: `Failing plugin: ${name}`,

    async install(context: PluginContext) {
      if (failOn.includes('install')) {
        throw new Error(`${name} install failed`)
      }
      context.log(`${name} installed`)
    },

    async uninstall(context: PluginContext) {
      if (failOn.includes('uninstall')) {
        throw new Error(`${name} uninstall failed`)
      }
      context.log(`${name} uninstalled`)
    },

    async processResults(results: BenchmarkResult[]) {
      if (failOn.includes('processResults')) {
        throw new Error(`${name} processResults failed`)
      }
      return results
    },

    async generateReport(results: BenchmarkResult[]) {
      if (failOn.includes('generateReport')) {
        throw new Error(`${name} generateReport failed`)
      }
      return `Report from ${name}`
    },

    async onBenchmarkStart(suite: string, task: string) {
      if (failOn.includes('onBenchmarkStart')) {
        throw new Error(`${name} onBenchmarkStart failed`)
      }
    },

    async onBenchmarkComplete(suite: string, task: string, result: BenchmarkResult) {
      if (failOn.includes('onBenchmarkComplete')) {
        throw new Error(`${name} onBenchmarkComplete failed`)
      }
    },

    async onSuiteStart(suite: string) {
      if (failOn.includes('onSuiteStart')) {
        throw new Error(`${name} onSuiteStart failed`)
      }
    },

    async onSuiteComplete(suite: string, results: BenchmarkResult[]) {
      if (failOn.includes('onSuiteComplete')) {
        throw new Error(`${name} onSuiteComplete failed`)
      }
    },

    async onRunStart() {
      if (failOn.includes('onRunStart')) {
        throw new Error(`${name} onRunStart failed`)
      }
    },

    async onRunComplete(results: BenchmarkResult[]) {
      if (failOn.includes('onRunComplete')) {
        throw new Error(`${name} onRunComplete failed`)
      }
    }
  }
}

/**
 * 创建一个正常工作的插件
 */
function createWorkingPlugin(name: string): BenchmarkPlugin {
  const calls: string[] = []

  return {
    name,
    version: '1.0.0',
    description: `Working plugin: ${name}`,
    calls,

    async install(context: PluginContext) {
      calls.push('install')
      context.log(`${name} installed`)
    },

    async uninstall(context: PluginContext) {
      calls.push('uninstall')
      context.log(`${name} uninstalled`)
    },

    async processResults(results: BenchmarkResult[]) {
      calls.push('processResults')
      return results
    },

    async generateReport() {
      calls.push('generateReport')
      return `Report from ${name}`
    },

    async onBenchmarkStart() {
      calls.push('onBenchmarkStart')
    },

    async onBenchmarkComplete() {
      calls.push('onBenchmarkComplete')
    },

    async onSuiteStart() {
      calls.push('onSuiteStart')
    },

    async onSuiteComplete() {
      calls.push('onSuiteComplete')
    },

    async onRunStart() {
      calls.push('onRunStart')
    },

    async onRunComplete() {
      calls.push('onRunComplete')
    }
  } as BenchmarkPlugin & { calls: string[] }
}

/**
 * 创建模拟的基准测试结果
 */
function createMockResult(name: string): BenchmarkResult {
  return {
    name,
    opsPerSecond: 1000,
    avgTime: 1,
    minTime: 0.5,
    maxTime: 1.5,
    stdDev: 0.1,
    rme: 5,
    iterations: 100,
    totalTime: 100
  }
}


describe('插件系统', () => {
  describe('基本功能', () => {
    it('应该能注册和获取插件', async () => {
      const manager = new PluginManager()
      const plugin = createWorkingPlugin('test-plugin')

      await manager.register(plugin)

      expect(manager.getPlugin('test-plugin')).toBe(plugin)
      expect(manager.getPlugins()).toHaveLength(1)
    })

    it('应该能卸载插件', async () => {
      const manager = new PluginManager()
      const plugin = createWorkingPlugin('test-plugin')

      await manager.register(plugin)
      await manager.unregister('test-plugin')

      expect(manager.getPlugin('test-plugin')).toBeUndefined()
      expect(manager.getPlugins()).toHaveLength(0)
    })

    it('应该支持异步安装', async () => {
      const manager = new PluginManager()
      const plugin: BenchmarkPlugin = {
        name: 'async-plugin',
        version: '1.0.0',
        async install() {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      const result = await manager.register(plugin)

      expect(result.success).toBe(true)
      expect(manager.getPlugin('async-plugin')).toBe(plugin)
    })

    it('应该支持异步卸载', async () => {
      const manager = new PluginManager()
      const plugin: BenchmarkPlugin = {
        name: 'async-plugin',
        version: '1.0.0',
        async uninstall() {
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      await manager.register(plugin)
      const result = await manager.unregister('async-plugin')

      expect(result.success).toBe(true)
      expect(manager.getPlugin('async-plugin')).toBeUndefined()
    })
  })


  describe('属性 11: 插件错误隔离', () => {
    /**
     * 属性 11: 插件错误隔离
     * 
     * *对于任意*插件集合（包含会抛出错误的插件），一个插件的失败不应阻止其他插件的执行，
     * 且所有非失败插件的钩子都应被调用。
     * 
     * **验证: 需求 8.4**
     */
    it('属性 11: 一个插件失败不应阻止其他插件执行', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成插件数量 (2-5)
          fc.integer({ min: 2, max: 5 }),
          // 生成失败插件的索引
          fc.integer({ min: 0, max: 4 }),
          // 生成失败的钩子类型
          fc.constantFrom(
            'processResults',
            'generateReport',
            'onBenchmarkStart',
            'onBenchmarkComplete',
            'onSuiteStart',
            'onSuiteComplete',
            'onRunStart',
            'onRunComplete'
          ),
          async (pluginCount, failingIndex, failingHook) => {
            // 确保 failingIndex 在有效范围内
            const actualFailingIndex = failingIndex % pluginCount

            const manager = new PluginManager({ isolateErrors: true })
            const workingPlugins: (BenchmarkPlugin & { calls: string[] })[] = []

            // 创建插件
            for (let i = 0; i < pluginCount; i++) {
              if (i === actualFailingIndex) {
                const failingPlugin = createFailingPlugin(`failing-plugin-${i}`, [failingHook])
                await manager.register(failingPlugin)
              } else {
                const workingPlugin = createWorkingPlugin(`working-plugin-${i}`) as BenchmarkPlugin & { calls: string[] }
                workingPlugins.push(workingPlugin)
                await manager.register(workingPlugin)
              }
            }

            const mockResults = [createMockResult('test-task')]

            // 执行各种钩子
            await manager.emitRunStart()
            await manager.emitSuiteStart('test-suite')
            await manager.emitBenchmarkStart('test-suite', 'test-task')
            await manager.emitBenchmarkComplete('test-suite', 'test-task', mockResults[0])
            await manager.emitSuiteComplete('test-suite', mockResults)
            await manager.emitRunComplete(mockResults)
            await manager.processResults(mockResults)
            await manager.generateCustomReports(mockResults)

            // 验证所有正常工作的插件都被调用了
            for (const plugin of workingPlugins) {
              expect(plugin.calls).toContain('onRunStart')
              expect(plugin.calls).toContain('onSuiteStart')
              expect(plugin.calls).toContain('onBenchmarkStart')
              expect(plugin.calls).toContain('onBenchmarkComplete')
              expect(plugin.calls).toContain('onSuiteComplete')
              expect(plugin.calls).toContain('onRunComplete')
              expect(plugin.calls).toContain('processResults')
              expect(plugin.calls).toContain('generateReport')
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })


    it('属性 11 补充: 失败的插件应该被记录在执行结果中', async () => {
      await fc.assert(
        fc.asyncProperty(
          // 生成失败的钩子类型
          fc.constantFrom(
            'processResults',
            'generateReport',
            'onBenchmarkStart',
            'onBenchmarkComplete'
          ),
          async (failingHook) => {
            const manager = new PluginManager({ isolateErrors: true })

            const failingPlugin = createFailingPlugin('failing-plugin', [failingHook])
            const workingPlugin = createWorkingPlugin('working-plugin')

            await manager.register(failingPlugin)
            await manager.register(workingPlugin)

            manager.clearExecutionResults()

            const mockResults = [createMockResult('test-task')]

            // 执行会触发失败的钩子
            if (failingHook === 'processResults') {
              await manager.processResults(mockResults)
            } else if (failingHook === 'generateReport') {
              await manager.generateCustomReports(mockResults)
            } else if (failingHook === 'onBenchmarkStart') {
              await manager.emitBenchmarkStart('test-suite', 'test-task')
            } else if (failingHook === 'onBenchmarkComplete') {
              await manager.emitBenchmarkComplete('test-suite', 'test-task', mockResults[0])
            }

            const execResults = manager.getExecutionResults()

            // 应该有失败的执行结果
            const failedResults = execResults.filter(r => !r.success)
            expect(failedResults.length).toBeGreaterThan(0)

            // 失败的结果应该包含错误信息
            const failedResult = failedResults.find(r => r.pluginName === 'failing-plugin')
            expect(failedResult).toBeDefined()
            expect(failedResult?.error).toBeInstanceOf(PluginError)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    it('属性 11 补充: 禁用错误隔离时应该抛出错误', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('processResults', 'onBenchmarkStart'),
          async (failingHook) => {
            const manager = new PluginManager({ isolateErrors: false })

            const failingPlugin = createFailingPlugin('failing-plugin', [failingHook])
            await manager.register(failingPlugin)

            const mockResults = [createMockResult('test-task')]

            let errorThrown = false
            try {
              if (failingHook === 'processResults') {
                await manager.processResults(mockResults)
              } else if (failingHook === 'onBenchmarkStart') {
                await manager.emitBenchmarkStart('test-suite', 'test-task')
              }
            } catch (error) {
              errorThrown = true
              expect(error).toBeInstanceOf(PluginError)
            }

            expect(errorThrown).toBe(true)
            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })


  describe('内置插件', () => {
    it('StatisticsPlugin 应该正确处理结果', async () => {
      const manager = new PluginManager()
      const plugin = new StatisticsPlugin()

      await manager.register(plugin)

      const results = [
        createMockResult('task-1'),
        createMockResult('task-2')
      ]
      results[0].opsPerSecond = 1000
      results[1].opsPerSecond = 2000

      const processed = await manager.processResults(results)

      expect(processed).toHaveLength(2)
    })

    it('TrendAnalysisPlugin 应该生成报告', async () => {
      const manager = new PluginManager()
      const plugin = new TrendAnalysisPlugin()

      await manager.register(plugin)

      const results = [createMockResult('task-1')]
      const reports = await manager.generateCustomReports(results)

      expect(reports.has('trend-analysis')).toBe(true)
      expect(reports.get('trend-analysis')).toContain('趋势分析报告')
    })
  })

  describe('通知插件', () => {
    it('SlackNotificationPlugin 应该正确初始化', async () => {
      const plugin = new SlackNotificationPlugin({
        webhookUrl: 'https://hooks.slack.com/test'
      })

      expect(plugin.name).toBe('slack-notification')
      expect(plugin.version).toBe('1.0.0')
    })

    it('DiscordNotificationPlugin 应该正确初始化', async () => {
      const plugin = new DiscordNotificationPlugin({
        webhookUrl: 'https://discord.com/api/webhooks/test'
      })

      expect(plugin.name).toBe('discord-notification')
      expect(plugin.version).toBe('1.0.0')
    })
  })
})
