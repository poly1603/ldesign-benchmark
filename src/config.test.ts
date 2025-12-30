/**
 * 配置系统测试
 * 
 * 包含属性测试和单元测试
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  parseConfigContent,
  serializeConfig,
  ConfigLoader,
  DEFAULT_CONFIG,
  type EnhancedBenchmarkConfig,
} from './config'

/**
 * 生成有效的配置对象的 Arbitrary
 */
const configArbitrary = fc.record({
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  pattern: fc.option(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 })
    ),
    { nil: undefined }
  ),
  ignore: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
    { nil: undefined }
  ),
  outputDir: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  historyDir: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  reporters: fc.option(
    fc.array(
      fc.constantFrom('console', 'json', 'markdown', 'html', 'csv'),
      { minLength: 1, maxLength: 5 }
    ),
    { nil: undefined }
  ),
  defaults: fc.option(
    fc.record({
      time: fc.option(fc.integer({ min: 1, max: 60000 }), { nil: undefined }),
      iterations: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
      warmup: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    }),
    { nil: undefined }
  ),
}) as fc.Arbitrary<Partial<EnhancedBenchmarkConfig>>

/**
 * 深度比较两个对象是否等价
 * 处理 undefined 值的情况
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined && b === undefined) return true
  if (a === null && b === null) return true
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqual(item, b[index]))
  }

  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const keysA = Object.keys(a as object).filter(k => (a as Record<string, unknown>)[k] !== undefined)
    const keysB = Object.keys(b as object).filter(k => (b as Record<string, unknown>)[k] !== undefined)

    if (keysA.length !== keysB.length) return false

    return keysA.every(key => {
      const valA = (a as Record<string, unknown>)[key]
      const valB = (b as Record<string, unknown>)[key]
      return deepEqual(valA, valB)
    })
  }

  return false
}

describe('配置系统', () => {
  describe('属性测试', () => {
    /**
     * 属性 1: 配置格式等价性（往返属性）
     * 
     * *对于任意*有效的配置对象，将其序列化为 JSON 然后解析，
     * 与序列化为 YAML 然后解析，应该产生等价的配置对象。
     * 
     * **Feature: benchmark-enhancement, Property 1: 配置格式等价性**
     * **Validates: Requirements 5.1**
     */
    it('属性 1: JSON 和 YAML 格式应该产生等价的配置对象', () => {
      fc.assert(
        fc.property(configArbitrary, (config) => {
          // 序列化为 JSON 然后解析
          const jsonStr = serializeConfig(config, 'json')
          const fromJson = parseConfigContent(jsonStr, 'config.json')

          // 序列化为 YAML 然后解析
          const yamlStr = serializeConfig(config, 'yaml')
          const fromYaml = parseConfigContent(yamlStr, 'config.yaml')

          // 两种格式解析后应该等价
          return deepEqual(fromJson, fromYaml)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 1 补充: JSON 往返一致性
     * 
     * *对于任意*有效的配置对象，序列化为 JSON 然后解析应该产生等价的对象
     */
    it('属性 1 补充: JSON 往返一致性', () => {
      fc.assert(
        fc.property(configArbitrary, (config) => {
          const jsonStr = serializeConfig(config, 'json')
          const parsed = parseConfigContent(jsonStr, 'config.json')
          return deepEqual(config, parsed)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 1 补充: YAML 往返一致性
     * 
     * *对于任意*有效的配置对象，序列化为 YAML 然后解析应该产生等价的对象
     */
    it('属性 1 补充: YAML 往返一致性', () => {
      fc.assert(
        fc.property(configArbitrary, (config) => {
          const yamlStr = serializeConfig(config, 'yaml')
          const parsed = parseConfigContent(yamlStr, 'config.yaml')
          return deepEqual(config, parsed)
        }),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 2: 配置合并优先级
     * 
     * *对于任意*多层配置（用户级、工作区级、命令行级），合并后的配置中
     * 每个字段的值应该来自优先级最高的配置源（命令行 > 工作区 > 用户级）。
     * 
     * **Feature: benchmark-enhancement, Property 2: 配置合并优先级**
     * **Validates: Requirements 5.2, 5.3**
     */
    it('属性 2: 配置合并优先级 - CLI 覆盖工作区覆盖用户级', () => {
      // 生成三个不同的配置值
      const valueArbitrary = fc.record({
        name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
        outputDir: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      })

      fc.assert(
        fc.property(
          valueArbitrary,
          valueArbitrary,
          valueArbitrary,
          (userConfig, workspaceConfig, cliConfig) => {
            const loader = new ConfigLoader()
            const { config, sources } = loader.mergeWithSources(
              { config: userConfig, source: 'user' },
              { config: workspaceConfig, source: 'workspace' },
              { config: cliConfig, source: 'cli' }
            )

            // 验证每个字段的值来自正确的优先级源
            // CLI > Workspace > User

            // 检查 name 字段
            if (cliConfig.name !== undefined) {
              if (config.name !== cliConfig.name) return false
              if (sources.get('name') !== 'cli') return false
            } else if (workspaceConfig.name !== undefined) {
              if (config.name !== workspaceConfig.name) return false
              if (sources.get('name') !== 'workspace') return false
            } else if (userConfig.name !== undefined) {
              if (config.name !== userConfig.name) return false
              if (sources.get('name') !== 'user') return false
            }

            // 检查 outputDir 字段
            if (cliConfig.outputDir !== undefined) {
              if (config.outputDir !== cliConfig.outputDir) return false
              if (sources.get('outputDir') !== 'cli') return false
            } else if (workspaceConfig.outputDir !== undefined) {
              if (config.outputDir !== workspaceConfig.outputDir) return false
              if (sources.get('outputDir') !== 'workspace') return false
            } else if (userConfig.outputDir !== undefined) {
              if (config.outputDir !== userConfig.outputDir) return false
              if (sources.get('outputDir') !== 'user') return false
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * 属性 2 补充: 后面的配置总是覆盖前面的
     * 
     * *对于任意*配置序列，最终值应该是最后一个定义该字段的配置的值
     */
    it('属性 2 补充: 后面的配置总是覆盖前面的', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (configs) => {
            const loader = new ConfigLoader()
            const merged = loader.merge(...configs)

            // 找到最后一个定义了 name 的配置
            let expectedName: string | undefined
            for (const config of configs) {
              if (config.name !== undefined) {
                expectedName = config.name
              }
            }

            // 如果有任何配置定义了 name，合并后的值应该是最后一个
            if (expectedName !== undefined) {
              return merged.name === expectedName
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  describe('单元测试', () => {
    it('应该正确解析 JSON 配置', () => {
      const jsonContent = JSON.stringify({
        name: 'Test Config',
        pattern: ['**/*.bench.ts'],
        defaults: { time: 1000 },
      })

      const config = parseConfigContent(jsonContent, 'config.json')

      expect(config.name).toBe('Test Config')
      expect(config.pattern).toEqual(['**/*.bench.ts'])
      expect(config.defaults?.time).toBe(1000)
    })

    it('应该正确解析 YAML 配置', () => {
      const yamlContent = `
name: Test Config
pattern:
  - "**/*.bench.ts"
defaults:
  time: 1000
`
      const config = parseConfigContent(yamlContent, 'config.yaml')

      expect(config.name).toBe('Test Config')
      expect(config.pattern).toEqual(['**/*.bench.ts'])
      expect(config.defaults?.time).toBe(1000)
    })

    it('应该正确解析 .yml 扩展名', () => {
      const yamlContent = `name: Test`
      const config = parseConfigContent(yamlContent, 'config.yml')
      expect(config.name).toBe('Test')
    })

    it('应该对无扩展名文件尝试 YAML 解析', () => {
      const yamlContent = `name: Test`
      const config = parseConfigContent(yamlContent, '.benchmarkrc')
      expect(config.name).toBe('Test')
    })

    it('应该正确序列化为 JSON', () => {
      const config = { name: 'Test', pattern: ['*.ts'] }
      const json = serializeConfig(config, 'json')
      expect(JSON.parse(json)).toEqual(config)
    })

    it('应该正确序列化为 YAML', () => {
      const config = { name: 'Test', pattern: ['*.ts'] }
      const yaml = serializeConfig(config, 'yaml')
      expect(yaml).toContain('name: Test')
      expect(yaml).toContain('pattern:')
    })
  })

  describe('ConfigLoader', () => {
    it('应该返回默认配置', () => {
      const loader = new ConfigLoader()
      const config = loader.merge()

      expect(config.pattern).toEqual(DEFAULT_CONFIG.pattern)
      expect(config.ignore).toEqual(DEFAULT_CONFIG.ignore)
    })

    it('应该正确合并配置', () => {
      const loader = new ConfigLoader()
      const config = loader.merge(
        { name: 'Base', pattern: ['*.ts'] },
        { name: 'Override', defaults: { time: 2000 } }
      )

      expect(config.name).toBe('Override')
      expect(config.pattern).toEqual(['*.ts'])
      expect(config.defaults?.time).toBe(2000)
    })

    it('应该按优先级合并配置（后面的覆盖前面的）', () => {
      const loader = new ConfigLoader()
      const config = loader.merge(
        { name: 'User', defaults: { time: 1000, iterations: 10 } },
        { name: 'Workspace', defaults: { time: 2000 } },
        { defaults: { iterations: 20 } }
      )

      // name 应该是 Workspace（最后一个有 name 的配置）
      expect(config.name).toBe('Workspace')
      // time 应该是 2000（Workspace 覆盖了 User）
      expect(config.defaults?.time).toBe(2000)
      // iterations 应该是 20（CLI 覆盖了 User）
      expect(config.defaults?.iterations).toBe(20)
    })

    it('应该深度合并嵌套对象', () => {
      const loader = new ConfigLoader()
      const config = loader.merge(
        {
          defaults: { time: 1000, iterations: 10, warmup: 5 },
          ci: { enabled: true, failOnRegression: false }
        },
        {
          defaults: { time: 2000 },
          ci: { failOnRegression: true }
        }
      )

      // defaults 应该深度合并
      expect(config.defaults?.time).toBe(2000)
      expect(config.defaults?.iterations).toBe(10)
      expect(config.defaults?.warmup).toBe(5)

      // ci 应该深度合并
      expect(config.ci?.enabled).toBe(true)
      expect(config.ci?.failOnRegression).toBe(true)
    })

    it('应该正确跟踪配置来源', () => {
      const loader = new ConfigLoader()
      const { config, sources } = loader.mergeWithSources(
        { config: { name: 'User Config' }, source: 'user' },
        { config: { name: 'Workspace Config', outputDir: './output' }, source: 'workspace' },
        { config: { defaults: { time: 3000 } }, source: 'cli' }
      )

      // 验证配置值
      expect(config.name).toBe('Workspace Config')
      expect(config.outputDir).toBe('./output')
      expect(config.defaults?.time).toBe(3000)

      // 验证来源
      expect(sources.get('name')).toBe('workspace')
      expect(sources.get('outputDir')).toBe('workspace')
      expect(sources.get('defaults')).toBe('cli')
    })
  })

  describe('配置验证', () => {
    it('应该验证有效配置', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        name: 'Test',
        pattern: ['*.ts'],
        defaults: { time: 1000, iterations: 10, warmup: 5 },
      }, '.')  // 使用当前目录，避免加载 schema

      // 如果有 schema 验证错误，打印出来以便调试
      if (!result.valid) {
        console.log('Validation errors:', result.errors)
      }

      // 基本验证应该通过
      const basicErrors = result.errors.filter(e =>
        !e.path.startsWith('/') && !e.path.startsWith('#')
      )
      expect(basicErrors).toHaveLength(0)
    })

    it('应该检测无效的 pattern 类型', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        pattern: 123 as unknown as string,
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'pattern')).toBe(true)
    })

    it('应该检测无效的 time 值', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        defaults: { time: -1 },
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'defaults.time')).toBe(true)
    })

    it('应该检测无效的 iterations 值', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        defaults: { iterations: 0 },
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'defaults.iterations')).toBe(true)
    })

    it('应该检测无效的 warmup 值', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        defaults: { warmup: -1 },
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'defaults.warmup')).toBe(true)
    })

    it('应该检测无效的 regressionThreshold 值', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        ci: { regressionThreshold: 150 },
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'ci.regressionThreshold')).toBe(true)
    })

    it('应该检测无效的 maxWorkers 值', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        parallel: { maxWorkers: 0 },
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.path === 'parallel.maxWorkers')).toBe(true)
    })

    it('应该生成警告但不影响有效性', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        defaults: { time: 50, iterations: 3 },
      }, '.')  // 使用当前目录，避免加载 schema

      // 基本验证应该通过（只有警告，没有错误）
      const basicErrors = result.errors.filter(e =>
        !e.path.startsWith('/') && !e.path.startsWith('#')
      )
      expect(basicErrors).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some(w => w.path === 'defaults.time')).toBe(true)
      expect(result.warnings.some(w => w.path === 'defaults.iterations')).toBe(true)
    })

    it('应该提供清晰的错误消息', () => {
      const loader = new ConfigLoader()
      const result = loader.validate({
        defaults: { time: -100 },
      })

      expect(result.errors[0].message).toContain('大于 0')
      expect(result.errors[0].value).toBe(-100)
    })
  })
})
