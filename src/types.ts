/**
 * Benchmark 类型定义
 *
 * 此模块重新导出 types/ 目录下的类型定义，保持向后兼容性。
 * 新代码建议直接从 './types' 导入。
 *
 * @module types
 */

// 从新的类型模块重新导出
export {
  type BenchmarkTask,
  type ProgressCallback,
  type BenchmarkPhase,
  type BenchmarkStatus,
  type ConcurrencyMode,
  type ProgressInfo,
  type HookContext,
  type HookFunction,
  type BenchmarkOptions,
  type PercentileStats,
  type MemoryStats,
  type ExtendedStats,
  type BenchmarkResult,
  type BenchmarkSuite,
  type EnvironmentInfo,
  type BenchmarkReport,
  type Benchmark,
  type BenchmarkThreshold,
  type BenchmarkThresholds,
  type ComparisonResult,
  type ComparisonSummary,
  type TrendDataPoint,
  type TrendDirection,
  type TrendAnalysis,
} from './types/benchmark'

// ============================================================================
// 报告器类型
// ============================================================================

/**
 * 报告格式
 */
export type ReportFormat = 'console' | 'json' | 'markdown' | 'html' | 'csv' | 'pdf' | 'excel'

/**
 * Reporter 选项
 */
export interface ReporterOptions {
  /**
   * 输出格式
   * @default 'console'
   */
  format?: ReportFormat

  /**
   * 输出文件路径
   */
  output?: string

  /**
   * 是否显示详细信息
   * @default false
   */
  verbose?: boolean

  /**
   * 是否使用颜色输出
   * @default true (auto-detect)
   */
  colors?: boolean

  /**
   * 自定义模板路径（用于 HTML 格式）
   */
  template?: string

  /**
   * 模板变量（传递给模板）
   */
  templateVars?: Record<string, unknown>
}

/**
 * Runner 选项
 */
export interface RunnerOptions {
  /** 过滤器 - 只运行匹配的套件 */
  filter?: string | RegExp
  /** 标签过滤 */
  tags?: string[]
  /** 并行执行 */
  parallel?: boolean
  /** 最大并行数 */
  maxConcurrency?: number
  /** 失败后继续 */
  continueOnError?: boolean
  /** 进度回调 */
  onProgress?: import('./types/benchmark').ProgressCallback
  /** 套件开始回调 */
  onSuiteStart?: (suite: string) => void
  /** 套件完成回调 */
  onSuiteComplete?: (suite: string, results: import('./types/benchmark').BenchmarkResult[]) => void
  /** 是否保留样本数据 */
  retainSamples?: boolean
  /** 超时时间(毫秒) */
  timeout?: number
}

/**
 * 配置文件结构
 */
export interface BenchmarkConfig {
  /** 默认选项 */
  defaults?: Partial<import('./types/benchmark').BenchmarkOptions>
  /** 测试文件 pattern */
  pattern?: string | string[]
  /** 忽略文件 */
  ignore?: string[]
  /** 输出目录 */
  outputDir?: string
  /** 历史记录目录 */
  historyDir?: string
  /** 阈值配置 */
  thresholds?: import('./types/benchmark').BenchmarkThresholds
  /** 报告格式 */
  reporters?: ('console' | 'json' | 'markdown' | 'html' | 'csv')[]
  /** 插件列表 */
  plugins?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** Git 集成 */
  git?: {
    enabled: boolean
    trackCommit?: boolean
    trackBranch?: boolean
  }
}


/**
 * CI 环境配置
 */
export interface CIConfig {
  /** 是否启用 CI 模式 */
  enabled: boolean
  /** CI 提供商 */
  provider?: 'github' | 'gitlab' | 'jenkins' | 'azure'
  /** 是否在回归时失败 */
  failOnRegression: boolean
  /** 回归阈值百分比 */
  regressionThreshold: number
  /** 是否生成注释 */
  annotations: boolean
}

/**
 * 增强的配置结构（包含 CI 配置）
 */
export interface EnhancedBenchmarkConfig extends BenchmarkConfig {
  /** CI/CD 配置 */
  ci?: CIConfig
  /** 并行执行配置 */
  parallel?: {
    enabled: boolean
    maxWorkers: number
    isolate: boolean
  }
  /** 存储配置 */
  storage?: {
    type: 'json' | 'sqlite'
    path: string
    retention: {
      maxAge: number
      maxCount: number
    }
  }
  /** 国际化配置 */
  locale?: {
    language: 'zh-CN' | 'en-US'
    dateFormat: string
    numberFormat: string
  }
}

