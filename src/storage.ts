/**
 * 存储层 - 支持 JSON 文件和 SQLite 数据库存储
 * 
 * @module storage
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BenchmarkReport } from './types'

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 日期范围 */
  dateRange?: {
    start: Date
    end: Date
  }
  /** 套件名称过滤 */
  suites?: string[]
  /** 标签过滤 */
  tags?: string[]
  /** Git 分支过滤 */
  branch?: string
  /** 排序字段 */
  orderBy?: 'date' | 'duration' | 'suiteCount'
  /** 排序方向 */
  order?: 'asc' | 'desc'
  /** 限制数量 */
  limit?: number
  /** 偏移量 */
  offset?: number
}

/**
 * 清理选项
 */
export interface CleanupOptions {
  /** 保留最近 N 天的记录 */
  maxAge?: number
  /** 保留最近 N 条记录 */
  maxCount?: number
  /** 只清理特定套件 */
  suites?: string[]
}

/**
 * 增强的报告结构（包含 Git 信息）
 */
export interface EnhancedBenchmarkReport extends BenchmarkReport {
  /** 报告 ID */
  id: string
  /** 总运行时间 */
  duration?: number
  /** Git 信息 */
  git?: {
    commit?: string
    branch?: string
    dirty?: boolean
  }
  /** 标签 */
  tags?: string[]
}

/**
 * 存储接口 - 抽象存储层
 */
export interface BenchmarkStorage {
  /**
   * 保存基准测试报告
   */
  save(report: BenchmarkReport | EnhancedBenchmarkReport): Promise<string>

  /**
   * 获取报告
   */
  get(id: string): Promise<EnhancedBenchmarkReport | null>

  /**
   * 查询历史记录
   */
  query(options?: QueryOptions): Promise<EnhancedBenchmarkReport[]>

  /**
   * 删除记录
   */
  delete(id: string): Promise<boolean>

  /**
   * 清理旧记录
   */
  cleanup(options: CleanupOptions): Promise<number>

  /**
   * 关闭连接
   */
  close(): Promise<void>

  /**
   * 获取所有报告数量
   */
  count(): Promise<number>
}

/**
 * JSON 文件存储实现
 */
export class JSONStorage implements BenchmarkStorage {
  private storageDir: string

  constructor(storageDir: string) {
    this.storageDir = storageDir
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true })
    }
  }

  private getFilePath(id: string): string {
    return path.join(this.storageDir, `${id}.json`)
  }

  async save(report: BenchmarkReport | EnhancedBenchmarkReport): Promise<string> {
    const id = (report as EnhancedBenchmarkReport).id || randomUUID()
    const enhancedReport: EnhancedBenchmarkReport = {
      ...report,
      id,
    }

    const filePath = this.getFilePath(id)
    writeFileSync(filePath, JSON.stringify(enhancedReport, null, 2), 'utf-8')
    return id
  }

  async get(id: string): Promise<EnhancedBenchmarkReport | null> {
    const filePath = this.getFilePath(id)
    if (!existsSync(filePath)) {
      return null
    }

    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as EnhancedBenchmarkReport
    } catch {
      return null
    }
  }

  async query(options: QueryOptions = {}): Promise<EnhancedBenchmarkReport[]> {
    this.ensureDir()
    const files = readdirSync(this.storageDir).filter(f => f.endsWith('.json'))
    let reports: EnhancedBenchmarkReport[] = []

    for (const file of files) {
      try {
        const content = readFileSync(path.join(this.storageDir, file), 'utf-8')
        const report = JSON.parse(content) as EnhancedBenchmarkReport
        reports.push(report)
      } catch {
        // 忽略无效文件
      }
    }

    // 应用过滤
    reports = this.applyFilters(reports, options)

    // 应用排序
    reports = this.applySort(reports, options)

    // 应用分页
    if (options.offset !== undefined) {
      reports = reports.slice(options.offset)
    }
    if (options.limit !== undefined) {
      reports = reports.slice(0, options.limit)
    }

    return reports
  }

  private applyFilters(reports: EnhancedBenchmarkReport[], options: QueryOptions): EnhancedBenchmarkReport[] {
    return reports.filter(report => {
      // 日期范围过滤
      if (options.dateRange) {
        const reportDate = new Date(report.generatedAt)
        if (reportDate < options.dateRange.start || reportDate > options.dateRange.end) {
          return false
        }
      }

      // 套件名称过滤
      if (options.suites && options.suites.length > 0) {
        const reportSuiteNames = report.suites.map(s => s.name)
        if (!options.suites.some(name => reportSuiteNames.includes(name))) {
          return false
        }
      }

      // 标签过滤
      if (options.tags && options.tags.length > 0) {
        const reportTags = [...(report.tags || [])]
        // 收集所有结果的标签
        for (const suite of report.suites) {
          for (const result of suite.results) {
            if (result.tags) {
              reportTags.push(...result.tags)
            }
          }
        }
        if (!options.tags.some(tag => reportTags.includes(tag))) {
          return false
        }
      }

      // Git 分支过滤
      if (options.branch) {
        if (report.git?.branch !== options.branch) {
          return false
        }
      }

      return true
    })
  }

  private applySort(reports: EnhancedBenchmarkReport[], options: QueryOptions): EnhancedBenchmarkReport[] {
    const orderBy = options.orderBy || 'date'
    const order = options.order || 'desc'

    return reports.sort((a, b) => {
      let comparison = 0

      switch (orderBy) {
        case 'date':
          comparison = new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()
          break
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0)
          break
        case 'suiteCount':
          comparison = a.suites.length - b.suites.length
          break
      }

      return order === 'asc' ? comparison : -comparison
    })
  }

  async delete(id: string): Promise<boolean> {
    const filePath = this.getFilePath(id)
    if (!existsSync(filePath)) {
      return false
    }

    try {
      unlinkSync(filePath)
      return true
    } catch {
      return false
    }
  }

  async cleanup(options: CleanupOptions): Promise<number> {
    let reports = await this.query({ orderBy: 'date', order: 'desc' })
    let deletedCount = 0

    // 按套件过滤
    if (options.suites && options.suites.length > 0) {
      reports = reports.filter(report => {
        const reportSuiteNames = report.suites.map(s => s.name)
        return options.suites!.some(name => reportSuiteNames.includes(name))
      })
    }

    const now = Date.now()
    const toDelete: string[] = []

    // 按天数清理
    if (options.maxAge !== undefined && options.maxAge > 0) {
      const maxAgeMs = options.maxAge * 24 * 60 * 60 * 1000
      for (const report of reports) {
        const reportDate = new Date(report.generatedAt).getTime()
        if (now - reportDate > maxAgeMs) {
          toDelete.push(report.id)
        }
      }
    }

    // 按数量清理
    if (options.maxCount !== undefined && options.maxCount > 0) {
      const reportsToDelete = reports.slice(options.maxCount)
      for (const report of reportsToDelete) {
        if (!toDelete.includes(report.id)) {
          toDelete.push(report.id)
        }
      }
    }

    // 执行删除
    for (const id of toDelete) {
      if (await this.delete(id)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  async close(): Promise<void> {
    // JSON 存储不需要关闭连接
  }

  async count(): Promise<number> {
    this.ensureDir()
    const files = readdirSync(this.storageDir).filter(f => f.endsWith('.json'))
    return files.length
  }
}


/**
 * sql.js 数据库类型定义
 */
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): void
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>
  getRowsModified(): number
  export(): Uint8Array
  close(): void
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase
}

/**
 * SQLite 存储实现（使用 sql.js）
 */
export class SQLiteStorage implements BenchmarkStorage {
  private db: SqlJsDatabase | null = null
  private dbPath: string
  private initialized: boolean = false
  private SQL: SqlJsStatic | null = null

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  /**
   * 初始化数据库连接和表结构
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // 动态导入 sql.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initSqlJs = (await import('sql.js' as any)).default
      this.SQL = await initSqlJs()

      // 确保目录存在
      const dir = path.dirname(this.dbPath)
      if (dir && dir !== '.' && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // 如果数据库文件存在，加载它
      if (existsSync(this.dbPath) && this.SQL) {
        const fileBuffer = readFileSync(this.dbPath)
        this.db = new this.SQL.Database(new Uint8Array(fileBuffer))
      } else if (this.SQL) {
        this.db = new this.SQL.Database()
      }

      if (!this.db) {
        throw new Error('无法创建数据库实例')
      }

      // 创建表结构
      this.db!.run(`
        CREATE TABLE IF NOT EXISTS benchmark_reports (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          generated_at TEXT NOT NULL,
          duration INTEGER,
          platform TEXT,
          arch TEXT,
          node_version TEXT,
          git_commit TEXT,
          git_branch TEXT,
          git_dirty INTEGER,
          tags TEXT,
          data TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS benchmark_suites (
          id TEXT PRIMARY KEY,
          report_id TEXT NOT NULL,
          name TEXT NOT NULL,
          duration INTEGER,
          task_count INTEGER,
          timestamp INTEGER,
          FOREIGN KEY (report_id) REFERENCES benchmark_reports(id) ON DELETE CASCADE
        )
      `)

      this.db!.run(`
        CREATE TABLE IF NOT EXISTS benchmark_results (
          id TEXT PRIMARY KEY,
          suite_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'success',
          ops_per_second REAL,
          avg_time REAL,
          min_time REAL,
          max_time REAL,
          std_dev REAL,
          rme REAL,
          iterations INTEGER,
          total_time REAL,
          tags TEXT,
          FOREIGN KEY (suite_id) REFERENCES benchmark_suites(id) ON DELETE CASCADE
        )
      `)

      // 创建索引
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_reports_date ON benchmark_reports(generated_at)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_reports_branch ON benchmark_reports(git_branch)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_reports_commit ON benchmark_reports(git_commit)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_suites_name ON benchmark_suites(name)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_suites_report ON benchmark_suites(report_id)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_results_suite ON benchmark_results(suite_id)`)
      this.db!.run(`CREATE INDEX IF NOT EXISTS idx_results_name ON benchmark_results(name)`)

      this.initialized = true
      this.persist()
    } catch (error) {
      throw new Error(`无法初始化 SQLite 数据库: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 持久化数据库到文件
   */
  private persist(): void {
    if (this.db && this.dbPath !== ':memory:') {
      const data = this.db.export()
      writeFileSync(this.dbPath, data)
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()')
    }
  }

  /**
   * 执行查询并返回结果
   */
  private query_db(sql: string, params: unknown[] = []): Array<Record<string, unknown>> {
    this.ensureInitialized()

    // 替换参数占位符
    let processedSql = sql
    for (let i = 0; i < params.length; i++) {
      const param = params[i]
      const value = param === null ? 'NULL' :
        typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` :
          typeof param === 'number' ? String(param) :
            `'${String(param)}'`
      processedSql = processedSql.replace('?', value)
    }

    const result = this.db!.exec(processedSql)
    if (result.length === 0) {
      return []
    }

    const { columns, values } = result[0]
    return values.map(row => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    })
  }

  async save(report: BenchmarkReport | EnhancedBenchmarkReport): Promise<string> {
    this.ensureInitialized()

    const id = (report as EnhancedBenchmarkReport).id || randomUUID()
    const enhancedReport = report as EnhancedBenchmarkReport

    // 计算总时长
    const duration = enhancedReport.duration ||
      enhancedReport.suites.reduce((sum, s) => sum + (s.duration || 0), 0)

    // 收集所有标签
    const allTags: string[] = [...(enhancedReport.tags || [])]
    for (const suite of enhancedReport.suites) {
      for (const result of suite.results) {
        if (result.tags) {
          allTags.push(...result.tags)
        }
      }
    }
    const uniqueTags = [...new Set(allTags)]

    // 先删除已存在的记录（实现 REPLACE 功能）
    await this.delete(id)

    // 插入报告
    this.db!.run(`
      INSERT INTO benchmark_reports 
      (id, name, generated_at, duration, platform, arch, node_version, git_commit, git_branch, git_dirty, tags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      report.name,
      report.generatedAt,
      duration,
      report.environment.platform,
      report.environment.arch,
      report.environment.nodeVersion,
      enhancedReport.git?.commit || null,
      enhancedReport.git?.branch || null,
      enhancedReport.git?.dirty ? 1 : 0,
      uniqueTags.length > 0 ? JSON.stringify(uniqueTags) : null,
      JSON.stringify(report)
    ])

    // 插入套件和结果
    for (const suite of report.suites) {
      const suiteId = randomUUID()
      this.db!.run(`
        INSERT INTO benchmark_suites 
        (id, report_id, name, duration, task_count, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        suiteId,
        id,
        suite.name,
        suite.duration,
        suite.results.length,
        suite.timestamp
      ])

      for (const result of suite.results) {
        this.db!.run(`
          INSERT INTO benchmark_results 
          (id, suite_id, name, status, ops_per_second, avg_time, min_time, max_time, std_dev, rme, iterations, total_time, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          randomUUID(),
          suiteId,
          result.name,
          result.status || 'success',
          result.opsPerSecond,
          result.avgTime,
          result.minTime,
          result.maxTime,
          result.stdDev,
          result.rme,
          result.iterations,
          result.totalTime,
          result.tags ? JSON.stringify(result.tags) : null
        ])
      }
    }

    this.persist()
    return id
  }

  async get(id: string): Promise<EnhancedBenchmarkReport | null> {
    this.ensureInitialized()

    const rows = this.query_db(`
      SELECT data, git_commit, git_branch, git_dirty, tags, duration
      FROM benchmark_reports 
      WHERE id = ?
    `, [id])

    if (rows.length === 0) {
      return null
    }

    const row = rows[0] as {
      data: string
      git_commit: string | null
      git_branch: string | null
      git_dirty: number
      tags: string | null
      duration: number | null
    }

    const report = JSON.parse(row.data) as EnhancedBenchmarkReport
    report.id = id
    report.duration = row.duration || undefined

    // 添加 Git 信息
    if (row.git_commit || row.git_branch) {
      report.git = {
        commit: row.git_commit || undefined,
        branch: row.git_branch || undefined,
        dirty: row.git_dirty === 1,
      }
    }

    // 添加标签
    if (row.tags) {
      report.tags = JSON.parse(row.tags)
    }

    return report
  }

  async query(options: QueryOptions = {}): Promise<EnhancedBenchmarkReport[]> {
    this.ensureInitialized()

    let sql = `SELECT id, data, git_commit, git_branch, git_dirty, tags, duration FROM benchmark_reports WHERE 1=1`
    const params: unknown[] = []

    // 日期范围过滤
    if (options.dateRange) {
      sql += ` AND generated_at >= ? AND generated_at <= ?`
      params.push(options.dateRange.start.toISOString())
      params.push(options.dateRange.end.toISOString())
    }

    // Git 分支过滤
    if (options.branch) {
      sql += ` AND git_branch = ?`
      params.push(options.branch)
    }

    // 排序
    const orderBy = options.orderBy || 'date'
    const order = options.order || 'desc'
    const orderColumn = orderBy === 'date' ? 'generated_at' :
      orderBy === 'duration' ? 'duration' :
        '(SELECT COUNT(*) FROM benchmark_suites WHERE report_id = benchmark_reports.id)'
    sql += ` ORDER BY ${orderColumn} ${order.toUpperCase()}`

    // 分页
    if (options.limit !== undefined) {
      sql += ` LIMIT ?`
      params.push(options.limit)
    }
    if (options.offset !== undefined) {
      sql += ` OFFSET ?`
      params.push(options.offset)
    }

    const rows = this.query_db(sql, params) as Array<{
      id: string
      data: string
      git_commit: string | null
      git_branch: string | null
      git_dirty: number
      tags: string | null
      duration: number | null
    }>

    let reports = rows.map(row => {
      const report = JSON.parse(row.data) as EnhancedBenchmarkReport
      report.id = row.id
      report.duration = row.duration || undefined

      if (row.git_commit || row.git_branch) {
        report.git = {
          commit: row.git_commit || undefined,
          branch: row.git_branch || undefined,
          dirty: row.git_dirty === 1,
        }
      }

      if (row.tags) {
        report.tags = JSON.parse(row.tags)
      }

      return report
    })

    // 套件名称过滤（需要在内存中处理）
    if (options.suites && options.suites.length > 0) {
      reports = reports.filter(report => {
        const reportSuiteNames = report.suites.map(s => s.name)
        return options.suites!.some(name => reportSuiteNames.includes(name))
      })
    }

    // 标签过滤（需要在内存中处理）
    if (options.tags && options.tags.length > 0) {
      reports = reports.filter(report => {
        const reportTags: string[] = [...(report.tags || [])]
        for (const suite of report.suites) {
          for (const result of suite.results) {
            if (result.tags) {
              reportTags.push(...result.tags)
            }
          }
        }
        return options.tags!.some(tag => reportTags.includes(tag))
      })
    }

    return reports
  }

  async delete(id: string): Promise<boolean> {
    this.ensureInitialized()

    // 先删除关联的结果和套件
    const suiteRows = this.query_db(`SELECT id FROM benchmark_suites WHERE report_id = ?`, [id])

    for (const suite of suiteRows) {
      this.db!.run(`DELETE FROM benchmark_results WHERE suite_id = ?`, [suite.id as string])
    }

    this.db!.run(`DELETE FROM benchmark_suites WHERE report_id = ?`, [id])
    this.db!.run(`DELETE FROM benchmark_reports WHERE id = ?`, [id])

    const changes = this.db!.getRowsModified()
    this.persist()
    return changes > 0
  }

  async cleanup(options: CleanupOptions): Promise<number> {
    this.ensureInitialized()

    let deletedCount = 0
    const toDelete: string[] = []

    // 获取所有报告
    let reports = await this.query({ orderBy: 'date', order: 'desc' })

    // 按套件过滤
    if (options.suites && options.suites.length > 0) {
      reports = reports.filter(report => {
        const reportSuiteNames = report.suites.map(s => s.name)
        return options.suites!.some(name => reportSuiteNames.includes(name))
      })
    }

    const now = Date.now()

    // 按天数清理
    if (options.maxAge !== undefined && options.maxAge > 0) {
      const maxAgeMs = options.maxAge * 24 * 60 * 60 * 1000
      for (const report of reports) {
        const reportDate = new Date(report.generatedAt).getTime()
        if (now - reportDate > maxAgeMs) {
          toDelete.push(report.id)
        }
      }
    }

    // 按数量清理
    if (options.maxCount !== undefined && options.maxCount > 0) {
      const reportsToDelete = reports.slice(options.maxCount)
      for (const report of reportsToDelete) {
        if (!toDelete.includes(report.id)) {
          toDelete.push(report.id)
        }
      }
    }

    // 执行删除
    for (const id of toDelete) {
      if (await this.delete(id)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  async close(): Promise<void> {
    if (this.db) {
      this.persist()
      this.db.close()
      this.db = null
      this.initialized = false
    }
  }

  async count(): Promise<number> {
    this.ensureInitialized()
    const result = this.query_db(`SELECT COUNT(*) as count FROM benchmark_reports`)
    return (result[0]?.count as number) || 0
  }
}

/**
 * 创建存储实例
 * 
 * @param type - 存储类型
 * @param storagePath - 存储路径
 * @returns 存储实例
 */
export async function createStorage(
  type: 'json' | 'sqlite',
  storagePath: string
): Promise<BenchmarkStorage> {
  if (type === 'sqlite') {
    const storage = new SQLiteStorage(storagePath)
    await storage.initialize()
    return storage
  }
  return new JSONStorage(storagePath)
}
