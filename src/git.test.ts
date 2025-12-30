/**
 * Git 信息工具测试
 */

import { describe, it, expect } from 'vitest'
import { getGitInfo, getFullCommitHash, isGitRepository } from './git'

describe('Git 信息工具', () => {
  describe('getGitInfo', () => {
    it('应该返回 Git 信息对象', async () => {
      const gitInfo = await getGitInfo()

      // 在 Git 仓库中应该返回有效信息
      // 注意：这个测试假设在 Git 仓库中运行
      if (gitInfo.commit) {
        expect(typeof gitInfo.commit).toBe('string')
        expect(gitInfo.commit.length).toBeGreaterThan(0)
        expect(gitInfo.commit.length).toBeLessThanOrEqual(40) // 短格式通常是 7-8 字符
      }

      if (gitInfo.branch) {
        expect(typeof gitInfo.branch).toBe('string')
        expect(gitInfo.branch.length).toBeGreaterThan(0)
      }

      if (gitInfo.dirty !== undefined) {
        expect(typeof gitInfo.dirty).toBe('boolean')
      }
    })

    it('应该返回短格式的 commit hash', async () => {
      const gitInfo = await getGitInfo()

      if (gitInfo.commit) {
        // 短格式通常是 7-8 字符
        expect(gitInfo.commit.length).toBeLessThanOrEqual(12)
        // 应该是十六进制字符
        expect(gitInfo.commit).toMatch(/^[a-f0-9]+$/)
      }
    })
  })

  describe('getFullCommitHash', () => {
    it('应该返回完整的 commit hash', async () => {
      const fullHash = await getFullCommitHash()

      if (fullHash) {
        // 完整的 commit hash 是 40 个字符
        expect(fullHash.length).toBe(40)
        // 应该是十六进制字符
        expect(fullHash).toMatch(/^[a-f0-9]{40}$/)
      }
    })
  })

  describe('isGitRepository', () => {
    it('应该返回布尔值', async () => {
      const isRepo = await isGitRepository()
      expect(typeof isRepo).toBe('boolean')
    })

    it('在当前目录应该返回 true', async () => {
      // 假设测试在 Git 仓库中运行
      const isRepo = await isGitRepository()
      expect(isRepo).toBe(true)
    })
  })

  describe('Git 信息集成', () => {
    it('getGitInfo 和 getFullCommitHash 的 commit 应该匹配', async () => {
      const gitInfo = await getGitInfo()
      const fullHash = await getFullCommitHash()

      if (gitInfo.commit && fullHash) {
        // 短格式应该是完整格式的前缀
        expect(fullHash.startsWith(gitInfo.commit)).toBe(true)
      }
    })
  })
})
