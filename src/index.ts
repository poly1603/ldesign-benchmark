/**
 * LDesign 统一 Benchmark 框架
 * 
 * 提供统一的性能测试 API,确保所有包使用一致的性能测试方法
 * 
 * @module @ldesign/benchmark
 * @example
 * ```ts
 * import { createBenchmark } from '@ldesign/benchmark'
 * 
 * const bench = createBenchmark('Color 转换性能')
 * 
 * bench.add('RGB to HSL', () => {
 *   rgbToHsl(255, 128, 0)
 * })
 * 
 * bench.add('HSL to RGB', () => {
 *   hslToRgb(30, 100, 50)
 * })
 * 
 * await bench.run()
 * bench.printResults()
 * ```
 */

// 核心功能
export { createBenchmark, BenchmarkImpl } from './benchmark'
export { BenchmarkReporter } from './reporter'
export { PDFReporter } from './reporter-pdf'
export { ExcelReporter } from './reporter-excel'
export { createRunner, checkThresholds, BenchmarkRunner } from './runner'

// 配置系统
export {
  ConfigLoader,
  createConfigLoader,
  loadConfig,
  validateConfig,
  parseConfigContent,
  serializeConfig,
  DEFAULT_CONFIG,
} from './config'

// 存储系统
export {
  JSONStorage,
  SQLiteStorage,
  createStorage,
} from './storage'

// Git 信息
export {
  getGitInfo,
  getFullCommitHash,
  isGitRepository,
} from './git'

// 环境信息
export {
  EnvironmentCollector,
  environmentCollector,
} from './environment'

// 插件系统
export {
  createDefaultPluginManager,
  createFullPluginManager,
  PluginManager,
  StatisticsPlugin,
  TrendAnalysisPlugin,
  MemoryAnalysisPlugin,
  RegressionDetectorPlugin,
} from './plugins'

// 性能分析
export { createPerformanceAnalyzer, PerformanceAnalyzer } from './analyzer'
export {
  createEnhancedAnalyzer,
  EnhancedAnalyzer,
} from './analyzer-enhanced'

// 可视化服务器
export { BenchmarkServer } from './server'

// CI/CD 集成
export { CIReporter } from './ci-reporter'
export { RegressionDetector, createRegressionDetector } from './regression-detector'
export {
  CIEnvironmentDetector,
  createCIEnvironmentDetector,
  getCIEnvironment,
  isCI,
  loadConfigFromEnv,
} from './ci-env'

// 错误处理和调试
export {
  BenchmarkError,
  ConfigurationError,
  ExecutionError,
  TimeoutError,
  StorageError,
  ValidationError as BenchmarkValidationError,
  NetworkError,
  PluginError,
  formatError,
  captureError,
  createConfigError,
  createTimeoutError,
  isBenchmarkError,
  isErrorOfType,
  isRetryableError,
  isFatalError,
  tryCatch,
  tryCatchSync,
  withErrorBoundary,
} from './errors'

// 工具函数
export {
  formatBytes,
  formatOps,
  formatTime,
  formatPercentage,
  formatDuration,
  calculatePercentile,
  calculateAllPercentiles,
  calculateStats,
  calculateRME,
  chunk,
  delay,
  retry,
  deepMerge,
  deepFreeze,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidPercentage,
  isNonEmptyString,
  assert,
  assertDefined,
  nowISO,
  fileTimestamp,
  isPromise,
  toArray,
  getTypeName,
} from './utils'

// 类型守卫和验证函数
export {
  isBenchmarkStatus,
  isBenchmarkPhase,
  isPercentileStats,
  isMemoryStats,
  isBenchmarkResult,
  isBenchmarkSuite,
  isProgressInfo,
  isCompletedStatus,
  isFailureStatus,
  validateBenchmarkOptions,
  validateThreshold,
  validateBenchmarkReport,
  safeParseJSON,
  safeParseInt,
  safeParseFloat,
  safeParseBoolean,
  clamp,
  isInRange,
  isSafePath,
  sanitizeFilename,
} from './validators'

export {
  TimeoutHandler,
  withTimeout,
  createTimeoutHandler,
} from './timeout-handler'

export {
  DryRunExecutor,
  createDryRunExecutor,
} from './dry-run'

export {
  RecoveryManager,
  createRecoveryManager,
} from './recovery'

export {
  DebugLogger,
  getDebugLogger,
  enableDebug,
  disableDebug,
  LogLevel,
} from './debug-logger'

// 国际化
export {
  I18nManager,
  getI18n,
  setI18n,
  t,
  zhCN,
  enUS,
} from './i18n'

// 类型导出
export type {
  // 核心类型
  Benchmark,
  BenchmarkOptions,
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkSuite,
  BenchmarkReport,

  // 统计类型
  PercentileStats,
  MemoryStats,

  // 报告类型
  ReporterOptions,

  // 阈值类型
  BenchmarkThreshold,
  BenchmarkThresholds,

  // 比较类型
  ComparisonResult,
  ComparisonSummary,

  // Runner 类型
  RunnerOptions,
  ProgressInfo,
  ProgressCallback,

  // 配置类型
  BenchmarkConfig,

  // 趋势类型
  TrendDataPoint,
  TrendAnalysis,
} from './types'

// 配置类型
export type {
  EnhancedBenchmarkConfig,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConfigSource,
  ConfigWithSource,
} from './config'

// PDF 报告类型
export type {
  PDFReportOptions,
} from './reporter-pdf'

// Excel 报告类型
export type {
  ExcelReportOptions,
} from './reporter-excel'

// 存储类型
export type {
  BenchmarkStorage,
  QueryOptions,
  CleanupOptions,
  EnhancedBenchmarkReport,
} from './storage'

// Git 类型
export type {
  GitInfo,
} from './git'

// 环境类型
export type {
  EnvironmentMetadata,
} from './environment'

// 插件类型
export type {
  BenchmarkPlugin,
  PluginContext,
} from './plugins'

// 增强分析器类型
export type {
  OutlierResult,
  ConfidenceInterval,
  StatisticalAnalysis,
  FlameGraphNode,
  ProfileData,
  GCEvent,
  GCAnalysis,
  OptimizationSuggestion,
} from './analyzer-enhanced'

// 并行执行
export {
  ParallelBenchmarkRunner,
  createParallelRunner,
  Semaphore,
  ProgressAggregator,
  topologicalSort,
  getExecutableSuites,
} from './parallel'

// 并行执行类型
export type {
  ParallelConfig,
  SuiteConfig,
  ParallelRunnerOptions,
  SuiteExecutionResult,
  ParallelExecutionState,
} from './parallel'

// CI/CD 类型
export type {
  GitHubAnnotation,
  GitHubAnnotationLevel,
  CIProvider,
  CIReporterOptions,
} from './ci-reporter'

export type {
  RegressionDetectorOptions,
} from './regression-detector'

export type {
  CIEnvironment,
} from './ci-env'

// 错误处理和调试类型
export type {
  ErrorContext,
  ErrorBoundaryResult,
} from './errors'

// 验证器类型
export type {
  ValidationError as ValidatorError,
  ValidationResult as ValidatorResult,
} from './validators'

export type {
  PartialResult,
} from './timeout-handler'

export type {
  DryRunTask,
  DryRunResult,
} from './dry-run'

export type {
  RecoveryData,
  RecoveryFileInfo,
} from './recovery'

export type {
  LogEntry,
} from './debug-logger'

// 国际化类型
export type {
  Locale,
  I18nMessages,
} from './i18n'
