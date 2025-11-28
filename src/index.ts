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

export { createBenchmark } from './benchmark'
export { BenchmarkReporter } from './reporter'
export { createRunner, checkThresholds } from './runner'
export { createDefaultPluginManager, PluginManager } from './plugins'
export { createPerformanceAnalyzer, PerformanceAnalyzer } from './analyzer'

export type {
  Benchmark,
  BenchmarkOptions,
  BenchmarkTask,
  BenchmarkResult,
  BenchmarkSuite,
  BenchmarkReport,
  ReporterOptions,
  BenchmarkThreshold,
  BenchmarkThresholds,
} from './types'
