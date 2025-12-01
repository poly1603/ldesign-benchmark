/**
 * Benchmark 报告生成器
 */

import type { BenchmarkResult, ReporterOptions } from './types'

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
}

/**
 * Benchmark Reporter 类
 * 
 * 负责格式化和输出 benchmark 结果
 */
export class BenchmarkReporter {
  private useColors: boolean

  constructor(options: { colors?: boolean } = {}) {
    this.useColors = options.colors ?? process.stdout?.isTTY ?? true
  }

  /**
   * 应用颜色
   */
  private color(text: string, ...colorCodes: string[]): string {
    if (!this.useColors) return text
    return colorCodes.join('') + text + colors.reset
  }

  /**
   * 打印控制台报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  printConsole(results: BenchmarkResult[], suiteName: string): void {
    console.log(`\n${this.color('📊 ' + suiteName, colors.bold, colors.cyan)}`)
    console.log(this.color('='.repeat(80), colors.dim))

    if (results.length === 0) {
      console.log(this.color('没有测试结果', colors.yellow))
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

      const statusIcon = result.status === 'failed' ? '❌' :
        result.status === 'skipped' ? '⏭️' :
          result.status === 'timeout' ? '⏱️' :
            isFastest ? '🏆' : '  '

      console.log(`\n${statusIcon} ${this.color(result.name, colors.bold)}`)

      if (result.status === 'failed') {
        console.log(this.color(`   错误: ${result.error}`, colors.red))
        return
      }

      console.log(`   ${this.color(this.formatOps(result.opsPerSecond), colors.green)} ops/sec`)
      console.log(`   ${this.color(result.avgTime.toFixed(4) + ' ms/op', colors.blue)} (avg)`)
      console.log(`   ${this.color('±' + result.rme.toFixed(2) + '%', colors.yellow)} (${result.iterations} iterations)`)

      // 显示百分位数
      if (result.percentiles) {
        console.log(`   ${this.color('P50:', colors.dim)} ${result.percentiles.p50.toFixed(4)}ms | ${this.color('P95:', colors.dim)} ${result.percentiles.p95.toFixed(4)}ms | ${this.color('P99:', colors.dim)} ${result.percentiles.p99.toFixed(4)}ms`)
      }

      // 显示内存信息
      if (result.memory) {
        const memDelta = result.memory.delta
        const memColor = memDelta > 0 ? colors.yellow : colors.green
        console.log(`   ${this.color('内存:', colors.dim)} ${this.color(this.formatBytes(memDelta), memColor)}`)
      }

      if (!isFastest) {
        const slowdown = ((fastest.opsPerSecond / result.opsPerSecond - 1) * 100).toFixed(2)
        console.log(`   ${this.color(percentage + '% of fastest', colors.dim)} (${this.color(slowdown + '% slower', colors.red)})`)
      }
    })

    console.log('\n' + this.color('='.repeat(80), colors.dim))
  }

  /**
   * 格式化字节
   */
  private formatBytes(bytes: number): string {
    const sign = bytes >= 0 ? '+' : ''
    const abs = Math.abs(bytes)
    if (abs >= 1024 * 1024) return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`
    if (abs >= 1024) return `${sign}${(bytes / 1024).toFixed(2)} KB`
    return `${sign}${bytes} B`
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
   * 生成 CSV 报告
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  generateCSV(results: BenchmarkResult[], suiteName: string): string {
    const headers = [
      'Suite', 'Task', 'ops/sec', 'avg (ms)', 'min (ms)', 'max (ms)',
      'stdDev', 'RME (%)', 'iterations', 'P50 (ms)', 'P95 (ms)', 'P99 (ms)',
      'Memory Delta (bytes)', 'Status'
    ]

    let csv = headers.join(',') + '\n'

    results.forEach((result) => {
      const row = [
        `"${suiteName}"`,
        `"${result.name}"`,
        result.opsPerSecond.toFixed(2),
        result.avgTime.toFixed(6),
        result.minTime.toFixed(6),
        result.maxTime.toFixed(6),
        result.stdDev.toFixed(6),
        result.rme.toFixed(2),
        result.iterations,
        result.percentiles?.p50.toFixed(6) ?? '',
        result.percentiles?.p95.toFixed(6) ?? '',
        result.percentiles?.p99.toFixed(6) ?? '',
        result.memory?.delta ?? '',
        result.status ?? 'success'
      ]
      csv += row.join(',') + '\n'
    })

    return csv
  }

  /**
   * 生成 HTML 报告 (增强版含图表)
   * 
   * @param results - 测试结果
   * @param suiteName - 套件名称
   */
  generateHTML(results: BenchmarkResult[], suiteName: string): string {
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev,
    )

    // 生成图表数据
    const chartLabels = JSON.stringify(results.map(r => r.name))
    const chartOps = JSON.stringify(results.map(r => r.opsPerSecond))
    const chartTimes = JSON.stringify(results.map(r => r.avgTime))
    const chartColors = results.map(r =>
      r.name === fastest.name ? '#4CAF50' : '#2196F3'
    )

    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${suiteName} - Benchmark Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
      margin: 0; 
      padding: 20px;
      background: #f5f5f5;
      color: #333;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      color: #1a1a1a; 
      border-bottom: 3px solid #4CAF50; 
      padding-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      text-align: center;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: bold;
      color: #4CAF50;
    }
    .summary-card .label {
      color: #666;
      font-size: 14px;
      margin-top: 5px;
    }
    .charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .chart-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    table { 
      border-collapse: collapse; 
      width: 100%; 
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td { 
      padding: 12px 15px; 
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th { 
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.5px;
    }
    tr:hover { background-color: #f8f9fa; }
    .fastest { background-color: #e8f5e9 !important; }
    .ops-bar {
      height: 8px;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 5px;
    }
    .ops-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-success { background: #e8f5e9; color: #2e7d32; }
    .badge-warning { background: #fff3e0; color: #ef6c00; }
    .badge-error { background: #ffebee; color: #c62828; }
    .percentiles {
      font-size: 11px;
      color: #666;
    }
    footer {
      text-align: center;
      color: #999;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 ${suiteName}</h1>
    
    <div class="summary">
      <div class="summary-card">
        <div class="value">${results.length}</div>
        <div class="label">测试任务</div>
      </div>
      <div class="summary-card">
        <div class="value">${this.formatOps(fastest.opsPerSecond)}</div>
        <div class="label">最高 ops/sec</div>
      </div>
      <div class="summary-card">
        <div class="value">${fastest.avgTime.toFixed(2)}ms</div>
        <div class="label">最快平均时间</div>
      </div>
      <div class="summary-card">
        <div class="value">${results.reduce((sum, r) => sum + r.iterations, 0)}</div>
        <div class="label">总迭代次数</div>
      </div>
    </div>

    <div class="charts">
      <div class="chart-container">
        <h3>操作数对比 (ops/sec)</h3>
        <canvas id="opsChart"></canvas>
      </div>
      <div class="chart-container">
        <h3>平均时间对比 (ms)</h3>
        <canvas id="timeChart"></canvas>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>任务</th>
          <th>ops/sec</th>
          <th>平均时间</th>
          <th>百分位数</th>
          <th>误差</th>
          <th>迭代</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
`

    results.forEach((result) => {
      const isFastest = result.name === fastest.name
      const percentage = (result.opsPerSecond / fastest.opsPerSecond * 100).toFixed(0)
      const statusClass = result.status === 'failed' ? 'badge-error' :
        result.status === 'timeout' ? 'badge-warning' : 'badge-success'
      const statusText = result.status === 'failed' ? '失败' :
        result.status === 'timeout' ? '超时' : '成功'

      html += `        <tr class="${isFastest ? 'fastest' : ''}">
          <td>
            ${isFastest ? '🏆 ' : ''}<strong>${result.name}</strong>
            <div class="ops-bar"><div class="ops-bar-fill" style="width: ${percentage}%"></div></div>
          </td>
          <td><strong>${this.formatOps(result.opsPerSecond)}</strong></td>
          <td>${result.avgTime.toFixed(4)} ms</td>
          <td class="percentiles">
            ${result.percentiles ?
          `P50: ${result.percentiles.p50.toFixed(3)}ms<br>
               P95: ${result.percentiles.p95.toFixed(3)}ms<br>
               P99: ${result.percentiles.p99.toFixed(3)}ms` :
          '-'}
          </td>
          <td>±${result.rme.toFixed(2)}%</td>
          <td>${result.iterations}</td>
          <td><span class="badge ${statusClass}">${statusText}</span></td>
        </tr>
`
    })

    html += `      </tbody>
    </table>

    <footer>
      <p>生成时间: ${new Date().toLocaleString('zh-CN')}</p>
      <p>Powered by @ldesign/benchmark</p>
    </footer>
  </div>

  <script>
    // 操作数图表
    new Chart(document.getElementById('opsChart'), {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [{
          label: 'ops/sec',
          data: ${chartOps},
          backgroundColor: ${JSON.stringify(chartColors)},
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });

    // 时间图表
    new Chart(document.getElementById('timeChart'), {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [{
          label: '平均时间 (ms)',
          data: ${chartTimes},
          backgroundColor: '#FF9800',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  </script>
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

    switch (format) {
      case 'json':
        content = this.generateJSON(results)
        break
      case 'markdown':
        content = this.generateMarkdown(results, suiteName)
        break
      case 'csv':
        content = this.generateCSV(results, suiteName)
        break
      case 'html':
      default:
        content = this.generateHTML(results, suiteName)
        break
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

  /**
   * 格式化时间
   */
  formatTime(ms: number): string {
    if (ms < 0.001) {
      return `${(ms * 1_000_000).toFixed(2)}ns`
    }
    if (ms < 1) {
      return `${(ms * 1000).toFixed(2)}μs`
    }
    if (ms < 1000) {
      return `${ms.toFixed(2)}ms`
    }
    return `${(ms / 1000).toFixed(2)}s`
  }
}

