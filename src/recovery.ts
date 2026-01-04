/**
 * 错误恢复模块
 * 
 * 提供错误恢复机制，保存原始结果到恢复文件，支持从恢复文件继续
 */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { BenchmarkResult, BenchmarkReport } from './types'

/**
 * 恢复数据
 */
export interface RecoveryData {
  /** 时间戳 */
  timestamp: string
  /** 错误信息 */
  error: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  /** 已完成的结果 */
  results: BenchmarkResult[]
  /** 套件名称 */
  suiteName?: string
  /** 环境信息 */
  environment?: Record<string, unknown>
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 恢复文件信息
 */
export interface RecoveryFileInfo {
  /** 文件路径 */
  path: string
  /** 文件名 */
  filename: string
  /** 时间戳 */
  timestamp: string
  /** 套件名称 */
  suiteName?: string
  /** 结果数量 */
  resultCount: number
}

/**
 * 恢复管理器
 */
export class RecoveryManager {
  private recoveryDir: string

  constructor(recoveryDir: string = '.benchmark-recovery') {
    this.recoveryDir = recoveryDir
  }

  /**
   * 确保恢复目录存在
   */
  private async ensureRecoveryDir(): Promise<void> {
    try {
      await fs.access(this.recoveryDir)
    } catch {
      await fs.mkdir(this.recoveryDir, { recursive: true })
    }
  }

  /**
   * 保存恢复数据
   */
  async saveRecoveryData(
    results: BenchmarkResult[],
    error: Error,
    suiteName?: string,
    environment?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    await this.ensureRecoveryDir()

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const suitePrefix = suiteName ? `${suiteName.replace(/[^a-zA-Z0-9]/g, '_')}-` : ''
    const filename = `recovery-${suitePrefix}${timestamp}.json`
    const recoveryFile = path.join(this.recoveryDir, filename)

    const recoveryData: RecoveryData = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
      results,
      suiteName,
      environment,
      metadata,
    }

    await fs.writeFile(recoveryFile, JSON.stringify(recoveryData, null, 2), 'utf-8')

    return recoveryFile
  }

  /**
   * 加载恢复数据
   */
  async loadRecoveryData(recoveryFile: string): Promise<RecoveryData> {
    const content = await fs.readFile(recoveryFile, 'utf-8')
    return JSON.parse(content) as RecoveryData
  }

  /**
   * 列出可恢复的文件
   */
  async listRecoveryFiles(): Promise<RecoveryFileInfo[]> {
    try {
      await fs.access(this.recoveryDir)
    } catch {
      return []
    }

    const files = await fs.readdir(this.recoveryDir)
    const recoveryFiles: RecoveryFileInfo[] = []

    for (const filename of files) {
      if (!filename.startsWith('recovery-') || !filename.endsWith('.json')) {
        continue
      }

      const filepath = path.join(this.recoveryDir, filename)

      try {
        const data = await this.loadRecoveryData(filepath)
        recoveryFiles.push({
          path: filepath,
          filename,
          timestamp: data.timestamp,
          suiteName: data.suiteName,
          resultCount: data.results.length,
        })
      } catch {
        // 忽略无法读取的文件
      }
    }

    // 按时间戳降序排序
    recoveryFiles.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    return recoveryFiles
  }

  /**
   * 删除恢复文件
   */
  async deleteRecoveryFile(recoveryFile: string): Promise<void> {
    await fs.unlink(recoveryFile)
  }

  /**
   * 清理所有恢复文件
   */
  async clearAllRecoveryFiles(): Promise<number> {
    const files = await this.listRecoveryFiles()

    for (const file of files) {
      await this.deleteRecoveryFile(file.path)
    }

    return files.length
  }

  /**
   * 清理旧的恢复文件
   */
  async cleanupOldRecoveryFiles(maxAge: number): Promise<number> {
    const files = await this.listRecoveryFiles()
    const now = Date.now()
    let deleted = 0

    for (const file of files) {
      const fileTime = new Date(file.timestamp).getTime()
      const age = now - fileTime

      if (age > maxAge) {
        await this.deleteRecoveryFile(file.path)
        deleted++
      }
    }

    return deleted
  }

  /**
   * 从恢复数据创建报告
   */
  async createReportFromRecovery(recoveryFile: string): Promise<BenchmarkReport> {
    const data = await this.loadRecoveryData(recoveryFile)

    return {
      name: data.suiteName || 'Recovered Benchmark',
      suites: [
        {
          name: data.suiteName || 'Recovered Suite',
          results: data.results,
          duration: data.results.reduce((sum, r) => sum + r.totalTime, 0),
          timestamp: new Date(data.timestamp).getTime(),
        },
      ],
      generatedAt: data.timestamp,
      environment: data.environment as any || {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
      },
    }
  }

  /**
   * 打印恢复文件列表
   */
  async printRecoveryFiles(): Promise<void> {
    const files = await this.listRecoveryFiles()

    if (files.length === 0) {
      console.log('\n📁 没有找到恢复文件\n')
      return
    }

    console.log('\n' + '='.repeat(80))
    console.log('📁 可恢复的文件')
    console.log('='.repeat(80))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      console.log(`\n${i + 1}. ${file.filename}`)
      console.log(`   时间: ${file.timestamp}`)
      if (file.suiteName) {
        console.log(`   套件: ${file.suiteName}`)
      }
      console.log(`   结果数: ${file.resultCount}`)
      console.log(`   路径: ${file.path}`)
    }

    console.log('\n' + '='.repeat(80) + '\n')
  }

  /**
   * 打印恢复数据详情
   */
  async printRecoveryData(recoveryFile: string): Promise<void> {
    const data = await this.loadRecoveryData(recoveryFile)

    console.log('\n' + '='.repeat(80))
    console.log('📋 恢复数据详情')
    console.log('='.repeat(80))

    console.log(`\n时间: ${data.timestamp}`)
    if (data.suiteName) {
      console.log(`套件: ${data.suiteName}`)
    }

    console.log('\n❌ 错误信息:')
    console.log(`  名称: ${data.error.name}`)
    console.log(`  消息: ${data.error.message}`)
    if (data.error.code) {
      console.log(`  代码: ${data.error.code}`)
    }

    console.log(`\n📊 已完成的结果: ${data.results.length}`)
    for (const result of data.results) {
      console.log(`  ✓ ${result.name}`)
      console.log(`    Ops/sec: ${result.opsPerSecond.toFixed(2)}`)
      console.log(`    Avg time: ${result.avgTime.toFixed(4)}ms`)
      console.log(`    Iterations: ${result.iterations}`)
    }

    if (data.metadata && Object.keys(data.metadata).length > 0) {
      console.log('\n📝 元数据:')
      for (const [key, value] of Object.entries(data.metadata)) {
        console.log(`  ${key}: ${JSON.stringify(value)}`)
      }
    }

    console.log('\n' + '='.repeat(80) + '\n')
  }
}

/**
 * 创建恢复管理器
 */
export function createRecoveryManager(recoveryDir?: string): RecoveryManager {
  return new RecoveryManager(recoveryDir)
}
