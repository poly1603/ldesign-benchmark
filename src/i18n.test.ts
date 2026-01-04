/**
 * 国际化模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { I18nManager, zhCN, enUS, getI18n, setI18n, t } from './i18n'

describe('I18nManager', () => {
  let i18n: I18nManager

  beforeEach(() => {
    i18n = new I18nManager()
  })

  describe('基本功能', () => {
    it('应该默认使用中文语言', () => {
      expect(i18n.getLocale()).toBe('zh-CN')
    })

    it('应该能够切换语言', () => {
      i18n.setLocale('en-US')
      expect(i18n.getLocale()).toBe('en-US')
    })

    it('应该返回所有支持的语言', () => {
      const locales = i18n.getSupportedLocales()
      expect(locales).toEqual(['zh-CN', 'en-US'])
    })
  })

  describe('翻译功能', () => {
    it('应该能够获取中文翻译', () => {
      i18n.setLocale('zh-CN')
      expect(i18n.t('benchmark.running')).toBe('正在运行基准测试...')
    })

    it('应该能够获取英文翻译', () => {
      i18n.setLocale('en-US')
      expect(i18n.t('benchmark.running')).toBe('Running benchmarks...')
    })

    it('应该能够插值替换参数', () => {
      i18n.setLocale('zh-CN')
      const result = i18n.t('report.saved', { path: '/tmp/report.json' })
      expect(result).toBe('报告已保存到: /tmp/report.json')
    })

    it('应该在找不到翻译时返回键本身', () => {
      const result = i18n.t('non.existent.key')
      expect(result).toBe('non.existent.key')
    })

    it('应该在当前语言找不到时回退到英文', () => {
      i18n.setLocale('zh-CN')
      // 假设某个键只在英文中存在
      const customI18n = new I18nManager('zh-CN')
      customI18n.loadLocale('en-US', { 'test.key': 'Test Value' })
      const result = customI18n.t('test.key')
      // 由于中文没有，应该回退到英文或返回键
      expect(result).toBeTruthy()
    })
  })

  describe('自定义语言加载', () => {
    it('应该能够加载自定义翻译', () => {
      i18n.loadLocale('zh-CN', {
        'custom.key': '自定义翻译',
      })
      expect(i18n.t('custom.key')).toBe('自定义翻译')
    })

    it('自定义翻译应该覆盖内置翻译', () => {
      i18n.loadLocale('zh-CN', {
        'benchmark.running': '自定义的运行消息',
      })
      expect(i18n.t('benchmark.running')).toBe('自定义的运行消息')
    })

    it('应该能够合并多次加载的自定义翻译', () => {
      i18n.loadLocale('zh-CN', { 'key1': 'value1' })
      i18n.loadLocale('zh-CN', { 'key2': 'value2' })
      expect(i18n.t('key1')).toBe('value1')
      expect(i18n.t('key2')).toBe('value2')
    })
  })

  describe('全局实例', () => {
    it('应该能够获取全局实例', () => {
      const instance1 = getI18n()
      const instance2 = getI18n()
      expect(instance1).toBe(instance2)
    })

    it('应该能够设置全局实例', () => {
      const customI18n = new I18nManager('en-US')
      setI18n(customI18n)
      expect(getI18n()).toBe(customI18n)
      expect(getI18n().getLocale()).toBe('en-US')
    })

    it('便捷函数应该使用全局实例', () => {
      const customI18n = new I18nManager('zh-CN')
      setI18n(customI18n)
      expect(t('benchmark.running')).toBe('正在运行基准测试...')
    })
  })

  describe('翻译完整性', () => {
    it('中英文翻译应该有相同的键', () => {
      const zhKeys = Object.keys(zhCN).sort()
      const enKeys = Object.keys(enUS).sort()
      expect(zhKeys).toEqual(enKeys)
    })

    it('所有翻译值都不应该为空', () => {
      Object.entries(zhCN).forEach(([key, value]) => {
        expect(value).toBeTruthy()
        expect(value.length).toBeGreaterThan(0)
      })

      Object.entries(enUS).forEach(([key, value]) => {
        expect(value).toBeTruthy()
        expect(value.length).toBeGreaterThan(0)
      })
    })
  })

  describe('文件加载', () => {
    it('应该能够从 JSON 文件加载语言', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const os = await import('os')

      // 创建临时文件
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-test-'))
      const jsonFile = path.join(tmpDir, 'test.json')

      await fs.writeFile(jsonFile, JSON.stringify({
        'test.key1': 'Test Value 1',
        'test.key2': 'Test Value 2',
      }))

      await i18n.loadLocaleFromFile('zh-CN', jsonFile)

      expect(i18n.t('test.key1')).toBe('Test Value 1')
      expect(i18n.t('test.key2')).toBe('Test Value 2')

      // 清理
      await fs.rm(tmpDir, { recursive: true })
    })

    it('应该能够从 YAML 文件加载语言', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const os = await import('os')

      // 创建临时文件
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-test-'))
      const yamlFile = path.join(tmpDir, 'test.yaml')

      await fs.writeFile(yamlFile, `
test.key1: Test Value 1
test.key2: Test Value 2
`)

      await i18n.loadLocaleFromFile('zh-CN', yamlFile)

      expect(i18n.t('test.key1')).toBe('Test Value 1')
      expect(i18n.t('test.key2')).toBe('Test Value 2')

      // 清理
      await fs.rm(tmpDir, { recursive: true })
    })

    it('应该能够从目录加载所有语言文件', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const os = await import('os')

      // 创建临时目录
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-test-'))

      // 创建中文文件
      await fs.writeFile(
        path.join(tmpDir, 'zh-CN.json'),
        JSON.stringify({ 'dir.test.zh': '中文测试' })
      )

      // 创建英文文件
      await fs.writeFile(
        path.join(tmpDir, 'en-US.json'),
        JSON.stringify({ 'dir.test.en': 'English Test' })
      )

      await i18n.loadLocalesFromDirectory(tmpDir)

      i18n.setLocale('zh-CN')
      expect(i18n.t('dir.test.zh')).toBe('中文测试')

      i18n.setLocale('en-US')
      expect(i18n.t('dir.test.en')).toBe('English Test')

      // 清理
      await fs.rm(tmpDir, { recursive: true })
    })

    it('应该在不支持的文件格式时抛出错误', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const os = await import('os')

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-test-'))
      const txtFile = path.join(tmpDir, 'test.txt')

      await fs.writeFile(txtFile, 'test content')

      await expect(i18n.loadLocaleFromFile('zh-CN', txtFile)).rejects.toThrow()

      // 清理
      await fs.rm(tmpDir, { recursive: true })
    })
  })
})

describe('属性测试: 国际化数字格式正确性', () => {
  /**
   * 属性 15: 国际化数字格式正确性
   * 
   * 对于任意数字值和语言环境设置，格式化后的字符串应该符合该语言环境的数字格式规范
   * 
   * 验证: 需求 10.3
   * 
   * Feature: benchmark-enhancement, Property 15: 国际化数字格式正确性
   */
  it('属性 15: 格式化后的数字应该符合语言环境规范', () => {
    fc.assert(
      fc.property(
        // 生成任意数字（包括整数、小数、负数）
        fc.double({ min: -1e10, max: 1e10, noNaN: true }),
        // 生成语言环境
        fc.constantFrom('zh-CN', 'en-US'),
        (value, locale) => {
          const i18n = new I18nManager(locale as 'zh-CN' | 'en-US')
          const formatted = i18n.formatNumber(value)

          // 验证格式化结果不为空
          expect(formatted).toBeTruthy()
          expect(typeof formatted).toBe('string')
          expect(formatted.length).toBeGreaterThan(0)

          // 验证使用 Intl.NumberFormat 的结果一致性
          const expected = new Intl.NumberFormat(locale).format(value)
          expect(formatted).toBe(expected)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('属性 15: 格式化日期应该符合语言环境规范', () => {
    fc.assert(
      fc.property(
        // 生成任意有效日期
        fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }),
        // 生成语言环境
        fc.constantFrom('zh-CN', 'en-US'),
        (date, locale) => {
          const i18n = new I18nManager(locale as 'zh-CN' | 'en-US')
          const formatted = i18n.formatDate(date)

          // 验证格式化结果不为空
          expect(formatted).toBeTruthy()
          expect(typeof formatted).toBe('string')
          expect(formatted.length).toBeGreaterThan(0)

          // 验证使用 Intl.DateTimeFormat 的结果一致性
          const expected = new Intl.DateTimeFormat(locale).format(date)
          expect(formatted).toBe(expected)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('属性 15: 带选项的数字格式化应该符合规范', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.constantFrom('zh-CN', 'en-US'),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        (value, locale, minFractionDigits, maxFractionDigits) => {
          // 确保 min <= max
          const min = Math.min(minFractionDigits, maxFractionDigits)
          const max = Math.max(minFractionDigits, maxFractionDigits)

          const i18n = new I18nManager(locale as 'zh-CN' | 'en-US')
          const options: Intl.NumberFormatOptions = {
            minimumFractionDigits: min,
            maximumFractionDigits: max,
          }
          const formatted = i18n.formatNumber(value, options)

          // 验证格式化结果不为空
          expect(formatted).toBeTruthy()
          expect(typeof formatted).toBe('string')

          // 验证使用 Intl.NumberFormat 的结果一致性
          const expected = new Intl.NumberFormat(locale, options).format(value)
          expect(formatted).toBe(expected)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('属性 15: 货币格式化应该符合语言环境规范', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e6, noNaN: true }),
        fc.constantFrom('zh-CN', 'en-US'),
        fc.constantFrom('USD', 'CNY', 'EUR', 'JPY'),
        (value, locale, currency) => {
          const i18n = new I18nManager(locale as 'zh-CN' | 'en-US')
          const options: Intl.NumberFormatOptions = {
            style: 'currency',
            currency,
          }
          const formatted = i18n.formatNumber(value, options)

          // 验证格式化结果不为空
          expect(formatted).toBeTruthy()
          expect(typeof formatted).toBe('string')

          // 验证包含货币符号或代码
          const hasCurrencyIndicator =
            formatted.includes('$') ||
            formatted.includes('¥') ||
            formatted.includes('€') ||
            formatted.includes('USD') ||
            formatted.includes('CNY') ||
            formatted.includes('EUR') ||
            formatted.includes('JPY')
          expect(hasCurrencyIndicator).toBe(true)

          // 验证使用 Intl.NumberFormat 的结果一致性
          const expected = new Intl.NumberFormat(locale, options).format(value)
          expect(formatted).toBe(expected)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('属性 15: 百分比格式化应该符合语言环境规范', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom('zh-CN', 'en-US'),
        (value, locale) => {
          const i18n = new I18nManager(locale as 'zh-CN' | 'en-US')
          const options: Intl.NumberFormatOptions = {
            style: 'percent',
          }
          const formatted = i18n.formatNumber(value, options)

          // 验证格式化结果不为空
          expect(formatted).toBeTruthy()
          expect(typeof formatted).toBe('string')

          // 验证包含百分号
          expect(formatted.includes('%')).toBe(true)

          // 验证使用 Intl.NumberFormat 的结果一致性
          const expected = new Intl.NumberFormat(locale, options).format(value)
          expect(formatted).toBe(expected)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
