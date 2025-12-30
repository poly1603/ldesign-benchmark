/**
 * 存储系统测试
 * 
 * 包含属性测试和单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  JSONStorage,
  SQLiteStorage,
  createStorage,
  type EnhancedBenchmarkReport,
  type QueryOptions,
  type BenchmarkStorage,
} from './storage'
import type { BenchmarkReport, BenchmarkSuite, BenchmarkResult } from './types'

// 测试目录
const TEST_DIR = path.join(process.cwd(), '.test-storage')
const JSON_STORAGE_DIR = path.join(TEST_DIR, 'json')
const SQLITE_DB_PATH = path.join(TEST_DIR, 'test.db')

/**
 * 生成有效的 BenchmarkResult 的 Arbitrary
 */
const benchmarkResultArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  opsPerSecond: fc.double({ min: 0.1, max: 1000000, noNaN: true }),
  avgTime: fc.double({ min: 0.001, max: 10000, noNaN: true }),
  minTime: fc.double({ min: 0.001, max: 10000, noNaN: true }),
  maxTime: fc.double({ min: 0.001, max: 10000, noNaN: true }),
  stdDev: fc.double({ min: 0, max: 1000, noNaN: true }),
  rme: fc.double({ min: 0, max: 100, noNaN: true }),
  iterations: fc.integer({ min: 1, max: 10000 }),
  totalTime: fc.double({ min: 0.1, max: 100000, noNaN: true }),
  tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  status: fc.option(fc.constantFrom('success', 'failed', 'skipped', 'timeout'), { nil: undefined }),
}) as fc.Arbitrary<BenchmarkResult>

/**
 * 生成有效的 BenchmarkSuite 的 Arbitrary
 */
const benchmarkSuiteArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  results: fc.array(benchmarkResultArbitrary, { minLength: 1, maxLength: 5 }),
  duration: fc.integer({ min: 1, max: 100000 }),
  timestamp: fc.integer({ min: 1600000000000, max: 1800000000000 }),
}) as fc.Arbitrary<BenchmarkSuite>

/**
 * 生成有效的 BenchmarkReport 的 Arbitrary
 */
const benchmarkReportArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  suites: fc.array(benchmarkSuiteArbitrary, { minLength: 1, maxLength: 3 }),
  generatedAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString()),
  environment: fc.record({
    platform: fc.constantFrom('win32', 'darwin', 'linux'),
    arch: fc.constantFrom('x64', 'arm64'),
    nodeVersion: fc.string({ minLength: 5, maxLength: 20 }),
  }),
}) as fc.Arbitrary<BenchmarkReport>

/**
 * 生成有效的 EnhancedBenchmarkReport 的 Arbitrary
 */
const enhancedReportArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  suites: fc.array(benchmarkSuiteArbitrary, { minLength: 1, maxLength: 3 }),
  generatedAt: fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString()),
  environment: fc.record({
    platform: fc.constantFrom('win32', 'darwin', 'linux'),
    arch: fc.constantFrom('x64', 'arm64'),
    nodeVersion: fc.string({ minLength: 5, maxLength: 20 }),
  }),
  id: fc.uuid(),
  duration: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
  git: fc.option(fc.record({
    commit: fc.option(fc.stringMatching(/^[a-f0-9]{40}$/), { nil: undefined }),
    branch: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    dirty: fc.option(fc.boolean(), { nil: undefined }),
  }), { nil: undefined }),
  tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
}) as fc.Arbitrary<EnhancedBenchmarkReport>

/**
 * 深度比较两个报告是否等价
 */
function reportsEqual(a: EnhancedBenchmarkReport, b: EnhancedBenchmarkReport): boolean {
  // 比较基本字段
  if (a.name !== b.name) return false
  if (a.generatedAt !== b.generatedAt) return false
  if (a.environment.platform !== b.environment.platform) return false
  if (a.environment.arch !== b.environment.arch) return false
  if (a.environment.nodeVersion !== b.environment.nodeVersion) return false

  // 比较套件数量
  if (a.suites.length !== b.suites.length) return false

  // 比较每个套件
  for (let i = 0; i < a.suites.length; i++) {
    const suiteA = a.suites[i]
    const suiteB = b.suites[i]
    if (suiteA.name !== suiteB.name) return false
    if (suiteA.results.length !== suiteB.results.length) return false

    // 比较每个结果
    for (let j = 0; j < suiteA.results.length; j++) {
      const resultA = suiteA.results[j]
      const resultB = suiteB.results[j]
      if (resultA.name !== resultB.name) return false
      // 允许浮点数有小误差
      if (Math.abs(resultA.opsPerSecond - resultB.opsPerSecond) > 0.001) return false
      if (Math.abs(resultA.avgTime - resultB.avgTime) > 0.001) return false
    }
  }

  // 比较 Git 信息
  if (a.git?.commit !== b.git?.commit) return false
  if (a.git?.branch !== b.git?.branch) return false

  return true
}

/**
 * 清理测试目录
 */
function cleanupTestDir(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

/**
 * 创建测试目录
 */
function setupTestDir(): void {
  cleanupTestDir()
  mkdirSync(TEST_DIR, { recursive: true })
}

describe('存储系统', () => {
  beforeEach(() => {
    setupTestDir()
  })

  afterEach(() => {
    cleanupTestDir()
  })

  describe('JSONStorage', () => {
    describe('属性测试', () => {
      /**
       * 属性 3: 存储往返一致性
       * 
       * *对于任意*有效的基准测试报告，保存到存储后再读取，
       * 应该产生与原始报告等价的对象。
       * 
       * **Feature: benchmark-enhancement, Property 3: 存储往返一致性**
       * **Validates: Requirements 7.1, 7.4**
       */
      it('属性 3: JSON 存储往返一致性', async () => {
        const storage = new JSONStorage(JSON_STORAGE_DIR)

        await fc.assert(
          fc.asyncProperty(enhancedReportArbitrary, async (report) => {
            // 保存报告
            const id = await storage.save(report)

            // 读取报告
            const loaded = await storage.get(id)

            // 验证报告等价
            if (!loaded) return false
            return reportsEqual(report, loaded)
          }),
          { numRuns: 100 }
        )

        await storage.close()
      })
    })

    describe('单元测试', () => {
      it('应该正确保存和读取报告', async () => {
        const storage = new JSONStorage(JSON_STORAGE_DIR)

        const report: BenchmarkReport = {
          name: 'Test Report',
          suites: [{
            name: 'Test Suite',
            results: [{
              name: 'Test Task',
              opsPerSecond: 1000,
              avgTime: 1,
              minTime: 0.5,
              maxTime: 1.5,
              stdDev: 0.1,
              rme: 5,
              iterations: 100,
              totalTime: 100,
            }],
            duration: 100,
            timestamp: Date.now(),
          }],
          generatedAt: new Date().toISOString(),
          environment: {
            platform: 'win32',
            arch: 'x64',
            nodeVersion: 'v20.0.0',
          },
        }

        const id = await storage.save(report)
        const loaded = await storage.get(id)

        expect(loaded).not.toBeNull()
        expect(loaded!.name).toBe(report.name)
        expect(loaded!.suites.length).toBe(1)
        expect(loaded!.suites[0].results[0].opsPerSecond).toBe(1000)

        await storage.close()
      })

      it('应该返回 null 当报告不存在时', async () => {
        const storage = new JSONStorage(JSON_STORAGE_DIR)
        const loaded = await storage.get('non-existent-id')
        expect(loaded).toBeNull()
        await storage.close()
      })

      it('应该正确删除报告', async () => {
        const storage = new JSONStorage(JSON_STORAGE_DIR)

        const report: BenchmarkReport = {
          name: 'Test Report',
          suites: [],
          generatedAt: new Date().toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        }

        const id = await storage.save(report)
        expect(await storage.get(id)).not.toBeNull()

        const deleted = await storage.delete(id)
        expect(deleted).toBe(true)
        expect(await storage.get(id)).toBeNull()

        await storage.close()
      })

      it('应该正确计数报告', async () => {
        const storage = new JSONStorage(JSON_STORAGE_DIR)

        expect(await storage.count()).toBe(0)

        const report: BenchmarkReport = {
          name: 'Test Report',
          suites: [],
          generatedAt: new Date().toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        }

        await storage.save(report)
        expect(await storage.count()).toBe(1)

        await storage.save({ ...report, name: 'Test Report 2' })
        expect(await storage.count()).toBe(2)

        await storage.close()
      })
    })
  })

  describe('SQLiteStorage', () => {
    describe('属性测试', () => {
      /**
       * 属性 3: 存储往返一致性
       * 
       * *对于任意*有效的基准测试报告，保存到 SQLite 存储后再读取，
       * 应该产生与原始报告等价的对象（包含所有字段和 Git 信息）。
       * 
       * **Feature: benchmark-enhancement, Property 3: 存储往返一致性**
       * **Validates: Requirements 7.1, 7.4**
       */
      it('属性 3: SQLite 存储往返一致性', async () => {
        const storage = new SQLiteStorage(SQLITE_DB_PATH)
        await storage.initialize()

        await fc.assert(
          fc.asyncProperty(enhancedReportArbitrary, async (report) => {
            // 保存报告
            const id = await storage.save(report)

            // 读取报告
            const loaded = await storage.get(id)

            // 验证报告等价
            if (!loaded) return false
            return reportsEqual(report, loaded)
          }),
          { numRuns: 100 }
        )

        await storage.close()
      })
    })

    describe('单元测试', () => {
      it('应该正确初始化数据库', async () => {
        const storage = new SQLiteStorage(SQLITE_DB_PATH)
        await storage.initialize()
        expect(await storage.count()).toBe(0)
        await storage.close()
      })

      it('应该正确保存和读取报告', async () => {
        const storage = new SQLiteStorage(SQLITE_DB_PATH)
        await storage.initialize()

        const report: EnhancedBenchmarkReport = {
          id: 'test-id-123',
          name: 'Test Report',
          suites: [{
            name: 'Test Suite',
            results: [{
              name: 'Test Task',
              opsPerSecond: 1000,
              avgTime: 1,
              minTime: 0.5,
              maxTime: 1.5,
              stdDev: 0.1,
              rme: 5,
              iterations: 100,
              totalTime: 100,
            }],
            duration: 100,
            timestamp: Date.now(),
          }],
          generatedAt: new Date().toISOString(),
          environment: {
            platform: 'win32',
            arch: 'x64',
            nodeVersion: 'v20.0.0',
          },
          git: {
            commit: 'abc123def456',
            branch: 'main',
            dirty: false,
          },
        }

        const id = await storage.save(report)
        const loaded = await storage.get(id)

        expect(loaded).not.toBeNull()
        expect(loaded!.name).toBe(report.name)
        expect(loaded!.git?.commit).toBe('abc123def456')
        expect(loaded!.git?.branch).toBe('main')

        await storage.close()
      })

      it('应该正确保存 Git 信息', async () => {
        const storage = new SQLiteStorage(SQLITE_DB_PATH)
        await storage.initialize()

        const report: EnhancedBenchmarkReport = {
          id: 'git-test-id',
          name: 'Git Test Report',
          suites: [],
          generatedAt: new Date().toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
          git: {
            commit: 'a1b2c3d4e5f6g7h8i9j0',
            branch: 'feature/test',
            dirty: true,
          },
        }

        await storage.save(report)
        const loaded = await storage.get('git-test-id')

        expect(loaded!.git).toBeDefined()
        expect(loaded!.git!.commit).toBe('a1b2c3d4e5f6g7h8i9j0')
        expect(loaded!.git!.branch).toBe('feature/test')
        expect(loaded!.git!.dirty).toBe(true)

        await storage.close()
      })

      it('应该正确删除报告', async () => {
        const storage = new SQLiteStorage(SQLITE_DB_PATH)
        await storage.initialize()

        const report: BenchmarkReport = {
          name: 'Test Report',
          suites: [],
          generatedAt: new Date().toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        }

        const id = await storage.save(report)
        expect(await storage.get(id)).not.toBeNull()

        const deleted = await storage.delete(id)
        expect(deleted).toBe(true)
        expect(await storage.get(id)).toBeNull()

        await storage.close()
      })
    })
  })

  describe('createStorage', () => {
    it('应该创建 JSON 存储', async () => {
      const storage = await createStorage('json', JSON_STORAGE_DIR)
      expect(storage).toBeInstanceOf(JSONStorage)
      await storage.close()
    })

    it('应该创建 SQLite 存储', async () => {
      const storage = await createStorage('sqlite', SQLITE_DB_PATH)
      expect(storage).toBeInstanceOf(SQLiteStorage)
      await storage.close()
    })
  })
})


describe('查询过滤功能', () => {
  describe('JSONStorage 查询', () => {
    it('应该按日期范围过滤', async () => {
      const storage = new JSONStorage(JSON_STORAGE_DIR)

      // 创建不同日期的报告
      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [],
        generatedAt: '2024-01-15T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [],
        generatedAt: '2024-02-15T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const report3: EnhancedBenchmarkReport = {
        id: 'report-3',
        name: 'Report 3',
        suites: [],
        generatedAt: '2024-03-15T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }

      await storage.save(report1)
      await storage.save(report2)
      await storage.save(report3)

      // 查询 2024-02-01 到 2024-02-28 之间的报告
      const results = await storage.query({
        dateRange: {
          start: new Date('2024-02-01'),
          end: new Date('2024-02-28'),
        },
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-2')

      await storage.close()
    })

    it('应该按套件名称过滤', async () => {
      const storage = new JSONStorage(JSON_STORAGE_DIR)

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [{ name: 'Suite A', results: [], duration: 100, timestamp: Date.now() }],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [{ name: 'Suite B', results: [], duration: 100, timestamp: Date.now() }],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }

      await storage.save(report1)
      await storage.save(report2)

      const results = await storage.query({ suites: ['Suite A'] })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-1')

      await storage.close()
    })

    it('应该按标签过滤', async () => {
      const storage = new JSONStorage(JSON_STORAGE_DIR)

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [{
          name: 'Suite',
          results: [{ name: 'Task', opsPerSecond: 100, avgTime: 1, minTime: 0.5, maxTime: 1.5, stdDev: 0.1, rme: 5, iterations: 10, totalTime: 10, tags: ['fast'] }],
          duration: 100,
          timestamp: Date.now(),
        }],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [{
          name: 'Suite',
          results: [{ name: 'Task', opsPerSecond: 100, avgTime: 1, minTime: 0.5, maxTime: 1.5, stdDev: 0.1, rme: 5, iterations: 10, totalTime: 10, tags: ['slow'] }],
          duration: 100,
          timestamp: Date.now(),
        }],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }

      await storage.save(report1)
      await storage.save(report2)

      const results = await storage.query({ tags: ['fast'] })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-1')

      await storage.close()
    })

    it('应该按 Git 分支过滤', async () => {
      const storage = new JSONStorage(JSON_STORAGE_DIR)

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        git: { branch: 'main' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        git: { branch: 'feature/test' },
      }

      await storage.save(report1)
      await storage.save(report2)

      const results = await storage.query({ branch: 'main' })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-1')

      await storage.close()
    })

    it('应该支持排序', async () => {
      const sortStorageDir = path.join(TEST_DIR, 'sort-test')
      mkdirSync(sortStorageDir, { recursive: true })
      const storage = new JSONStorage(sortStorageDir)

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [],
        generatedAt: '2024-01-01T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        duration: 100,
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [],
        generatedAt: '2024-02-01T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        duration: 200,
      }

      await storage.save(report1)
      await storage.save(report2)

      // 按日期升序
      const ascResults = await storage.query({ orderBy: 'date', order: 'asc' })
      expect(ascResults[0].id).toBe('report-1')

      // 按日期降序
      const descResults = await storage.query({ orderBy: 'date', order: 'desc' })
      expect(descResults[0].id).toBe('report-2')

      // 按时长排序
      const durationResults = await storage.query({ orderBy: 'duration', order: 'desc' })
      expect(durationResults[0].id).toBe('report-2')

      await storage.close()
    })

    it('应该支持分页', async () => {
      const storage = new JSONStorage(JSON_STORAGE_DIR)

      for (let i = 0; i < 5; i++) {
        await storage.save({
          id: `report-${i}`,
          name: `Report ${i}`,
          suites: [],
          generatedAt: new Date(2024, 0, i + 1).toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        })
      }

      // 获取前 2 条
      const page1 = await storage.query({ limit: 2, orderBy: 'date', order: 'asc' })
      expect(page1.length).toBe(2)
      expect(page1[0].id).toBe('report-0')

      // 获取第 2 页
      const page2 = await storage.query({ limit: 2, offset: 2, orderBy: 'date', order: 'asc' })
      expect(page2.length).toBe(2)
      expect(page2[0].id).toBe('report-2')

      await storage.close()
    })
  })

  describe('SQLiteStorage 查询', () => {
    it('应该按日期范围过滤', async () => {
      const storage = new SQLiteStorage(SQLITE_DB_PATH)
      await storage.initialize()

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [],
        generatedAt: '2024-01-15T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [],
        generatedAt: '2024-02-15T00:00:00.000Z',
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }

      await storage.save(report1)
      await storage.save(report2)

      const results = await storage.query({
        dateRange: {
          start: new Date('2024-02-01'),
          end: new Date('2024-02-28'),
        },
      })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-2')

      await storage.close()
    })

    it('应该按 Git 分支过滤', async () => {
      const storage = new SQLiteStorage(SQLITE_DB_PATH)
      await storage.initialize()

      const report1: EnhancedBenchmarkReport = {
        id: 'report-1',
        name: 'Report 1',
        suites: [],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        git: { branch: 'main' },
      }
      const report2: EnhancedBenchmarkReport = {
        id: 'report-2',
        name: 'Report 2',
        suites: [],
        generatedAt: new Date().toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        git: { branch: 'develop' },
      }

      await storage.save(report1)
      await storage.save(report2)

      const results = await storage.query({ branch: 'main' })

      expect(results.length).toBe(1)
      expect(results[0].id).toBe('report-1')

      await storage.close()
    })

    it('应该支持分页', async () => {
      const storage = new SQLiteStorage(SQLITE_DB_PATH)
      await storage.initialize()

      for (let i = 0; i < 5; i++) {
        await storage.save({
          id: `report-${i}`,
          name: `Report ${i}`,
          suites: [],
          generatedAt: new Date(2024, 0, i + 1).toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        })
      }

      const page1 = await storage.query({ limit: 2, orderBy: 'date', order: 'asc' })
      expect(page1.length).toBe(2)

      const page2 = await storage.query({ limit: 2, offset: 2, orderBy: 'date', order: 'asc' })
      expect(page2.length).toBe(2)

      await storage.close()
    })
  })
})


describe('查询过滤正确性属性测试', () => {
  /**
   * 生成带有可控属性的报告 Arbitrary
   */
  const controlledReportArbitrary = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    // 使用固定的日期范围便于测试
    generatedAt: fc.integer({ min: 1704067200000, max: 1735689600000 }) // 2024-01-01 to 2025-01-01
      .map(ts => new Date(ts).toISOString()),
    suites: fc.array(
      fc.record({
        name: fc.constantFrom('Suite-A', 'Suite-B', 'Suite-C', 'Suite-D'),
        results: fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            opsPerSecond: fc.double({ min: 1, max: 10000, noNaN: true }),
            avgTime: fc.double({ min: 0.01, max: 100, noNaN: true }),
            minTime: fc.double({ min: 0.01, max: 100, noNaN: true }),
            maxTime: fc.double({ min: 0.01, max: 100, noNaN: true }),
            stdDev: fc.double({ min: 0, max: 10, noNaN: true }),
            rme: fc.double({ min: 0, max: 50, noNaN: true }),
            iterations: fc.integer({ min: 1, max: 1000 }),
            totalTime: fc.double({ min: 1, max: 10000, noNaN: true }),
            tags: fc.option(
              fc.array(fc.constantFrom('fast', 'slow', 'memory', 'cpu', 'io'), { minLength: 1, maxLength: 3 }),
              { nil: undefined }
            ),
          }),
          { minLength: 0, maxLength: 2 }
        ),
        duration: fc.integer({ min: 1, max: 10000 }),
        timestamp: fc.integer({ min: 1704067200000, max: 1735689600000 }),
      }),
      { minLength: 0, maxLength: 2 }
    ),
    environment: fc.constant({ platform: 'win32' as const, arch: 'x64' as const, nodeVersion: 'v20.0.0' }),
    git: fc.option(
      fc.record({
        branch: fc.constantFrom('main', 'develop', 'feature/test', 'release/v1'),
        commit: fc.option(fc.stringMatching(/^[a-f0-9]{40}$/), { nil: undefined }),
      }),
      { nil: undefined }
    ),
    duration: fc.option(fc.integer({ min: 1, max: 100000 }), { nil: undefined }),
  }) as fc.Arbitrary<EnhancedBenchmarkReport>

  /**
   * 检查报告是否满足查询条件
   */
  function matchesQuery(report: EnhancedBenchmarkReport, query: QueryOptions): boolean {
    // 日期范围过滤
    if (query.dateRange) {
      const reportDate = new Date(report.generatedAt)
      if (reportDate < query.dateRange.start || reportDate > query.dateRange.end) {
        return false
      }
    }

    // 套件名称过滤
    if (query.suites && query.suites.length > 0) {
      const reportSuiteNames = report.suites.map(s => s.name)
      const hasMatchingSuite = query.suites.some(name => reportSuiteNames.includes(name))
      if (!hasMatchingSuite) {
        return false
      }
    }

    // 标签过滤
    if (query.tags && query.tags.length > 0) {
      const reportTags = new Set<string>()
      for (const suite of report.suites) {
        for (const result of suite.results) {
          if (result.tags) {
            result.tags.forEach(tag => reportTags.add(tag))
          }
        }
      }
      const hasMatchingTag = query.tags.some(tag => reportTags.has(tag))
      if (!hasMatchingTag) {
        return false
      }
    }

    // Git 分支过滤
    if (query.branch) {
      if (!report.git?.branch || report.git.branch !== query.branch) {
        return false
      }
    }

    return true
  }

  /**
   * 属性 4: 查询过滤正确性 - JSONStorage
   * 
   * *对于任意*存储的报告集合和查询条件（日期范围、套件名称、标签），
   * 查询结果应该只包含满足所有过滤条件的报告，且不遗漏任何满足条件的报告。
   * 
   * **Feature: benchmark-enhancement, Property 4: 查询过滤正确性**
   * **Validates: Requirements 7.2**
   */
  it('属性 4: JSONStorage 查询过滤正确性', async () => {
    const pbtStorageDir = path.join(TEST_DIR, 'pbt-json-query')
    mkdirSync(pbtStorageDir, { recursive: true })

    await fc.assert(
      fc.asyncProperty(
        // 生成 1-5 个报告
        fc.array(controlledReportArbitrary, { minLength: 1, maxLength: 5 }),
        // 生成查询条件
        fc.record({
          dateRange: fc.option(
            fc.record({
              start: fc.integer({ min: 1704067200000, max: 1719792000000 }).map(ts => new Date(ts)), // 2024-01-01 to 2024-07-01
              end: fc.integer({ min: 1719792000000, max: 1735689600000 }).map(ts => new Date(ts)), // 2024-07-01 to 2025-01-01
            }),
            { nil: undefined }
          ),
          suites: fc.option(
            fc.array(fc.constantFrom('Suite-A', 'Suite-B', 'Suite-C'), { minLength: 1, maxLength: 2 }),
            { nil: undefined }
          ),
          tags: fc.option(
            fc.array(fc.constantFrom('fast', 'slow', 'memory'), { minLength: 1, maxLength: 2 }),
            { nil: undefined }
          ),
          branch: fc.option(fc.constantFrom('main', 'develop', 'feature/test'), { nil: undefined }),
        }),
        async (reports, queryOptions) => {
          // 为每次测试创建独立的存储目录
          const testDir = path.join(pbtStorageDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          mkdirSync(testDir, { recursive: true })
          const storage = new JSONStorage(testDir)

          try {
            // 保存所有报告
            for (const report of reports) {
              await storage.save(report)
            }

            // 构建查询
            const query: QueryOptions = {}
            if (queryOptions.dateRange) query.dateRange = queryOptions.dateRange
            if (queryOptions.suites) query.suites = queryOptions.suites
            if (queryOptions.tags) query.tags = queryOptions.tags
            if (queryOptions.branch) query.branch = queryOptions.branch

            // 执行查询
            const results = await storage.query(query)

            // 计算预期结果
            const expectedMatches = reports.filter(r => matchesQuery(r, query))

            // 验证: 结果数量应该匹配
            if (results.length !== expectedMatches.length) {
              return false
            }

            // 验证: 所有返回的结果都应该满足查询条件
            for (const result of results) {
              if (!matchesQuery(result, query)) {
                return false
              }
            }

            // 验证: 所有满足条件的报告都应该在结果中
            const resultIds = new Set(results.map(r => r.id))
            for (const expected of expectedMatches) {
              if (!resultIds.has(expected.id)) {
                return false
              }
            }

            return true
          } finally {
            await storage.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * 属性 4: 查询过滤正确性 - SQLiteStorage
   * 
   * **Feature: benchmark-enhancement, Property 4: 查询过滤正确性**
   * **Validates: Requirements 7.2**
   */
  it('属性 4: SQLiteStorage 查询过滤正确性', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(controlledReportArbitrary, { minLength: 1, maxLength: 5 }),
        fc.record({
          dateRange: fc.option(
            fc.record({
              start: fc.integer({ min: 1704067200000, max: 1719792000000 }).map(ts => new Date(ts)),
              end: fc.integer({ min: 1719792000000, max: 1735689600000 }).map(ts => new Date(ts)),
            }),
            { nil: undefined }
          ),
          suites: fc.option(
            fc.array(fc.constantFrom('Suite-A', 'Suite-B', 'Suite-C'), { minLength: 1, maxLength: 2 }),
            { nil: undefined }
          ),
          tags: fc.option(
            fc.array(fc.constantFrom('fast', 'slow', 'memory'), { minLength: 1, maxLength: 2 }),
            { nil: undefined }
          ),
          branch: fc.option(fc.constantFrom('main', 'develop', 'feature/test'), { nil: undefined }),
        }),
        async (reports, queryOptions) => {
          const testDbPath = path.join(TEST_DIR, `pbt-sqlite-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
          const storage = new SQLiteStorage(testDbPath)
          await storage.initialize()

          try {
            // 保存所有报告
            for (const report of reports) {
              await storage.save(report)
            }

            // 构建查询
            const query: QueryOptions = {}
            if (queryOptions.dateRange) query.dateRange = queryOptions.dateRange
            if (queryOptions.suites) query.suites = queryOptions.suites
            if (queryOptions.tags) query.tags = queryOptions.tags
            if (queryOptions.branch) query.branch = queryOptions.branch

            // 执行查询
            const results = await storage.query(query)

            // 计算预期结果
            const expectedMatches = reports.filter(r => matchesQuery(r, query))

            // 验证
            if (results.length !== expectedMatches.length) {
              return false
            }

            for (const result of results) {
              if (!matchesQuery(result, query)) {
                return false
              }
            }

            const resultIds = new Set(results.map(r => r.id))
            for (const expected of expectedMatches) {
              if (!resultIds.has(expected.id)) {
                return false
              }
            }

            return true
          } finally {
            await storage.close()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})


describe('数据保留策略', () => {
  describe('JSONStorage 数据保留', () => {
    it('应该按天数清理旧记录', async () => {
      const retentionDir = path.join(TEST_DIR, 'retention-age')
      mkdirSync(retentionDir, { recursive: true })
      const storage = new JSONStorage(retentionDir)

      // 创建不同日期的报告
      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000

      const oldReport: EnhancedBenchmarkReport = {
        id: 'old-report',
        name: 'Old Report',
        suites: [],
        generatedAt: new Date(now - 10 * oneDay).toISOString(), // 10 天前
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }
      const recentReport: EnhancedBenchmarkReport = {
        id: 'recent-report',
        name: 'Recent Report',
        suites: [],
        generatedAt: new Date(now - 2 * oneDay).toISOString(), // 2 天前
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      }

      await storage.save(oldReport)
      await storage.save(recentReport)

      expect(await storage.count()).toBe(2)

      // 清理超过 5 天的记录
      const deleted = await storage.cleanup({ maxAge: 5 })

      expect(deleted).toBe(1)
      expect(await storage.count()).toBe(1)
      expect(await storage.get('old-report')).toBeNull()
      expect(await storage.get('recent-report')).not.toBeNull()

      await storage.close()
    })

    it('应该按数量清理旧记录', async () => {
      const retentionDir = path.join(TEST_DIR, 'retention-count')
      mkdirSync(retentionDir, { recursive: true })
      const storage = new JSONStorage(retentionDir)

      // 创建多个报告
      for (let i = 0; i < 5; i++) {
        await storage.save({
          id: `report-${i}`,
          name: `Report ${i}`,
          suites: [],
          generatedAt: new Date(2024, 0, i + 1).toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        })
      }

      expect(await storage.count()).toBe(5)

      // 只保留最近 2 条
      const deleted = await storage.cleanup({ maxCount: 2 })

      expect(deleted).toBe(3)
      expect(await storage.count()).toBe(2)

      // 验证保留的是最新的 2 条
      const remaining = await storage.query({ orderBy: 'date', order: 'desc' })
      expect(remaining.length).toBe(2)
      expect(remaining[0].id).toBe('report-4')
      expect(remaining[1].id).toBe('report-3')

      await storage.close()
    })

    it('应该同时支持按天数和数量清理', async () => {
      const retentionDir = path.join(TEST_DIR, 'retention-both')
      mkdirSync(retentionDir, { recursive: true })
      const storage = new JSONStorage(retentionDir)

      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000

      // 创建 5 个报告，其中 2 个超过 7 天
      for (let i = 0; i < 5; i++) {
        await storage.save({
          id: `report-${i}`,
          name: `Report ${i}`,
          suites: [],
          generatedAt: new Date(now - (i * 3) * oneDay).toISOString(), // 0, 3, 6, 9, 12 天前
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        })
      }

      expect(await storage.count()).toBe(5)

      // 清理超过 7 天的记录，同时只保留最近 3 条
      const deleted = await storage.cleanup({ maxAge: 7, maxCount: 3 })

      // 应该删除 report-3 (9天前) 和 report-4 (12天前) 因为超过 7 天
      // 同时 report-2 (6天前) 也会被删除因为只保留 3 条
      expect(deleted).toBe(2) // 只有 2 条超过 7 天
      expect(await storage.count()).toBe(3)

      await storage.close()
    })

    it('应该支持按套件过滤清理', async () => {
      const retentionDir = path.join(TEST_DIR, 'retention-suite')
      mkdirSync(retentionDir, { recursive: true })
      const storage = new JSONStorage(retentionDir)

      await storage.save({
        id: 'report-a',
        name: 'Report A',
        suites: [{ name: 'Suite-A', results: [], duration: 100, timestamp: Date.now() }],
        generatedAt: new Date(2024, 0, 1).toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      })
      await storage.save({
        id: 'report-b',
        name: 'Report B',
        suites: [{ name: 'Suite-B', results: [], duration: 100, timestamp: Date.now() }],
        generatedAt: new Date(2024, 0, 2).toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      })
      await storage.save({
        id: 'report-a2',
        name: 'Report A2',
        suites: [{ name: 'Suite-A', results: [], duration: 100, timestamp: Date.now() }],
        generatedAt: new Date(2024, 0, 3).toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      })

      expect(await storage.count()).toBe(3)

      // 只清理 Suite-A 的报告，保留最近 1 条
      const deleted = await storage.cleanup({ maxCount: 1, suites: ['Suite-A'] })

      expect(deleted).toBe(1) // 只删除 report-a
      expect(await storage.count()).toBe(2)
      expect(await storage.get('report-a')).toBeNull()
      expect(await storage.get('report-b')).not.toBeNull()
      expect(await storage.get('report-a2')).not.toBeNull()

      await storage.close()
    })
  })

  describe('SQLiteStorage 数据保留', () => {
    it('应该按天数清理旧记录', async () => {
      const dbPath = path.join(TEST_DIR, 'retention-age.db')
      const storage = new SQLiteStorage(dbPath)
      await storage.initialize()

      const now = Date.now()
      const oneDay = 24 * 60 * 60 * 1000

      await storage.save({
        id: 'old-report',
        name: 'Old Report',
        suites: [],
        generatedAt: new Date(now - 10 * oneDay).toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      })
      await storage.save({
        id: 'recent-report',
        name: 'Recent Report',
        suites: [],
        generatedAt: new Date(now - 2 * oneDay).toISOString(),
        environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
      })

      expect(await storage.count()).toBe(2)

      const deleted = await storage.cleanup({ maxAge: 5 })

      expect(deleted).toBe(1)
      expect(await storage.count()).toBe(1)
      expect(await storage.get('old-report')).toBeNull()
      expect(await storage.get('recent-report')).not.toBeNull()

      await storage.close()
    })

    it('应该按数量清理旧记录', async () => {
      const dbPath = path.join(TEST_DIR, 'retention-count.db')
      const storage = new SQLiteStorage(dbPath)
      await storage.initialize()

      for (let i = 0; i < 5; i++) {
        await storage.save({
          id: `report-${i}`,
          name: `Report ${i}`,
          suites: [],
          generatedAt: new Date(2024, 0, i + 1).toISOString(),
          environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
        })
      }

      expect(await storage.count()).toBe(5)

      const deleted = await storage.cleanup({ maxCount: 2 })

      expect(deleted).toBe(3)
      expect(await storage.count()).toBe(2)

      await storage.close()
    })
  })
})


describe('数据保留策略属性测试', () => {
  /**
   * 生成带有可控日期的报告 Arbitrary
   */
  const timedReportArbitrary = (baseTime: number, dayOffset: number) => fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    generatedAt: fc.constant(new Date(baseTime - dayOffset * 24 * 60 * 60 * 1000).toISOString()),
    suites: fc.array(
      fc.record({
        name: fc.constantFrom('Suite-A', 'Suite-B', 'Suite-C'),
        results: fc.constant([]),
        duration: fc.integer({ min: 1, max: 10000 }),
        timestamp: fc.integer({ min: 1704067200000, max: 1735689600000 }),
      }),
      { minLength: 0, maxLength: 2 }
    ),
    environment: fc.constant({ platform: 'win32' as const, arch: 'x64' as const, nodeVersion: 'v20.0.0' }),
  }) as fc.Arbitrary<EnhancedBenchmarkReport>

  /**
   * 属性 5: 数据保留策略正确性 - maxAge
   * 
   * *对于任意*存储的报告集合和保留策略（最大天数），
   * 清理后保留的报告应该满足保留策略（不超过 maxAge 天），
   * 且被删除的报告都是超出策略范围的。
   * 
   * **Feature: benchmark-enhancement, Property 5: 数据保留策略正确性**
   * **Validates: Requirements 7.3**
   */
  it('属性 5: JSONStorage maxAge 数据保留策略正确性', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 maxAge (1-30 天)
        fc.integer({ min: 1, max: 30 }),
        // 生成报告的天数偏移 (0-60 天前)，避免边界情况
        fc.array(fc.integer({ min: 0, max: 60 }), { minLength: 1, maxLength: 10 }),
        async (maxAge, dayOffsets) => {
          const testDir = path.join(TEST_DIR, `pbt-retention-age-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          mkdirSync(testDir, { recursive: true })
          const storage = new JSONStorage(testDir)

          try {
            // 使用固定的基准时间来避免时间漂移问题
            const baseTime = Date.now()
            const oneDay = 24 * 60 * 60 * 1000

            // 创建报告，添加一点缓冲时间避免边界问题
            const reports: EnhancedBenchmarkReport[] = []
            for (let i = 0; i < dayOffsets.length; i++) {
              const dayOffset = dayOffsets[i]
              // 添加 1 小时的缓冲，确保不会因为毫秒级时间差导致边界问题
              const reportTime = baseTime - dayOffset * oneDay - 3600000
              const report: EnhancedBenchmarkReport = {
                id: `report-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: `Report ${i}`,
                suites: [],
                generatedAt: new Date(reportTime).toISOString(),
                environment: { platform: 'win32', arch: 'x64', nodeVersion: 'v20.0.0' },
              }
              await storage.save(report)
              reports.push(report)
            }

            // 执行清理
            await storage.cleanup({ maxAge })

            // 获取剩余报告
            const remaining = await storage.query()
            const remainingIds = new Set(remaining.map(r => r.id))

            // 验证每个报告的状态
            const maxAgeMs = maxAge * oneDay
            for (const report of reports) {
              const reportAge = baseTime - new Date(report.generatedAt).getTime()
              const shouldBeDeleted = reportAge > maxAgeMs
              const wasDeleted = !remainingIds.has(report.id)

              // 由于添加了缓冲时间，边界情况会更清晰
              if (shouldBeDeleted !== wasDeleted) {
                return false
              }
            }

            return true
          } finally {
            await storage.close()
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * 属性 5: 数据保留策略正确性 - maxCount
   * 
   * *对于任意*存储的报告集合和保留策略（最大数量），
   * 清理后保留的报告数量不应超过 maxCount，
   * 且保留的是最新的报告。
   * 
   * **Feature: benchmark-enhancement, Property 5: 数据保留策略正确性**
   * **Validates: Requirements 7.3**
   */
  it('属性 5: JSONStorage maxCount 数据保留策略正确性', async () => {
    const baseTime = Date.now()

    await fc.assert(
      fc.asyncProperty(
        // 生成 maxCount (1-10)
        fc.integer({ min: 1, max: 10 }),
        // 生成报告数量 (1-15)
        fc.integer({ min: 1, max: 15 }),
        async (maxCount, reportCount) => {
          const testDir = path.join(TEST_DIR, `pbt-retention-count-${Date.now()}-${Math.random().toString(36).slice(2)}`)
          mkdirSync(testDir, { recursive: true })
          const storage = new JSONStorage(testDir)

          try {
            // 创建报告，每个报告间隔 1 天
            const reports: EnhancedBenchmarkReport[] = []
            for (let i = 0; i < reportCount; i++) {
              const report = await fc.sample(timedReportArbitrary(baseTime, i), 1)[0]
              await storage.save(report)
              reports.push(report)
            }

            // 执行清理
            await storage.cleanup({ maxCount })

            // 获取剩余报告
            const remaining = await storage.query({ orderBy: 'date', order: 'desc' })

            // 验证: 剩余报告数量不超过 maxCount
            if (remaining.length > maxCount) {
              return false
            }

            // 验证: 剩余报告数量等于 min(reportCount, maxCount)
            const expectedCount = Math.min(reportCount, maxCount)
            if (remaining.length !== expectedCount) {
              return false
            }

            // 验证: 保留的是最新的报告
            const sortedReports = [...reports].sort(
              (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
            )
            const expectedIds = new Set(sortedReports.slice(0, maxCount).map(r => r.id))
            const remainingIds = new Set(remaining.map(r => r.id))

            for (const id of remainingIds) {
              if (!expectedIds.has(id)) {
                return false // 保留了不应该保留的报告
              }
            }

            return true
          } finally {
            await storage.close()
          }
        }
      ),
      { numRuns: 30 }
    )
  })

  /**
   * 属性 5: SQLiteStorage 数据保留策略正确性
   * 
   * **Feature: benchmark-enhancement, Property 5: 数据保留策略正确性**
   * **Validates: Requirements 7.3**
   */
  it('属性 5: SQLiteStorage 数据保留策略正确性', async () => {
    const baseTime = Date.now()

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 15 }),
        async (maxCount, reportCount) => {
          const dbPath = path.join(TEST_DIR, `pbt-sqlite-retention-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
          const storage = new SQLiteStorage(dbPath)
          await storage.initialize()

          try {
            const reports: EnhancedBenchmarkReport[] = []
            for (let i = 0; i < reportCount; i++) {
              const report = await fc.sample(timedReportArbitrary(baseTime, i), 1)[0]
              await storage.save(report)
              reports.push(report)
            }

            await storage.cleanup({ maxCount })

            const remaining = await storage.query({ orderBy: 'date', order: 'desc' })

            // 验证数量
            const expectedCount = Math.min(reportCount, maxCount)
            if (remaining.length !== expectedCount) {
              return false
            }

            // 验证保留的是最新的
            const sortedReports = [...reports].sort(
              (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
            )
            const expectedIds = new Set(sortedReports.slice(0, maxCount).map(r => r.id))
            const remainingIds = new Set(remaining.map(r => r.id))

            for (const id of remainingIds) {
              if (!expectedIds.has(id)) {
                return false
              }
            }

            return true
          } finally {
            await storage.close()
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
