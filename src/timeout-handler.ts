/**
 * 超时处理模块
 * 
 * 提供超时检测和部分结果返回功能
 */

import type { BenchmarkResult } from './types'
import { TimeoutError } from './errors'

/**
 * 部分结果
 */
export interface PartialResult {
  /** 已完成的迭代数 */
  completedIterations: number
  /** 已收集的样本 */
  samples: number[]
  /** 总运行时间 */
  totalTime: number
  /** 是否超时 */
  timedOut: boolean
}

/**
 * 超时处理器
 */
export class TimeoutHandler {
  private startTime: number = 0
  private samples: number[] = []
  private iterations: number = 0
  private totalTime: number = 0

  constructor(
    private readonly timeout: number,
    private readonly taskName: string,
  ) { }

  /**
   * 开始计时
   */
  start(): void {
    this.startTime = Date.now()
    this.samples = []
    this.iterations = 0
    this.totalTime = 0
  }

  /**
   * 记录一次迭代
   */
  recordIteration(duration: number): void {
    this.samples.push(duration)
    this.iterations++
    this.totalTime += duration
  }

  /**
   * 检查是否超时
   */
  isTimedOut(): boolean {
    if (this.timeout <= 0) return false
    return Date.now() - this.startTime >= this.timeout
  }

  /**
   * 获取已运行时间
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * 获取部分结果
   */
  getPartialResult(): PartialResult {
    return {
      completedIterations: this.iterations,
      samples: [...this.samples],
      totalTime: this.totalTime,
      timedOut: this.isTimedOut(),
    }
  }

  /**
   * 构建部分基准测试结果
   */
  buildPartialBenchmarkResult(taskName: string, tags?: string[]): BenchmarkResult {
    const samples = this.samples
    const n = samples.length

    if (n === 0) {
      return {
        name: taskName,
        opsPerSecond: 0,
        avgTime: 0,
        minTime: 0,
        maxTime: 0,
        stdDev: 0,
        rme: 0,
        iterations: 0,
        totalTime: 0,
        status: 'timeout',
        error: `Timeout after ${this.getElapsedTime()}ms with no completed iterations`,
        tags,
        timestamp: Date.now(),
      }
    }

    // 计算统计数据
    const sum = samples.reduce((a, b) => a + b, 0)
    const avgTime = sum / n
    const minTime = Math.min(...samples)
    const maxTime = Math.max(...samples)

    // 计算标准差
    const variance = samples.reduce((acc, val) => acc + Math.pow(val - avgTime, 2), 0) / n
    const stdDev = Math.sqrt(variance)

    // 计算相对误差
    const rme = (stdDev / avgTime) * 100

    // 计算 ops/sec
    const opsPerSecond = n > 0 ? 1000 / avgTime : 0

    return {
      name: taskName,
      opsPerSecond,
      avgTime,
      minTime,
      maxTime,
      stdDev,
      rme,
      iterations: n,
      totalTime: this.totalTime,
      samples,
      status: 'timeout',
      error: `Timeout after ${this.getElapsedTime()}ms (completed ${n} iterations)`,
      tags,
      timestamp: Date.now(),
    }
  }

  /**
   * 抛出超时错误
   */
  throwTimeoutError(suiteName?: string): never {
    const partialResult = this.getPartialResult()
    throw new TimeoutError(
      `Task "${this.taskName}" timed out after ${this.timeout}ms`,
      this.taskName,
      this.timeout,
      partialResult,
      {
        suiteName,
        metadata: {
          elapsedTime: this.getElapsedTime(),
          completedIterations: partialResult.completedIterations,
        },
      },
    )
  }
}

/**
 * 使用超时包装异步函数
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  taskName: string,
  suiteName?: string,
): Promise<T> {
  if (timeout <= 0) {
    return fn()
  }

  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(
          new TimeoutError(
            `Task "${taskName}" timed out after ${timeout}ms`,
            taskName,
            timeout,
            undefined,
            { suiteName },
          ),
        )
      }, timeout)
    }),
  ])
}

/**
 * 创建超时处理器
 */
export function createTimeoutHandler(timeout: number, taskName: string): TimeoutHandler {
  return new TimeoutHandler(timeout, taskName)
}
