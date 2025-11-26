#!/usr/bin/env node
import path from 'node:path'
import { cac } from 'cac'
import { createRunner, checkThresholds } from './index'
import type { BenchmarkThresholds } from './types'

const cli = cac('ldbench')

cli
  .command('run [files...]', '运行基准测试文件')
  .option('--pattern <pattern>', '匹配模式 (默认: **/*.bench.{js,ts})')
  .option('--report <format>', '报告格式 (console, json, markdown, html)', {
    default: 'console',
  })
  .option('--out <file>', '输出文件路径')
  .option('--threshold <file>', '阈值配置文件路径')
  .action(async (files: string[], options) => {
    try {
      // 1. 收集基准测试文件
      const patterns = files.length > 0 ? files : [options.pattern || '**/*.bench.{js,ts}']

      // 这里简单模拟，实际可能需要 globby 等工具来查找文件
      // 暂时假设用户传入的是具体文件路径，或由外部 shell 展开
      if (patterns.length === 0) {
        console.error('未找到基准测试文件')
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

      for (const pattern of patterns) {
        // 这里需要处理 glob，暂时只处理直接路径
        const absolutePath = path.resolve(process.cwd(), pattern)
        try {
          // 动态导入
          const mod = await import(absolutePath)
          if (typeof mod.default === 'function') {
            await mod.default(runner)
            console.log(`  Loaded: ${pattern}`)
          } else {
            console.warn(`  ⚠️ Skipped: ${pattern} (没有导出默认函数)`)
          }
        } catch (e) {
          console.error(`  ❌ Failed to load ${pattern}:`, e)
        }
      }

      // 3. 运行所有
      const report = await runner.runAll()
      runner.printSummary(report)

      // 4. 导出报告
      if (options.out) {
        await runner.exportJSON(report, options.out)
      }

      // 5. 阈值检查
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

    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  })

cli.help()
cli.version('0.1.0')
cli.parse()
