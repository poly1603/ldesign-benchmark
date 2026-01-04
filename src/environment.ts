/**
 * 环境元数据收集器
 * 
 * 收集系统环境信息，包括 OS、Node、CPU、内存等
 */

import os from 'node:os'

/**
 * 环境元数据接口
 */
export interface EnvironmentMetadata {
  /** 操作系统平台 */
  platform: string
  /** 系统架构 */
  arch: string
  /** Node.js 版本 */
  nodeVersion: string
  /** CPU 型号 */
  cpuModel?: string
  /** CPU 核心数 */
  cpuCores?: number
  /** 总内存(字节) */
  totalMemory?: number
  /** 空闲内存(字节) */
  freeMemory?: number
  /** 操作系统版本 */
  osVersion?: string
  /** 主机名 */
  hostname?: string
}

/**
 * 环境元数据收集器类
 */
export class EnvironmentCollector {
  /**
   * 收集完整的环境元数据
   */
  collect(): EnvironmentMetadata {
    const cpus = os.cpus()

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuModel: cpus.length > 0 ? cpus[0].model : undefined,
      cpuCores: cpus.length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      osVersion: os.release(),
      hostname: os.hostname(),
    }
  }

  /**
   * 收集基本环境信息（向后兼容）
   */
  collectBasic(): { platform: string; arch: string; nodeVersion: string } {
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    }
  }

  /**
   * 格式化内存大小
   */
  formatMemory(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(2)} GB`
  }

  /**
   * 获取环境摘要字符串
   */
  getSummary(): string {
    const env = this.collect()
    const parts: string[] = []

    parts.push(`${env.platform} ${env.arch}`)
    parts.push(`Node ${env.nodeVersion}`)

    if (env.cpuModel) {
      parts.push(`CPU: ${env.cpuModel}`)
    }

    if (env.cpuCores) {
      parts.push(`${env.cpuCores} cores`)
    }

    if (env.totalMemory) {
      parts.push(`RAM: ${this.formatMemory(env.totalMemory)}`)
    }

    return parts.join(' | ')
  }
}

/**
 * 默认环境收集器实例
 */
export const environmentCollector = new EnvironmentCollector()
