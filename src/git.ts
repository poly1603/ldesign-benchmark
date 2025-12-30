/**
 * Git 信息工具模块
 * 
 * 提供获取当前 Git 仓库信息的功能
 * 
 * @module git
 */

/**
 * Git 信息接口
 */
export interface GitInfo {
  /** 当前 commit hash (短格式) */
  commit?: string
  /** 当前分支名称 */
  branch?: string
  /** 工作目录是否有未提交的更改 */
  dirty?: boolean
}

/**
 * 获取当前 Git 仓库信息
 * 
 * @returns Git 信息对象，如果不在 Git 仓库中则返回空对象
 * 
 * @example
 * ```ts
 * import { getGitInfo } from './git'
 * 
 * const gitInfo = await getGitInfo()
 * console.log(gitInfo)
 * // { commit: 'abc1234', branch: 'main', dirty: false }
 * ```
 */
export async function getGitInfo(): Promise<GitInfo> {
  try {
    const { execSync } = await import('node:child_process')

    // 获取短格式的 commit hash
    const commit = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    // 获取当前分支名称
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()

    // 检查工作目录是否有未提交的更改
    let dirty = false
    try {
      const status = execSync('git status --porcelain', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim()
      dirty = status.length > 0
    } catch {
      // 如果无法获取状态，假设不是 dirty
    }

    return { commit, branch, dirty }
  } catch {
    // 不在 Git 仓库中或 Git 不可用
    return {}
  }
}

/**
 * 获取完整的 commit hash
 * 
 * @returns 完整的 commit hash，如果不在 Git 仓库中则返回 undefined
 */
export async function getFullCommitHash(): Promise<string | undefined> {
  try {
    const { execSync } = await import('node:child_process')
    return execSync('git rev-parse HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
  } catch {
    return undefined
  }
}

/**
 * 检查是否在 Git 仓库中
 * 
 * @returns 是否在 Git 仓库中
 */
export async function isGitRepository(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process')
    execSync('git rev-parse --git-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return true
  } catch {
    return false
  }
}
