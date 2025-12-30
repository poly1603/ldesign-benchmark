/**
 * 配置加载器 - 支持 JSON 和 YAML 格式
 * 
 * @module config
 */

import { readFileSync, existsSync } from 'node:fs'
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml'
import path from 'node:path'
import Ajv from 'ajv'
import type { BenchmarkConfig } from './types'

/**
 * 验证错误
 */
export interface ValidationError {
  /** 错误路径 */
  path: string
  /** 错误消息 */
  message: string
  /** 错误值 */
  value?: unknown
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  /** 警告路径 */
  path: string
  /** 警告消息 */
  message: string
  /** 建议 */
  suggestion?: string
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean
  /** 错误列表 */
  errors: ValidationError[]
  /** 警告列表 */
  warnings: ValidationWarning[]
}

/**
 * 增强的配置结构
 */
export interface EnhancedBenchmarkConfig extends BenchmarkConfig {
  /** 配置名称 */
  name?: string
  /** 配置描述 */
  description?: string

  /** CI/CD 配置 */
  ci?: {
    enabled?: boolean
    provider?: 'github' | 'gitlab' | 'jenkins' | 'azure'
    failOnRegression?: boolean
    regressionThreshold?: number
    annotations?: boolean
  }

  /** 并行执行配置 */
  parallel?: {
    enabled?: boolean
    maxWorkers?: number
    isolate?: boolean
  }

  /** 存储配置 */
  storage?: {
    type?: 'json' | 'sqlite'
    path?: string
    retention?: {
      maxAge?: number  // 天数
      maxCount?: number
    }
  }

  /** 国际化配置 */
  locale?: {
    language?: 'zh-CN' | 'en-US'
    dateFormat?: string
    numberFormat?: string
  }
}

/**
 * 配置源类型
 */
export type ConfigSource = 'user' | 'workspace' | 'cli'

/**
 * 带来源的配置
 */
export interface ConfigWithSource {
  config: Partial<EnhancedBenchmarkConfig>
  source: ConfigSource
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: EnhancedBenchmarkConfig = {
  pattern: ['**/*.bench.{js,ts}'],
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  outputDir: './benchmark-reports',
  historyDir: './.benchmark-history',
  reporters: ['console'],
  defaults: {
    time: 1000,
    iterations: 10,
    warmup: 5,
  },
}

/**
 * 配置文件搜索路径
 */
const CONFIG_SEARCH_PATHS = [
  'benchmark.config.json',
  'benchmark.config.yaml',
  'benchmark.config.yml',
  '.benchmarkrc',
  '.benchmarkrc.json',
  '.benchmarkrc.yaml',
  '.benchmarkrc.yml',
]

/**
 * 用户级配置路径
 */
function getUserConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  return path.join(home, '.config', 'ldesign-benchmark', 'config.yaml')
}

/**
 * 解析配置文件内容
 * 
 * @param content - 文件内容
 * @param filePath - 文件路径（用于确定格式）
 * @returns 解析后的配置对象
 */
export function parseConfigContent(content: string, filePath: string): Partial<EnhancedBenchmarkConfig> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.yaml' || ext === '.yml') {
    return parseYAML(content) as Partial<EnhancedBenchmarkConfig>
  }

  // 默认尝试 JSON 解析
  try {
    return JSON.parse(content) as Partial<EnhancedBenchmarkConfig>
  } catch {
    // 如果 JSON 解析失败，尝试 YAML（支持无扩展名的 .benchmarkrc）
    return parseYAML(content) as Partial<EnhancedBenchmarkConfig>
  }
}

/**
 * 序列化配置为字符串
 * 
 * @param config - 配置对象
 * @param format - 输出格式
 * @returns 序列化后的字符串
 */
export function serializeConfig(
  config: Partial<EnhancedBenchmarkConfig>,
  format: 'json' | 'yaml'
): string {
  if (format === 'yaml') {
    return stringifyYAML(config)
  }
  return JSON.stringify(config, null, 2)
}

/**
 * 深度合并两个对象
 * 
 * @param target - 目标对象
 * @param source - 源对象
 * @returns 合并后的对象
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as T

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key]
    const targetValue = result[key]

    if (sourceValue === undefined) {
      continue
    }

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as object,
        sourceValue as object
      ) as T[keyof T]
    } else {
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * 配置加载器类
 */
export class ConfigLoader {
  private schemaValidator: Ajv | null = null
  private schema: object | null = null

  constructor() {
    this.initValidator()
  }

  /**
   * 初始化 JSON Schema 验证器
   */
  private initValidator(): void {
    try {
      this.schemaValidator = new Ajv({ allErrors: true, verbose: true })
      // Schema 将在 validate 方法中按需加载
    } catch {
      // 如果 Ajv 初始化失败，验证将被跳过
      this.schemaValidator = null
    }
  }

  /**
   * 加载 JSON Schema
   */
  private loadSchema(cwd: string): object | null {
    if (this.schema) {
      return this.schema
    }

    const schemaPath = path.join(cwd, 'benchmark.schema.json')
    if (existsSync(schemaPath)) {
      try {
        const content = readFileSync(schemaPath, 'utf-8')
        this.schema = JSON.parse(content)
        return this.schema
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * 从文件加载配置
   * 
   * @param filePath - 配置文件路径
   * @returns 配置对象
   */
  loadFromFile(filePath: string): Partial<EnhancedBenchmarkConfig> {
    if (!existsSync(filePath)) {
      throw new Error(`配置文件不存在: ${filePath}`)
    }

    const content = readFileSync(filePath, 'utf-8')
    return parseConfigContent(content, filePath)
  }

  /**
   * 搜索并加载配置文件
   * 
   * @param cwd - 工作目录
   * @param configPath - 指定的配置文件路径（可选）
   * @returns 配置对象和文件路径
   */
  findAndLoad(cwd: string, configPath?: string): { config: Partial<EnhancedBenchmarkConfig>; path: string } | null {
    // 如果指定了配置文件路径
    if (configPath) {
      const fullPath = path.isAbsolute(configPath) ? configPath : path.join(cwd, configPath)
      if (existsSync(fullPath)) {
        return {
          config: this.loadFromFile(fullPath),
          path: fullPath,
        }
      }
      throw new Error(`指定的配置文件不存在: ${configPath}`)
    }

    // 搜索默认配置文件
    for (const searchPath of CONFIG_SEARCH_PATHS) {
      const fullPath = path.join(cwd, searchPath)
      if (existsSync(fullPath)) {
        return {
          config: this.loadFromFile(fullPath),
          path: fullPath,
        }
      }
    }

    return null
  }

  /**
   * 加载用户级配置
   * 
   * @returns 用户级配置
   */
  loadUserConfig(): Partial<EnhancedBenchmarkConfig> | null {
    const userConfigPath = getUserConfigPath()
    if (existsSync(userConfigPath)) {
      try {
        return this.loadFromFile(userConfigPath)
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * 加载完整配置（合并所有层级）
   * 
   * @param cwd - 工作目录
   * @param configPath - 指定的配置文件路径（可选）
   * @param cliOptions - 命令行选项（可选）
   * @returns 合并后的配置
   */
  load(
    cwd: string = process.cwd(),
    configPath?: string,
    cliOptions?: Partial<EnhancedBenchmarkConfig>
  ): EnhancedBenchmarkConfig {
    // 1. 从默认配置开始
    let config: EnhancedBenchmarkConfig = { ...DEFAULT_CONFIG }

    // 2. 合并用户级配置
    const userConfig = this.loadUserConfig()
    if (userConfig) {
      config = deepMerge(config, userConfig)
    }

    // 3. 合并工作区配置
    const workspaceResult = this.findAndLoad(cwd, configPath)
    if (workspaceResult) {
      config = deepMerge(config, workspaceResult.config)
    }

    // 4. 合并命令行选项（最高优先级）
    if (cliOptions) {
      config = deepMerge(config, cliOptions)
    }

    return config
  }

  /**
   * 合并多个配置
   * 
   * @param configs - 配置数组（按优先级从低到高）
   * @returns 合并后的配置
   */
  merge(...configs: Array<Partial<EnhancedBenchmarkConfig>>): EnhancedBenchmarkConfig {
    let result: EnhancedBenchmarkConfig = { ...DEFAULT_CONFIG }

    for (const config of configs) {
      result = deepMerge(result, config)
    }

    return result
  }

  /**
   * 合并配置并跟踪来源
   * 
   * @param configs - 带来源的配置数组（按优先级从低到高）
   * @returns 合并后的配置和来源映射
   */
  mergeWithSources(
    ...configs: Array<ConfigWithSource>
  ): { config: EnhancedBenchmarkConfig; sources: Map<string, ConfigSource> } {
    let result: EnhancedBenchmarkConfig = { ...DEFAULT_CONFIG }
    const sources = new Map<string, ConfigSource>()

    // 记录默认配置的来源
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      sources.set(key, 'user')
    }

    for (const { config, source } of configs) {
      // 记录每个配置项的来源
      for (const key of Object.keys(config)) {
        if ((config as Record<string, unknown>)[key] !== undefined) {
          sources.set(key, source)
          // 递归记录嵌套属性的来源
          const value = (config as Record<string, unknown>)[key]
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const nestedKey of Object.keys(value)) {
              sources.set(`${key}.${nestedKey}`, source)
            }
          }
        }
      }
      result = deepMerge(result, config)
    }

    return { config: result, sources }
  }

  /**
   * 验证配置
   * 
   * @param config - 配置对象
   * @param cwd - 工作目录（用于加载 schema）
   * @returns 验证结果
   */
  validate(config: Partial<EnhancedBenchmarkConfig>, cwd: string = process.cwd()): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // 基本验证
    if (config.pattern !== undefined) {
      if (!Array.isArray(config.pattern) && typeof config.pattern !== 'string') {
        errors.push({
          path: 'pattern',
          message: 'pattern 必须是字符串或字符串数组',
          value: config.pattern,
        })
      }
    }

    if (config.defaults?.time !== undefined && config.defaults.time <= 0) {
      errors.push({
        path: 'defaults.time',
        message: 'time 必须大于 0',
        value: config.defaults.time,
      })
    }

    if (config.defaults?.iterations !== undefined && config.defaults.iterations <= 0) {
      errors.push({
        path: 'defaults.iterations',
        message: 'iterations 必须大于 0',
        value: config.defaults.iterations,
      })
    }

    if (config.defaults?.warmup !== undefined && config.defaults.warmup < 0) {
      errors.push({
        path: 'defaults.warmup',
        message: 'warmup 不能为负数',
        value: config.defaults.warmup,
      })
    }

    // CI 配置验证
    if (config.ci) {
      if (config.ci.regressionThreshold !== undefined) {
        if (config.ci.regressionThreshold < 0 || config.ci.regressionThreshold > 100) {
          errors.push({
            path: 'ci.regressionThreshold',
            message: 'regressionThreshold 必须在 0-100 之间',
            value: config.ci.regressionThreshold,
          })
        }
      }
    }

    // 并行配置验证
    if (config.parallel) {
      if (config.parallel.maxWorkers !== undefined && config.parallel.maxWorkers <= 0) {
        errors.push({
          path: 'parallel.maxWorkers',
          message: 'maxWorkers 必须大于 0',
          value: config.parallel.maxWorkers,
        })
      }
    }

    // 存储配置验证
    if (config.storage) {
      if (config.storage.type && !['json', 'sqlite'].includes(config.storage.type)) {
        errors.push({
          path: 'storage.type',
          message: 'storage.type 必须是 "json" 或 "sqlite"',
          value: config.storage.type,
        })
      }

      if (config.storage.retention) {
        if (config.storage.retention.maxAge !== undefined && config.storage.retention.maxAge < 0) {
          errors.push({
            path: 'storage.retention.maxAge',
            message: 'maxAge 不能为负数',
            value: config.storage.retention.maxAge,
          })
        }
        if (config.storage.retention.maxCount !== undefined && config.storage.retention.maxCount < 0) {
          errors.push({
            path: 'storage.retention.maxCount',
            message: 'maxCount 不能为负数',
            value: config.storage.retention.maxCount,
          })
        }
      }
    }

    // 警告检查
    if (config.defaults?.time !== undefined && config.defaults.time < 100) {
      warnings.push({
        path: 'defaults.time',
        message: '运行时间过短可能导致结果不准确',
        suggestion: '建议设置 time >= 100ms',
      })
    }

    if (config.defaults?.iterations !== undefined && config.defaults.iterations < 5) {
      warnings.push({
        path: 'defaults.iterations',
        message: '迭代次数过少可能导致结果不准确',
        suggestion: '建议设置 iterations >= 5',
      })
    }

    // JSON Schema 验证（如果可用）
    if (this.schemaValidator) {
      const schema = this.loadSchema(cwd)
      if (schema) {
        const validate = this.schemaValidator.compile(schema)
        const valid = validate(config)

        if (!valid && validate.errors) {
          for (const error of validate.errors) {
            errors.push({
              path: error.instancePath || error.schemaPath,
              message: error.message || '验证失败',
              value: error.data,
            })
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }
}

/**
 * 创建配置加载器实例
 */
export function createConfigLoader(): ConfigLoader {
  return new ConfigLoader()
}

/**
 * 便捷函数：加载配置
 */
export function loadConfig(
  cwd?: string,
  configPath?: string,
  cliOptions?: Partial<EnhancedBenchmarkConfig>
): EnhancedBenchmarkConfig {
  const loader = createConfigLoader()
  return loader.load(cwd, configPath, cliOptions)
}

/**
 * 便捷函数：验证配置
 */
export function validateConfig(
  config: Partial<EnhancedBenchmarkConfig>,
  cwd?: string
): ValidationResult {
  const loader = createConfigLoader()
  return loader.validate(config, cwd)
}
