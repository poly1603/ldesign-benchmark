/**
 * 国际化管理器
 * Internationalization Manager
 */

export type Locale = 'zh-CN' | 'en-US'

export interface I18nMessages {
  [key: string]: string
}

/**
 * 国际化管理器类
 */
export class I18nManager {
  private locale: Locale
  private messages: Map<Locale, I18nMessages>
  private customMessages: Map<Locale, I18nMessages>

  constructor(locale: Locale = 'zh-CN') {
    this.locale = locale
    this.messages = new Map()
    this.customMessages = new Map()
    this.loadBuiltinLocales()
  }

  /**
   * 加载内置语言包
   */
  private loadBuiltinLocales(): void {
    this.messages.set('zh-CN', zhCN)
    this.messages.set('en-US', enUS)
  }

  /**
   * 设置当前语言
   */
  setLocale(locale: Locale): void {
    this.locale = locale
  }

  /**
   * 获取当前语言
   */
  getLocale(): Locale {
    return this.locale
  }

  /**
   * 获取翻译文本
   * @param key - 翻译键
   * @param params - 参数对象，用于替换占位符
   */
  t(key: string, params?: Record<string, unknown>): string {
    // 优先从自定义消息中查找
    const customMsg = this.customMessages.get(this.locale)?.[key]
    if (customMsg) {
      return this.interpolate(customMsg, params)
    }

    // 从内置消息中查找
    const msg = this.messages.get(this.locale)?.[key]
    if (msg) {
      return this.interpolate(msg, params)
    }

    // 如果当前语言找不到，尝试回退到英文
    if (this.locale !== 'en-US') {
      const fallbackMsg = this.messages.get('en-US')?.[key]
      if (fallbackMsg) {
        return this.interpolate(fallbackMsg, params)
      }
    }

    // 如果都找不到，返回键本身
    return key
  }

  /**
   * 插值替换占位符
   */
  private interpolate(template: string, params?: Record<string, unknown>): string {
    if (!params) {
      return template
    }

    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match
    })
  }

  /**
   * 格式化数字
   */
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale, options).format(value)
  }

  /**
   * 格式化日期
   */
  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale, options).format(date)
  }

  /**
   * 加载自定义语言文件
   * @param locale - 语言代码
   * @param messages - 翻译消息对象
   */
  loadLocale(locale: Locale, messages: I18nMessages): void {
    const existing = this.customMessages.get(locale) || {}
    this.customMessages.set(locale, { ...existing, ...messages })
  }

  /**
   * 获取所有支持的语言
   */
  getSupportedLocales(): Locale[] {
    return ['zh-CN', 'en-US']
  }

  /**
   * 从文件加载自定义语言
   * @param locale - 语言代码
   * @param filePath - 文件路径（JSON 或 YAML）
   */
  async loadLocaleFromFile(locale: Locale, filePath: string): Promise<void> {
    const fs = await import('fs/promises')
    const path = await import('path')

    const content = await fs.readFile(filePath, 'utf-8')
    const ext = path.extname(filePath).toLowerCase()

    let messages: I18nMessages

    if (ext === '.json') {
      messages = JSON.parse(content)
    } else if (ext === '.yaml' || ext === '.yml') {
      const { parse } = await import('yaml')
      messages = parse(content)
    } else {
      throw new Error(`Unsupported file format: ${ext}. Only .json, .yaml, and .yml are supported.`)
    }

    this.loadLocale(locale, messages)
  }

  /**
   * 从目录加载所有语言文件
   * @param dirPath - 目录路径
   */
  async loadLocalesFromDirectory(dirPath: string): Promise<void> {
    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      const files = await fs.readdir(dirPath)

      for (const file of files) {
        const filePath = path.join(dirPath, file)
        const stat = await fs.stat(filePath)

        if (!stat.isFile()) {
          continue
        }

        const ext = path.extname(file).toLowerCase()
        if (!['.json', '.yaml', '.yml'].includes(ext)) {
          continue
        }

        // 从文件名推断语言代码
        // 例如: zh-CN.json, en-US.yaml
        const basename = path.basename(file, ext)
        if (basename === 'zh-CN' || basename === 'en-US') {
          await this.loadLocaleFromFile(basename as Locale, filePath)
        }
      }
    } catch (error) {
      // 目录不存在或无法读取，静默失败
      console.warn(`Failed to load locales from directory: ${dirPath}`, error)
    }
  }
}

/**
 * 中文翻译
 */
export const zhCN: I18nMessages = {
  // 基准测试相关
  'benchmark.running': '正在运行基准测试...',
  'benchmark.complete': '基准测试完成',
  'benchmark.failed': '基准测试失败',
  'benchmark.starting': '开始基准测试: {name}',
  'benchmark.warmup': '预热中...',
  'benchmark.executing': '执行中...',
  'benchmark.analyzing': '分析结果中...',

  // 报告相关
  'report.generated': '报告已生成',
  'report.saved': '报告已保存到: {path}',
  'report.generating': '正在生成报告...',
  'report.format.html': 'HTML 报告',
  'report.format.json': 'JSON 报告',
  'report.format.pdf': 'PDF 报告',
  'report.format.excel': 'Excel 报告',

  // 阈值相关
  'threshold.passed': '阈值检查通过',
  'threshold.failed': '阈值检查失败',
  'threshold.checking': '检查阈值...',

  // 性能回归相关
  'regression.detected': '检测到性能回归',
  'regression.checking': '检查性能回归...',
  'regression.none': '未检测到性能回归',
  'improvement.detected': '检测到性能提升',

  // 配置相关
  'config.loading': '加载配置...',
  'config.loaded': '配置已加载',
  'config.invalid': '配置无效',
  'config.validating': '验证配置...',
  'config.valid': '配置有效',

  // 存储相关
  'storage.saving': '保存结果...',
  'storage.saved': '结果已保存',
  'storage.loading': '加载历史记录...',
  'storage.loaded': '历史记录已加载',
  'storage.cleanup': '清理旧记录...',
  'storage.cleaned': '已清理 {count} 条记录',

  // 插件相关
  'plugin.loading': '加载插件: {name}',
  'plugin.loaded': '插件已加载: {name}',
  'plugin.failed': '插件加载失败: {name}',
  'plugin.executing': '执行插件: {name}',

  // 错误相关
  'error.occurred': '发生错误',
  'error.timeout': '执行超时',
  'error.execution': '执行错误',
  'error.configuration': '配置错误',
  'error.storage': '存储错误',
  'error.plugin': '插件错误',

  // 进度相关
  'progress.suite': '套件: {current}/{total}',
  'progress.task': '任务: {current}/{total}',
  'progress.iteration': '迭代: {current}/{total}',
  'progress.complete': '完成: {percentage}%',

  // 统计相关
  'stats.ops': '操作/秒',
  'stats.time': '平均时间',
  'stats.min': '最小值',
  'stats.max': '最大值',
  'stats.stddev': '标准差',
  'stats.rme': '相对误差',
  'stats.iterations': '迭代次数',
  'stats.samples': '样本数',

  // CI/CD 相关
  'ci.mode': 'CI 模式已启用',
  'ci.annotations': '生成 CI 注释',
  'ci.summary': 'CI 摘要',

  // 命令相关
  'cmd.run': '运行基准测试',
  'cmd.serve': '启动可视化服务器',
  'cmd.history': '查看历史记录',
  'cmd.query': '查询历史数据',
  'cmd.validate': '验证配置',

  // 通用
  'common.success': '成功',
  'common.failed': '失败',
  'common.warning': '警告',
  'common.info': '信息',
  'common.error': '错误',
  'common.loading': '加载中...',
  'common.saving': '保存中...',
  'common.processing': '处理中...',
  'common.done': '完成',
  'common.cancel': '取消',
  'common.retry': '重试',
  'common.skip': '跳过',
  'common.continue': '继续',
}

/**
 * 英文翻译
 */
export const enUS: I18nMessages = {
  // Benchmark related
  'benchmark.running': 'Running benchmarks...',
  'benchmark.complete': 'Benchmark complete',
  'benchmark.failed': 'Benchmark failed',
  'benchmark.starting': 'Starting benchmark: {name}',
  'benchmark.warmup': 'Warming up...',
  'benchmark.executing': 'Executing...',
  'benchmark.analyzing': 'Analyzing results...',

  // Report related
  'report.generated': 'Report generated',
  'report.saved': 'Report saved to: {path}',
  'report.generating': 'Generating report...',
  'report.format.html': 'HTML Report',
  'report.format.json': 'JSON Report',
  'report.format.pdf': 'PDF Report',
  'report.format.excel': 'Excel Report',

  // Threshold related
  'threshold.passed': 'Threshold check passed',
  'threshold.failed': 'Threshold check failed',
  'threshold.checking': 'Checking thresholds...',

  // Performance regression related
  'regression.detected': 'Performance regression detected',
  'regression.checking': 'Checking for regressions...',
  'regression.none': 'No performance regression detected',
  'improvement.detected': 'Performance improvement detected',

  // Configuration related
  'config.loading': 'Loading configuration...',
  'config.loaded': 'Configuration loaded',
  'config.invalid': 'Invalid configuration',
  'config.validating': 'Validating configuration...',
  'config.valid': 'Configuration is valid',

  // Storage related
  'storage.saving': 'Saving results...',
  'storage.saved': 'Results saved',
  'storage.loading': 'Loading history...',
  'storage.loaded': 'History loaded',
  'storage.cleanup': 'Cleaning up old records...',
  'storage.cleaned': 'Cleaned {count} records',

  // Plugin related
  'plugin.loading': 'Loading plugin: {name}',
  'plugin.loaded': 'Plugin loaded: {name}',
  'plugin.failed': 'Plugin failed to load: {name}',
  'plugin.executing': 'Executing plugin: {name}',

  // Error related
  'error.occurred': 'An error occurred',
  'error.timeout': 'Execution timeout',
  'error.execution': 'Execution error',
  'error.configuration': 'Configuration error',
  'error.storage': 'Storage error',
  'error.plugin': 'Plugin error',

  // Progress related
  'progress.suite': 'Suite: {current}/{total}',
  'progress.task': 'Task: {current}/{total}',
  'progress.iteration': 'Iteration: {current}/{total}',
  'progress.complete': 'Complete: {percentage}%',

  // Statistics related
  'stats.ops': 'ops/sec',
  'stats.time': 'Average time',
  'stats.min': 'Minimum',
  'stats.max': 'Maximum',
  'stats.stddev': 'Standard deviation',
  'stats.rme': 'Relative margin of error',
  'stats.iterations': 'Iterations',
  'stats.samples': 'Samples',

  // CI/CD related
  'ci.mode': 'CI mode enabled',
  'ci.annotations': 'Generating CI annotations',
  'ci.summary': 'CI Summary',

  // Command related
  'cmd.run': 'Run benchmarks',
  'cmd.serve': 'Start visualization server',
  'cmd.history': 'View history',
  'cmd.query': 'Query historical data',
  'cmd.validate': 'Validate configuration',

  // Common
  'common.success': 'Success',
  'common.failed': 'Failed',
  'common.warning': 'Warning',
  'common.info': 'Info',
  'common.error': 'Error',
  'common.loading': 'Loading...',
  'common.saving': 'Saving...',
  'common.processing': 'Processing...',
  'common.done': 'Done',
  'common.cancel': 'Cancel',
  'common.retry': 'Retry',
  'common.skip': 'Skip',
  'common.continue': 'Continue',
}

/**
 * 创建全局 i18n 实例
 */
let globalI18n: I18nManager | null = null

/**
 * 获取全局 i18n 实例
 */
export function getI18n(): I18nManager {
  if (!globalI18n) {
    globalI18n = new I18nManager()
  }
  return globalI18n
}

/**
 * 设置全局 i18n 实例
 */
export function setI18n(i18n: I18nManager): void {
  globalI18n = i18n
}

/**
 * 便捷的翻译函数
 */
export function t(key: string, params?: Record<string, unknown>): string {
  return getI18n().t(key, params)
}
