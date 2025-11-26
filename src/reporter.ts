/**
 * Benchmark 报告生成器
 */

import type { BenchmarkResult, ReporterOptions } from './types'

/**
 * Benchmark Reporter 类
 * 
 * 负责格式化和输出 benchmark 结果
 */
export class BenchmarkReporter {
  /**
   * 打印控制台报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  printConsole(results: BenchmarkResult[], suiteName: string): void {
    console.log(`\n📊 ${suiteName}`)
    console.log('='.repeat(80))

    if (results.length === 0) {
      console.log('没有测试结果')
      return
    }

    // 找出最快的任务
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev,
    )

    // 打印每个任务的结果
    results.forEach((result) => {
      const isFastest = result.name === fastest.name
      const percentage = ((result.opsPerSecond / fastest.opsPerSecond) * 100).toFixed(2)

      console.log(`\n${isFastest ? '🏆' : '  '} ${result.name}`)
      console.log(`   ${this.formatOps(result.opsPerSecond)} ops/sec`)
      console.log(`   ${result.avgTime.toFixed(4)} ms/op (avg)`)
      console.log(`   ±${result.rme.toFixed(2)}% (${result.iterations} iterations)`)

      if (!isFastest) {
        const slowdown = ((fastest.opsPerSecond / result.opsPerSecond - 1) * 100).toFixed(2)
        console.log(`   ${percentage}% of fastest (${slowdown}% slower)`)
      }
    })

    console.log('\n' + '='.repeat(80))
  }

  /**
   * 生成 JSON 报告
   *
   * @param results - 测试结果
   */
  generateJSON(results: BenchmarkResult[]): string {
    return JSON.stringify(results, null, 2)
  }

  /**
   * 生成 Markdown 报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  generateMarkdown(results: BenchmarkResult[], suiteName: string): string {
    let md = `# ${suiteName}\n\n`
    md += '| 任务 | ops/sec | avg (ms) | min (ms) | max (ms) | ±RME | 迭代次数 |\n'
    md += '|------|---------|----------|----------|----------|------|----------|\n'

    results.forEach((result) => {
      md += `| ${result.name} `
      md += `| ${this.formatOps(result.opsPerSecond)} `
      md += `| ${result.avgTime.toFixed(4)} `
      md += `| ${result.minTime.toFixed(4)} `
      md += `| ${result.maxTime.toFixed(4)} `
      md += `| ±${result.rme.toFixed(2)}% `
      md += `| ${result.iterations} |\n`
    })

    return md
  }

  /**
   * 生成 HTML 报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  generateHTML(results: BenchmarkResult[], suiteName: string): string {
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${suiteName} - Benchmark Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .fastest { background-color: #ffffcc; }
  </style>
</head>
<body>
  <h1>📊 ${suiteName}</h1>
  <table>
    <tr>
      <th>任务</th>
      <th>ops/sec</th>
      <th>avg (ms)</th>
      <th>min (ms)</th>
      <th>max (ms)</th>
      <th>±RME</th>
      <th>迭代次数</th>
    </tr>
`

    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev,
    )

    results.forEach((result) => {
      const isFastest = result.name === fastest.name
      html += `    <tr${isFastest ? ' class="fastest"' : ''}>
      <td>${isFastest ? '🏆 ' : ''}${result.name}</td>
      <td>${this.formatOps(result.opsPerSecond)}</td>
      <td>${result.avgTime.toFixed(4)}</td>
      <td>${result.minTime.toFixed(4)}</td>
      <td>${result.maxTime.toFixed(4)}</td>
      <td>±${result.rme.toFixed(2)}%</td>
      <td>${result.iterations}</td>
    </tr>
`
    })

    html += `  </table>
  <p>生成时间: ${new Date().toLocaleString()}</p>
</body>
</html>`

    return html
  }

  /**
   * 根据 ReporterOptions 输出或导出报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   * @param options - Reporter 选项
   */
  async report(
    results: BenchmarkResult[],
    suiteName: string,
    options: ReporterOptions = {},
  ): Promise<void> {
    const format = options.format ?? 'console'

    if (format === 'console') {
      this.printConsole(results, suiteName)
      return
    }

    let content: string

    if (format === 'json') {
      content = this.generateJSON(results)
    } else if (format === 'markdown') {
      content = this.generateMarkdown(results, suiteName)
    } else {
      content = this.generateHTML(results, suiteName)
    }

    if (options.output) {
      const fs = await import('node:fs/promises')
      await fs.writeFile(options.output, content, 'utf-8')

      if (options.verbose) {
        console.log(`\n✅ Benchmark 报告已导出: ${options.output}`)
      }
    } else {
      // 未指定输出文件时，直接打印内容
      console.log(content)
    }
  }

  /**
   * 格式化 ops/sec 数字
   */
  private formatOps(ops: number): string {
    if (ops >= 1_000_000) {
      return `${(ops / 1_000_000).toFixed(2)}M`
    }
    if (ops >= 1_000) {
      return `${(ops / 1_000).toFixed(2)}K`
    }
    return ops.toFixed(2)
  }
}

