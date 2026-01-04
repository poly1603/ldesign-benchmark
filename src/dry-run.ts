/**
 * Dry-run 模式
 * 
 * 验证配置但不执行测试，输出将要执行的任务列表
 */

import type { BenchmarkConfig, BenchmarkOptions } from './types'

/**
 * Dry-run 任务信息
 */
export interface DryRunTask {
  /** 任务名称 */
  name: string
  /** 套件名称 */
  suite: string
  /** 配置选项 */
  options: Partial<BenchmarkOptions>
  /** 标签 */
  tags?: string[]
}

/**
 * Dry-run 结果
 */
export interface DryRunResult {
  /** 是否有效 */
  valid: boolean
  /** 总套件数 */
  totalSuites: number
  /** 总任务数 */
  totalTasks: number
  /** 任务列表 */
  tasks: DryRunTask[]
  /** 配置信息 */
  config?: BenchmarkConfig
  /** 验证错误 */
  errors: string[]
  /** 警告信息 */
  warnings: string[]
}

/**
 * Dry-run 执行器
 */
export class DryRunExecutor {
  private tasks: DryRunTask[] = []
  private errors: string[] = []
  private warnings: string[] = []
  private config?: BenchmarkConfig

  /**
   * 设置配置
   */
  setConfig(config: BenchmarkConfig): void {
    this.config = config
    this.validateConfig()
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config) {
      this.errors.push('No configuration provided')
      return
    }

    // 验证 pattern
    if (!this.config.pattern || (Array.isArray(this.config.pattern) && this.config.pattern.length === 0)) {
      this.warnings.push('No test pattern specified, will use default pattern')
    }

    // 验证 outputDir
    if (!this.config.outputDir) {
      this.warnings.push('No output directory specified, will use default')
    }

    // 验证 defaults
    if (this.config.defaults) {
      const { time, iterations, warmup, timeout } = this.config.defaults

      if (time !== undefined && time < 0) {
        this.errors.push(`Invalid default time: ${time} (must be >= 0)`)
      }

      if (iterations !== undefined && iterations < 0) {
        this.errors.push(`Invalid default iterations: ${iterations} (must be >= 0)`)
      }

      if (warmup !== undefined && warmup < 0) {
        this.errors.push(`Invalid default warmup: ${warmup} (must be >= 0)`)
      }

      if (timeout !== undefined && timeout < 0) {
        this.errors.push(`Invalid default timeout: ${timeout} (must be >= 0)`)
      }
    }

    // 验证 thresholds
    if (this.config.thresholds) {
      for (const [key, threshold] of Object.entries(this.config.thresholds)) {
        if (threshold.maxAvgTime !== undefined && threshold.maxAvgTime < 0) {
          this.errors.push(`Invalid threshold for "${key}": maxAvgTime must be >= 0`)
        }

        if (threshold.minOpsPerSecond !== undefined && threshold.minOpsPerSecond < 0) {
          this.errors.push(`Invalid threshold for "${key}": minOpsPerSecond must be >= 0`)
        }

        if (threshold.maxRme !== undefined && (threshold.maxRme < 0 || threshold.maxRme > 100)) {
          this.errors.push(`Invalid threshold for "${key}": maxRme must be between 0 and 100`)
        }
      }
    }
  }

  /**
   * 添加任务
   */
  addTask(task: DryRunTask): void {
    this.tasks.push(task)
    this.validateTask(task)
  }

  /**
   * 验证任务
   */
  private validateTask(task: DryRunTask): void {
    if (!task.name || task.name.trim() === '') {
      this.errors.push(`Task in suite "${task.suite}" has empty name`)
    }

    if (!task.suite || task.suite.trim() === '') {
      this.errors.push(`Task "${task.name}" has empty suite name`)
    }

    if (task.options) {
      const { time, iterations, warmup, timeout } = task.options

      if (time !== undefined && time < 0) {
        this.warnings.push(`Task "${task.name}" has negative time: ${time}`)
      }

      if (iterations !== undefined && iterations < 0) {
        this.warnings.push(`Task "${task.name}" has negative iterations: ${iterations}`)
      }

      if (warmup !== undefined && warmup < 0) {
        this.warnings.push(`Task "${task.name}" has negative warmup: ${warmup}`)
      }

      if (timeout !== undefined && timeout < 0) {
        this.warnings.push(`Task "${task.name}" has negative timeout: ${timeout}`)
      }
    }
  }

  /**
   * 获取结果
   */
  getResult(): DryRunResult {
    const suites = new Set(this.tasks.map(t => t.suite))

    return {
      valid: this.errors.length === 0,
      totalSuites: suites.size,
      totalTasks: this.tasks.length,
      tasks: this.tasks,
      config: this.config,
      errors: this.errors,
      warnings: this.warnings,
    }
  }

  /**
   * 打印结果
   */
  printResult(): void {
    const result = this.getResult()

    console.log('\n' + '='.repeat(80))
    console.log('🔍 Dry-run 模式 - 配置验证')
    console.log('='.repeat(80))

    // 打印配置信息
    if (result.config) {
      console.log('\n📋 配置信息:')
      console.log(`  Pattern: ${JSON.stringify(result.config.pattern)}`)
      console.log(`  Output Dir: ${result.config.outputDir || '(default)'}`)
      console.log(`  History Dir: ${result.config.historyDir || '(default)'}`)

      if (result.config.defaults) {
        console.log('\n  默认选项:')
        if (result.config.defaults.time !== undefined) {
          console.log(`    Time: ${result.config.defaults.time}ms`)
        }
        if (result.config.defaults.iterations !== undefined) {
          console.log(`    Iterations: ${result.config.defaults.iterations}`)
        }
        if (result.config.defaults.warmup !== undefined) {
          console.log(`    Warmup: ${result.config.defaults.warmup}`)
        }
        if (result.config.defaults.timeout !== undefined) {
          console.log(`    Timeout: ${result.config.defaults.timeout}ms`)
        }
      }

      if (result.config.reporters && result.config.reporters.length > 0) {
        console.log(`\n  Reporters: ${result.config.reporters.join(', ')}`)
      }

      if (result.config.plugins && result.config.plugins.length > 0) {
        console.log(`\n  Plugins: ${result.config.plugins.join(', ')}`)
      }
    }

    // 打印统计信息
    console.log('\n📊 统计信息:')
    console.log(`  总套件数: ${result.totalSuites}`)
    console.log(`  总任务数: ${result.totalTasks}`)

    // 打印任务列表
    if (result.tasks.length > 0) {
      console.log('\n📝 将要执行的任务:')

      const tasksBySuite = new Map<string, DryRunTask[]>()
      for (const task of result.tasks) {
        if (!tasksBySuite.has(task.suite)) {
          tasksBySuite.set(task.suite, [])
        }
        tasksBySuite.get(task.suite)!.push(task)
      }

      for (const [suite, tasks] of tasksBySuite) {
        console.log(`\n  📦 ${suite}`)
        for (const task of tasks) {
          const tags = task.tags && task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : ''
          console.log(`    ✓ ${task.name}${tags}`)

          // 打印任务特定的配置
          if (task.options && Object.keys(task.options).length > 0) {
            const opts: string[] = []
            if (task.options.time !== undefined) opts.push(`time: ${task.options.time}ms`)
            if (task.options.iterations !== undefined)
              opts.push(`iterations: ${task.options.iterations}`)
            if (task.options.warmup !== undefined) opts.push(`warmup: ${task.options.warmup}`)
            if (task.options.timeout !== undefined) opts.push(`timeout: ${task.options.timeout}ms`)

            if (opts.length > 0) {
              console.log(`      (${opts.join(', ')})`)
            }
          }
        }
      }
    }

    // 打印警告
    if (result.warnings.length > 0) {
      console.log('\n⚠️  警告:')
      for (const warning of result.warnings) {
        console.log(`  - ${warning}`)
      }
    }

    // 打印错误
    if (result.errors.length > 0) {
      console.log('\n❌ 错误:')
      for (const error of result.errors) {
        console.log(`  - ${error}`)
      }
    }

    // 打印验证结果
    console.log('\n' + '='.repeat(80))
    if (result.valid) {
      console.log('✅ 配置验证通过 - 可以开始运行基准测试')
    } else {
      console.log('❌ 配置验证失败 - 请修复上述错误后重试')
    }
    console.log('='.repeat(80) + '\n')
  }

  /**
   * 清空
   */
  clear(): void {
    this.tasks = []
    this.errors = []
    this.warnings = []
    this.config = undefined
  }
}

/**
 * 创建 dry-run 执行器
 */
export function createDryRunExecutor(): DryRunExecutor {
  return new DryRunExecutor()
}
