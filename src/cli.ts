#!/usr/bin/env node
import path from 'node:path'
import { cac } from 'cac'
import { createRunner, checkThresholds, BenchmarkReporter, createConfigLoader, validateConfig } from './index'
import type { BenchmarkThresholds, BenchmarkConfig } from './types'
import { globby } from 'globby'
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { watch } from 'chokidar'
import { performance } from 'node:perf_hooks'

const cli = cac('ldbench')
const VERSION = '0.2.0'

// 默认配置
const DEFAULT_CONFIG: BenchmarkConfig = {
  pattern: ['**/*.bench.{js,ts}'],
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  outputDir: './benchmark-reports',
  historyDir: './.benchmark-history',
  reporters: ['console'],
  defaults: {
    time: 1000,
    iterations: 10,
    warmup: 5,
  },
}

/**
 * 加载配置文件
 */
function loadConfig(configPath?: string): BenchmarkConfig {
  const searchPaths = configPath
    ? [path.resolve(process.cwd(), configPath)]
    : [
      path.join(process.cwd(), 'benchmark.config.json'),
      path.join(process.cwd(), 'benchmark.config.js'),
      path.join(process.cwd(), '.benchmarkrc'),
      path.join(process.cwd(), '.benchmarkrc.json'),
    ]

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      try {
        const content = readFileSync(searchPath, 'utf-8')
        const config = JSON.parse(content)
        return { ...DEFAULT_CONFIG, ...config }
      } catch (e) {
        // 忽略解析错误，继续尝试下一个
      }
    }
  }

  return DEFAULT_CONFIG
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

cli
  .command('run [files...]', '运行基准测试文件')
  .option('--pattern <pattern>', '匹配模式 (默认: **/*.bench.{js,ts})')
  .option('--config <file>', '配置文件路径')
  .option('--report <format>', '报告格式 (console, json, markdown, html)', {
    default: 'console',
  })
  .option('--out <file>', '输出文件路径')
  .option('--threshold <file>', '阈值配置文件路径')
  .option('--watch', '监听模式，文件变化时自动重新运行')
  .option('--compare <baseline>', '与基线报告对比')
  .option('--history', '保存到历史记录')
  .option('--verbose', '显示详细信息')
  .action(async (files: string[], options) => {
    try {
      // 1. 加载配置文件
      let config: any = {}
      if (options.config) {
        const configPath = path.resolve(process.cwd(), options.config)
        try {
          config = JSON.parse(readFileSync(configPath, 'utf-8'))
          if (options.verbose) {
            console.log(`📁 加载配置文件: ${configPath}`)
          }
        } catch (e) {
          console.error(`❌ 无法加载配置文件: ${configPath}`, e)
          process.exit(1)
        }
      }

      // 2. 收集基准测试文件
      const patterns = files.length > 0 ? files : [options.pattern || '**/*.bench.{js,ts}']
      const benchmarkFiles = await globby(patterns, {
        cwd: process.cwd(),
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      })

      if (benchmarkFiles.length === 0) {
        console.error('❌ 未找到基准测试文件')
        console.log('💡 尝试使用: ldbench run --pattern "**/*.bench.{js,ts}"')
        process.exit(1)
      }

      const runner = createRunner()

      // 2. 加载并注册 Suite
      // 注意：这需要 benchmark 文件导出 suite 或自动注册
      // 为了简单起见，我们假设 benchmark 文件不仅定义了 bench，还默认导出了一个 setup 函数或本身是可执行脚本
      // 但更好的方式是：让 benchmark 文件引用 @ldesign/benchmark 并自行 addSuite
      // 这里作为 CLI 入口，更适合去 import 这些文件，让它们执行 "addSuite" 逻辑
      // 但由于 runner 实例是在这里创建的，这就涉及到一个全局注册的问题

      // 简化方案：CLI 模式下，我们注入一个全局 runner? 或者让用户导出一个函数？
      // 最简单的约定：benchmark 文件 default export 一个 (runner: BenchmarkRunner) => void 函数

      console.log(`\n🔍 正在加载基准测试文件...`)
      console.log(`📂 找到 ${benchmarkFiles.length} 个文件`)

      for (const filePath of benchmarkFiles) {
        try {
          // 动态导入 - 修复 Windows 路径问题
          const importPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`
          const mod = await import(importPath)
          if (typeof mod.default === 'function') {
            await mod.default(runner)
            console.log(`  ✅ ${path.relative(process.cwd(), filePath)}`)
          } else {
            console.warn(`  ⚠️ ${path.relative(process.cwd(), filePath)} (没有导出默认函数)`)
          }
        } catch (e) {
          console.error(`  ❌ ${path.relative(process.cwd(), filePath)}:`, e)
        }
      }

      // 3. 运行所有
      const startTime = performance.now()
      const report = await runner.runAll()
      const endTime = performance.now()

      runner.printSummary(report)

      if (options.verbose) {
        console.log(`\n⏱️  总运行时间: ${(endTime - startTime).toFixed(2)}ms`)
      }

      // 4. 导出报告
      if (options.out) {
        await runner.exportJSON(report, options.out)
        if (options.verbose) {
          console.log(`💾 报告已保存到: ${options.out}`)
        }
      }

      // 5. 对比基线报告
      if (options.compare) {
        const baselinePath = path.resolve(process.cwd(), options.compare)
        try {
          const baselineReport = JSON.parse(readFileSync(baselinePath, 'utf-8'))
          const comparison = compareReports(baselineReport, report)

          console.log('\n📊 性能对比报告')
          console.log('='.repeat(80))
          comparison.forEach(item => {
            const trend = item.improvement > 0 ? '📈' : '📉'
            const percent = Math.abs(item.improvement).toFixed(2)
            console.log(`${trend} ${item.suite}::${item.task}: ${percent}% ${item.improvement > 0 ? '提升' : '下降'}`)
          })
        } catch (e) {
          console.error(`❌ 无法对比基线报告: ${baselinePath}`, e)
        }
      }

      // 6. 保存历史记录
      if (options.history) {
        const historyDir = path.join(process.cwd(), '.benchmark-history')
        const fs = await import('node:fs/promises')
        try {
          await fs.mkdir(historyDir, { recursive: true })
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const historyFile = path.join(historyDir, `${timestamp}.json`)
          await fs.writeFile(historyFile, JSON.stringify(report, null, 2))

          if (options.verbose) {
            console.log(`📚 历史记录已保存: ${historyFile}`)
          }
        } catch (e) {
          console.error('❌ 无法保存历史记录:', e)
        }
      }

      // 7. 阈值检查
      if (options.threshold) {
        const thresholdPath = path.resolve(process.cwd(), options.threshold)
        const thresholds: BenchmarkThresholds = (await import(thresholdPath)).default || {}
        const result = checkThresholds(report, thresholds)

        if (!result.passed) {
          console.error('\n❌ 阈值检查失败:')
          result.failures.forEach(f => {
            console.error(`  [${f.suite}] ${f.task}:`)
            f.reasons.forEach(r => console.error(`    - ${r}`))
          })
          process.exit(1)
        } else {
          console.log('\n✅ 阈值检查通过')
        }
      }

      // 8. 监听模式
      if (options.watch) {
        console.log('\n👀 进入监听模式... (Ctrl+C 退出)')

        const watcher = watch(benchmarkFiles, {
          persistent: true,
          ignoreInitial: true
        })

        watcher.on('change', async (filePath) => {
          console.log(`\n🔄 文件变化: ${path.relative(process.cwd(), filePath)}`)
          console.log('重新运行基准测试...')

          // 重新加载并运行
          const newRunner = createRunner()
          for (const file of benchmarkFiles) {
            try {
              const mod = await import(file)
              if (typeof mod.default === 'function') {
                await mod.default(newRunner)
              }
            } catch (e) {
              console.error(`❌ 重新加载失败: ${file}`, e)
            }
          }

          await newRunner.runAll()
          newRunner.printSummary(report)
        })

        process.on('SIGINT', () => {
          console.log('\n👋 退出监听模式')
          watcher.close()
          process.exit(0)
        })
      }

    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })

// 添加历史命令
cli
  .command('history', '查看历史基准测试记录')
  .option('--limit <number>', '显示最近 N 条记录', { default: 10 })
  .option('--suite <name>', '筛选特定套件')
  .action(async (options) => {
    const historyDir = path.join(process.cwd(), '.benchmark-history')
    const fs = await import('node:fs/promises')

    try {
      const files = await fs.readdir(historyDir)
      const historyFiles = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-options.limit)
        .reverse()

      console.log('\n📚 历史基准测试记录')
      console.log('='.repeat(80))

      for (const file of historyFiles) {
        const filePath = path.join(historyDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const report = JSON.parse(content)

        const date = new Date(report.generatedAt).toLocaleString('zh-CN')
        console.log(`\n📅 ${date}`)
        console.log(`📊 ${report.name}`)

        report.suites.forEach((suite: any) => {
          if (options.suite && suite.name !== options.suite) return

          console.log(`  📦 ${suite.name}`)
          suite.results.forEach((result: any) => {
            const ops = result.opsPerSecond >= 1000
              ? `${(result.opsPerSecond / 1000).toFixed(1)}K`
              : result.opsPerSecond.toFixed(0)
            console.log(`    • ${result.name}: ${ops} ops/sec`)
          })
        })
      }
    } catch (e) {
      console.error('❌ 无法读取历史记录:', e)
    }
  })

// 添加服务器命令
cli
  .command('serve', '启动可视化服务器')
  .option('--port <port>', '服务器端口', { default: 3000 })
  .option('--host <host>', '服务器主机', { default: 'localhost' })
  .action(async (options) => {
    try {
      const { BenchmarkServer } = await import('./server.js')
      const server = new BenchmarkServer({
        port: options.port,
        host: options.host
      })

      await server.start()
    } catch (error) {
      console.error('❌ 启动服务器失败:', error)
      process.exit(1)
    }
  })

// 添加 config-validate 命令
cli
  .command('config-validate [configFile]', '验证配置文件有效性')
  .option('--verbose', '显示详细验证信息')
  .option('--json', '以 JSON 格式输出结果')
  .action(async (configFile: string | undefined, options: { verbose?: boolean; json?: boolean }) => {
    try {
      const loader = createConfigLoader()
      const cwd = process.cwd()

      // 尝试加载配置文件
      let configPath: string | undefined
      let config: any

      if (configFile) {
        configPath = path.resolve(cwd, configFile)
        if (!existsSync(configPath)) {
          console.error(`❌ 配置文件不存在: ${configPath}`)
          process.exit(1)
        }
        config = loader.loadFromFile(configPath)
      } else {
        // 搜索默认配置文件
        const result = loader.findAndLoad(cwd)
        if (result) {
          config = result.config
          configPath = result.path
        } else {
          console.error('❌ 未找到配置文件')
          console.log('💡 尝试指定配置文件路径: ldbench config-validate <config-file>')
          console.log('💡 或运行 ldbench init 创建配置文件')
          process.exit(1)
        }
      }

      // 验证配置
      const result = validateConfig(config, cwd)

      if (options.json) {
        // JSON 格式输出
        console.log(JSON.stringify({
          valid: result.valid,
          configPath,
          errors: result.errors,
          warnings: result.warnings,
        }, null, 2))
      } else {
        // 人类可读格式输出
        console.log(`\n📋 配置文件验证: ${configPath}`)
        console.log('='.repeat(60))

        if (result.valid && result.warnings.length === 0) {
          console.log('\n✅ 配置文件有效，没有错误或警告')
        } else {
          if (result.errors.length > 0) {
            console.log(`\n❌ 发现 ${result.errors.length} 个错误:`)
            for (const error of result.errors) {
              console.log(`   • [${error.path}] ${error.message}`)
              if (options.verbose && error.value !== undefined) {
                console.log(`     当前值: ${JSON.stringify(error.value)}`)
              }
            }
          }

          if (result.warnings.length > 0) {
            console.log(`\n⚠️  发现 ${result.warnings.length} 个警告:`)
            for (const warning of result.warnings) {
              console.log(`   • [${warning.path}] ${warning.message}`)
              if (warning.suggestion) {
                console.log(`     建议: ${warning.suggestion}`)
              }
            }
          }

          if (result.valid) {
            console.log('\n✅ 配置文件有效（有警告但可以使用）')
          } else {
            console.log('\n❌ 配置文件无效，请修复上述错误')
          }
        }

        console.log('='.repeat(60))
      }

      // 如果配置无效，返回非零退出码
      if (!result.valid) {
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ 验证配置文件时发生错误:', error)
      process.exit(1)
    }
  })

// 添加 init 命令
cli
  .command('init', '初始化基准测试配置')
  .option('--force', '覆盖已有配置文件')
  .action(async (options: { force?: boolean }) => {
    const configPath = path.join(process.cwd(), 'benchmark.config.json')

    if (existsSync(configPath) && !options.force) {
      console.log('⚠️  配置文件已存在: benchmark.config.json')
      console.log('💡 使用 --force 覆盖已有配置')
      return
    }

    const defaultConfig = {
      "$schema": "./benchmark.schema.json",
      pattern: ["**/*.bench.{js,ts}"],
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      outputDir: "./benchmark-reports",
      historyDir: "./.benchmark-history",
      reporters: ["console"],
      defaults: {
        time: 1000,
        iterations: 10,
        warmup: 5,
        collectMemory: false,
      },
      thresholds: {},
      git: {
        enabled: true,
        trackCommit: true,
        trackBranch: true,
      },
    }

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8')
    console.log('✅ 配置文件已创建: benchmark.config.json')

    // 创建示例文件
    const examplesDir = path.join(process.cwd(), 'benchmarks')
    if (!existsSync(examplesDir)) {
      mkdirSync(examplesDir, { recursive: true })

      const exampleContent = `/**
 * 示例基准测试文件
 * 运行: npx ldbench run
 */
import { createBenchmark, createRunner } from '@ldesign/benchmark'

export default async function (runner) {
  const bench = createBenchmark('示例测试')

  bench.add('数组操作 - push', () => {
    const arr = []
    for (let i = 0; i < 1000; i++) {
      arr.push(i)
    }
  })

  bench.add('数组操作 - spread', () => {
    let arr = []
    for (let i = 0; i < 100; i++) {
      arr = [...arr, i]
    }
  })

  runner.addSuite('示例测试', bench)
}
`
      writeFileSync(path.join(examplesDir, 'example.bench.ts'), exampleContent, 'utf-8')
      console.log('✅ 示例文件已创建: benchmarks/example.bench.ts')
    }

    // 添加 .gitignore 条目
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    const gitignoreEntries = '\n# Benchmark\n.benchmark-history/\nbenchmark-reports/\n'

    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8')
      if (!content.includes('.benchmark-history')) {
        const fs = await import('node:fs/promises')
        await fs.appendFile(gitignorePath, gitignoreEntries)
        console.log('✅ 已更新 .gitignore')
      }
    }

    console.log('\n🎉 初始化完成！')
    console.log('📝 运行 npx ldbench run 开始基准测试')
  })

// 添加 clean 命令
cli
  .command('clean', '清理历史记录和报告')
  .option('--history', '仅清理历史记录')
  .option('--reports', '仅清理报告')
  .option('--all', '清理所有')
  .option('--older-than <days>', '清理 N 天前的记录', { default: 0 })
  .action(async (options: { history?: boolean; reports?: boolean; all?: boolean; olderThan?: number }) => {
    const config = loadConfig()
    const historyDir = path.resolve(process.cwd(), config.historyDir || '.benchmark-history')
    const reportsDir = path.resolve(process.cwd(), config.outputDir || 'benchmark-reports')

    let cleaned = 0
    const olderThanMs = (options.olderThan || 0) * 24 * 60 * 60 * 1000
    const now = Date.now()

    const cleanDir = (dir: string) => {
      if (!existsSync(dir)) return 0
      let count = 0
      const files = readdirSync(dir)

      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = statSync(filePath)

        if (olderThanMs > 0) {
          if (now - stat.mtimeMs > olderThanMs) {
            unlinkSync(filePath)
            count++
          }
        } else {
          unlinkSync(filePath)
          count++
        }
      }
      return count
    }

    if (options.all || options.history || (!options.history && !options.reports)) {
      cleaned += cleanDir(historyDir)
    }

    if (options.all || options.reports) {
      cleaned += cleanDir(reportsDir)
    }

    console.log(`🧹 已清理 ${cleaned} 个文件`)
  })

// 添加 export 命令
cli
  .command('export <source>', '导出历史记录为不同格式')
  .option('--format <format>', '导出格式 (json, csv, markdown, html)', { default: 'json' })
  .option('--out <file>', '输出文件路径')
  .option('--merge', '合并所有历史记录')
  .action(async (source: string, options: { format: string; out?: string; merge?: boolean }) => {
    const config = loadConfig()
    const historyDir = path.resolve(process.cwd(), config.historyDir || '.benchmark-history')
    const reporter = new BenchmarkReporter()

    let reports: any[] = []

    if (source === 'history' || source === 'all') {
      if (!existsSync(historyDir)) {
        console.error('❌ 历史记录目录不存在')
        process.exit(1)
      }

      const files = readdirSync(historyDir).filter((f: string) => f.endsWith('.json'))

      for (const file of files) {
        const content = readFileSync(path.join(historyDir, file), 'utf-8')
        reports.push(JSON.parse(content))
      }
    } else {
      // 单个文件
      if (!existsSync(source)) {
        console.error(`❌ 文件不存在: ${source}`)
        process.exit(1)
      }
      const content = readFileSync(source, 'utf-8')
      reports.push(JSON.parse(content))
    }

    if (reports.length === 0) {
      console.log('⚠️  没有找到历史记录')
      return
    }

    // 合并所有结果
    const allResults = reports.flatMap(r =>
      r.suites?.flatMap((s: any) => s.results) || []
    )

    let output: string
    const suiteName = options.merge ? 'Merged Results' : reports[0]?.name || 'Benchmark Report'

    switch (options.format) {
      case 'csv':
        output = reporter.generateCSV(allResults, suiteName)
        break
      case 'markdown':
        output = reporter.generateMarkdown(allResults, suiteName)
        break
      case 'html':
        output = reporter.generateHTML(allResults, suiteName)
        break
      default:
        output = JSON.stringify(options.merge ? { results: allResults } : reports, null, 2)
    }

    if (options.out) {
      writeFileSync(options.out, output, 'utf-8')
      console.log(`✅ 已导出到: ${options.out}`)
    } else {
      console.log(output)
    }
  })

// 添加 compare 命令
cli
  .command('compare <baseline> <current>', '比较两个基准测试报告')
  .option('--format <format>', '输出格式 (console, json, markdown)', { default: 'console' })
  .option('--threshold <percent>', '回归阈值百分比', { default: 5 })
  .action(async (baseline: string, current: string, options: { format: string; threshold: number }) => {
    if (!existsSync(baseline)) {
      console.error(`❌ 基线文件不存在: ${baseline}`)
      process.exit(1)
    }
    if (!existsSync(current)) {
      console.error(`❌ 当前文件不存在: ${current}`)
      process.exit(1)
    }

    const baselineReport = JSON.parse(readFileSync(baseline, 'utf-8'))
    const currentReport = JSON.parse(readFileSync(current, 'utf-8'))

    const comparison = compareReports(baselineReport, currentReport)

    const regressions = comparison.filter(c => c.improvement < -options.threshold)
    const improvements = comparison.filter(c => c.improvement > options.threshold)

    if (options.format === 'json') {
      console.log(JSON.stringify({ comparison, regressions, improvements }, null, 2))
    } else if (options.format === 'markdown') {
      let md = '# 性能对比报告\n\n'
      md += '| 任务 | 基线 ops/sec | 当前 ops/sec | 变化 |\n'
      md += '|------|-------------|-------------|------|\n'
      comparison.forEach(c => {
        const emoji = c.improvement > 5 ? '📈' : c.improvement < -5 ? '📉' : '➡️'
        md += `| ${c.suite}::${c.task} | ${c.baselineOps?.toFixed(0) || '-'} | ${c.currentOps?.toFixed(0) || '-'} | ${emoji} ${c.improvement.toFixed(1)}% |\n`
      })
      console.log(md)
    } else {
      console.log('\n📊 性能对比报告')
      console.log('='.repeat(80))

      if (regressions.length > 0) {
        console.log('\n⚠️  性能回归:')
        regressions.forEach(r => {
          console.log(`   📉 ${r.suite}::${r.task}: ${r.improvement.toFixed(1)}%`)
        })
      }

      if (improvements.length > 0) {
        console.log('\n✅ 性能提升:')
        improvements.forEach(r => {
          console.log(`   📈 ${r.suite}::${r.task}: +${r.improvement.toFixed(1)}%`)
        })
      }

      const avgChange = comparison.reduce((sum, c) => sum + c.improvement, 0) / comparison.length
      console.log(`\n📈 平均变化: ${avgChange > 0 ? '+' : ''}${avgChange.toFixed(1)}%`)
      console.log('='.repeat(80))

      // 如果有回归，返回非零退出码
      if (regressions.length > 0) {
        process.exit(1)
      }
    }
  })

// 添加 query 命令
cli
  .command('query', '高级历史查询')
  .option('--storage <type>', '存储类型 (json, sqlite)', { default: 'json' })
  .option('--storage-path <path>', '存储路径')
  .option('--from <date>', '开始日期 (YYYY-MM-DD)')
  .option('--to <date>', '结束日期 (YYYY-MM-DD)')
  .option('--suite <name>', '按套件名称过滤 (可多次使用)', { type: [] })
  .option('--tag <tag>', '按标签过滤 (可多次使用)', { type: [] })
  .option('--branch <branch>', '按 Git 分支过滤')
  .option('--order <order>', '排序方向 (asc, desc)', { default: 'desc' })
  .option('--order-by <field>', '排序字段 (date, duration, suiteCount)', { default: 'date' })
  .option('--limit <number>', '限制结果数量', { default: 10 })
  .option('--offset <number>', '跳过前 N 条结果', { default: 0 })
  .option('--format <format>', '输出格式 (console, json, csv)', { default: 'console' })
  .option('--verbose', '显示详细信息')
  .action(async (options: {
    storage: string
    storagePath?: string
    from?: string
    to?: string
    suite?: string[]
    tag?: string[]
    branch?: string
    order: string
    orderBy: string
    limit: number
    offset: number
    format: string
    verbose?: boolean
  }) => {
    try {
      const { createStorage } = await import('./storage.js')

      // 确定存储路径
      const config = loadConfig()
      let storagePath = options.storagePath

      if (!storagePath) {
        if (options.storage === 'sqlite') {
          storagePath = path.join(process.cwd(), config.historyDir || '.benchmark-history', 'benchmark.db')
        } else {
          storagePath = path.join(process.cwd(), config.historyDir || '.benchmark-history')
        }
      }

      // 检查存储是否存在
      if (!existsSync(storagePath)) {
        console.error(`❌ 存储路径不存在: ${storagePath}`)
        console.log('💡 请先运行基准测试并使用 --history 选项保存历史记录')
        process.exit(1)
      }

      // 创建存储实例
      const storage = await createStorage(options.storage as 'json' | 'sqlite', storagePath)

      // 构建查询选项
      const queryOptions: any = {
        orderBy: options.orderBy as 'date' | 'duration' | 'suiteCount',
        order: options.order as 'asc' | 'desc',
        limit: options.limit,
        offset: options.offset,
      }

      // 日期范围
      if (options.from || options.to) {
        queryOptions.dateRange = {
          start: options.from ? new Date(options.from) : new Date(0),
          end: options.to ? new Date(options.to + 'T23:59:59.999Z') : new Date(),
        }
      }

      // 套件过滤
      if (options.suite && options.suite.length > 0) {
        queryOptions.suites = options.suite
      }

      // 标签过滤
      if (options.tag && options.tag.length > 0) {
        queryOptions.tags = options.tag
      }

      // Git 分支过滤
      if (options.branch) {
        queryOptions.branch = options.branch
      }

      if (options.verbose) {
        console.log('🔍 查询选项:', JSON.stringify(queryOptions, null, 2))
      }

      // 执行查询
      const results = await storage.query(queryOptions)
      const totalCount = await storage.count()

      await storage.close()

      if (results.length === 0) {
        console.log('⚠️  没有找到匹配的记录')
        return
      }

      // 输出结果
      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2))
      } else if (options.format === 'csv') {
        // CSV 格式输出
        console.log('id,name,generatedAt,duration,branch,commit,suiteCount,taskCount')
        for (const report of results) {
          const suiteCount = report.suites.length
          const taskCount = report.suites.reduce((sum, s) => sum + s.results.length, 0)
          console.log([
            report.id,
            `"${report.name}"`,
            report.generatedAt,
            report.duration || '',
            report.git?.branch || '',
            report.git?.commit || '',
            suiteCount,
            taskCount,
          ].join(','))
        }
      } else {
        // Console 格式输出
        console.log('\n📊 查询结果')
        console.log('='.repeat(80))
        console.log(`找到 ${results.length} 条记录 (共 ${totalCount} 条)`)
        console.log('')

        for (const report of results) {
          const date = new Date(report.generatedAt).toLocaleString('zh-CN')
          const suiteCount = report.suites.length
          const taskCount = report.suites.reduce((sum, s) => sum + s.results.length, 0)

          console.log(`📅 ${date}`)
          console.log(`   ID: ${report.id}`)
          console.log(`   名称: ${report.name}`)

          if (report.git?.branch || report.git?.commit) {
            const gitInfo = []
            if (report.git.branch) gitInfo.push(`分支: ${report.git.branch}`)
            if (report.git.commit) gitInfo.push(`提交: ${report.git.commit}`)
            if (report.git.dirty) gitInfo.push('(有未提交更改)')
            console.log(`   Git: ${gitInfo.join(', ')}`)
          }

          console.log(`   套件: ${suiteCount} 个, 任务: ${taskCount} 个`)

          if (report.duration) {
            console.log(`   耗时: ${report.duration}ms`)
          }

          if (options.verbose) {
            console.log('   套件详情:')
            for (const suite of report.suites) {
              console.log(`     📦 ${suite.name} (${suite.results.length} 个任务)`)
              for (const result of suite.results) {
                const ops = result.opsPerSecond >= 1000
                  ? `${(result.opsPerSecond / 1000).toFixed(1)}K`
                  : result.opsPerSecond.toFixed(0)
                console.log(`        • ${result.name}: ${ops} ops/sec`)
              }
            }
          }

          console.log('')
        }

        console.log('='.repeat(80))
      }
    } catch (error) {
      console.error('❌ 查询失败:', error)
      process.exit(1)
    }
  })

cli.help()
cli.version(VERSION)
cli.parse()

// 辅助函数：对比报告
function compareReports(baseline: any, current: any): Array<{
  suite: string
  task: string
  improvement: number
  baselineOps: number
  currentOps: number
}> {
  const comparisons: Array<{ suite: string; task: string; improvement: number; baselineOps: number; currentOps: number }> = []

  for (const currentSuite of current.suites) {
    const baselineSuite = baseline.suites.find((s: any) => s.name === currentSuite.name)
    if (!baselineSuite) continue

    for (const currentResult of currentSuite.results) {
      const baselineResult = baselineSuite.results.find((r: any) => r.name === currentResult.name)
      if (!baselineResult) continue

      const improvement = ((currentResult.opsPerSecond - baselineResult.opsPerSecond) / baselineResult.opsPerSecond) * 100
      comparisons.push({
        suite: currentSuite.name,
        task: currentResult.name,
        improvement,
        baselineOps: baselineResult.opsPerSecond,
        currentOps: currentResult.opsPerSecond,
      })
    }
  }

  return comparisons
}
