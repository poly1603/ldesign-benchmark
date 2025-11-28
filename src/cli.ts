#!/usr/bin/env node
import path from 'node:path'
import { cac } from 'cac'
import { createRunner, checkThresholds } from './index'
import type { BenchmarkThresholds } from './types'
import { globby } from 'globby'
import { readFileSync } from 'node:fs'
import { watch } from 'chokidar'
import { performance } from 'node:perf_hooks'

const cli = cac('ldbench')

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

cli.help()
cli.version('0.1.0')
cli.parse()

// 辅助函数：对比报告
function compareReports(baseline: any, current: any): Array<{
  suite: string
  task: string
  improvement: number
}> {
  const comparisons: Array<{ suite: string; task: string; improvement: number }> = []

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
        improvement
      })
    }
  }

  return comparisons
}
