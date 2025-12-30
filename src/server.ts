#!/usr/bin/env node

/**
 * Benchmark 可视化服务器
 * 
 * 提供 Web 界面来查看和操作基准测试结果
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
// import { fileURLToPath } from 'node:url'

// const __dirname = fileURLToPath(new URL('.', import.meta.url))

interface ServerOptions {
  port: number
  host: string
  historyDir: string
}

export class BenchmarkServer {
  private server: any
  private options: ServerOptions

  constructor(options: Partial<ServerOptions> = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || 'localhost',
      historyDir: options.historyDir || join(process.cwd(), '.benchmark-history')
    }
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    this.server = createServer(this.handleRequest.bind(this))

    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, (err?: Error) => {
        if (err) {
          reject(err)
        } else {
          console.log(`🚀 Benchmark 服务器已启动`)
          console.log(`📊 访问地址: http://${this.options.host}:${this.options.port}`)
          console.log(`📚 历史记录目录: ${this.options.historyDir}`)
          resolve()
        }
      })
    })
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('👋 Benchmark 服务器已停止')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: any, res: any): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const pathname = url.pathname

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    try {
      if (pathname === '/' || pathname === '/index.html') {
        await this.serveDashboard(req, res)
      } else if (pathname === '/api/history') {
        await this.serveHistoryList(req, res)
      } else if (pathname.startsWith('/api/report/')) {
        await this.serveReport(req, res, pathname)
      } else if (pathname === '/api/compare') {
        await this.serveComparison(req, res)
      } else if (pathname === '/api/status') {
        await this.serveStatus(req, res)
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not Found' }))
      }
    } catch (error) {
      console.error('服务器错误:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal Server Error' }))
    }
  }

  /**
   * 提供仪表板页面
   */
  private async serveDashboard(_req: any, res: any): Promise<void> {
    const dashboardHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LDesign Benchmark Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; }
    .dashboard { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; }
    .sidebar { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    .main-content { background: white; padding: 20px; border-radius: 8px; border: 1px solid #ddd; }
    .loading { text-align: center; padding: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 LDesign Benchmark Dashboard</h1>
      <p>实时性能监控和可视化分析</p>
    </div>
    
    <div class="dashboard">
      <div class="sidebar">
        <h3>📚 历史记录</h3>
        <div id="historyList">
          <div class="loading">加载中...</div>
        </div>
      </div>
      
      <div class="main-content">
        <div id="reportView">
          <div class="loading">
            <h3>选择左侧的历史记录查看详情</h3>
            <p>或者运行 <code>ldbench run --history</code> 生成新的基准测试报告</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    class BenchmarkDashboard {
      constructor() {
        this.currentReport = null
        this.loadHistory()
      }

      async loadHistory() {
        try {
          const response = await fetch('/api/history')
          const history = await response.json()
          this.renderHistory(history)
        } catch (error) {
          console.error('加载历史记录失败:', error)
          document.getElementById('historyList').innerHTML = '<div class="loading">加载失败</div>'
        }
      }

      renderHistory(history) {
        const historyList = document.getElementById('historyList')
        
        if (history.length === 0) {
          historyList.innerHTML = '<div class="loading">暂无历史记录</div>'
          return
        }

        historyList.innerHTML = history.map(item => 
          '<div style="padding: 10px; border-bottom: 1px solid #ddd; cursor: pointer;" onclick="dashboard.selectReport(\'' + item.id + '\')">' +
            '<div style="font-weight: bold;">' + new Date(item.timestamp).toLocaleString('zh-CN') + '</div>' +
            '<div style="color: #666; font-size: 0.9em;">' + item.suites + ' 个套件 • ' + item.totalTasks + ' 个任务</div>' +
          '</div>'
        ).join('')
      }

      async selectReport(reportId) {
        try {
          const response = await fetch('/api/report/' + reportId)
          const report = await response.json()
          this.currentReport = report
          this.renderReport(report)
        } catch (error) {
          console.error('加载报告失败:', error)
        }
      }

      renderReport(report) {
        const reportView = document.getElementById('reportView')
        
        const stats = {
          totalSuites: report.suites.length,
          totalTasks: report.suites.reduce((sum, suite) => sum + suite.results.length, 0)
        }

        reportView.innerHTML = 
          '<div>' +
            '<h2>' + report.name + '</h2>' +
            '<p style="color: #666; margin-bottom: 20px;">生成时间: ' + new Date(report.generatedAt).toLocaleString('zh-CN') + '</p>' +
            '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">' +
              '<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 24px; font-weight: bold;">' + stats.totalSuites + '</div>' +
                '<div style="color: #666;">测试套件</div>' +
              '</div>' +
              '<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 24px; font-weight: bold;">' + stats.totalTasks + '</div>' +
                '<div style="color: #666;">测试任务</div>' +
              '</div>' +
            '</div>' +
            report.suites.map(suite => 
              '<div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #ddd;">' +
                '<h3>' + suite.name + '</h3>' +
                '<div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-top: 10px;">' +
                  '<div style="font-weight: bold;">任务名称</div>' +
                  '<div style="font-weight: bold;">操作/秒</div>' +
                  '<div style="font-weight: bold;">平均时间</div>' +
                  '<div style="font-weight: bold;">误差</div>' +
                  suite.results.map(result => 
                    '<div>' + result.name + '</div>' +
                    '<div>' + this.formatOps(result.opsPerSecond) + '</div>' +
                    '<div>' + result.avgTime.toFixed(4) + 'ms</div>' +
                    '<div>±' + result.rme.toFixed(2) + '%</div>'
                  ).join('') +
                '</div>' +
              '</div>'
            ).join('') +
          '</div>'
      }

      formatOps(ops) {
        if (ops >= 1000000) return (ops / 1000000).toFixed(1) + 'M'
        if (ops >= 1000) return (ops / 1000).toFixed(1) + 'K'
        return ops.toFixed(0)
      }
    }

    const dashboard = new BenchmarkDashboard()
    window.dashboard = dashboard
  </script>
</body>
</html>`

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHTML)
  }

  /**
   * 提供历史记录列表
   */
  private async serveHistoryList(_req: any, res: any): Promise<void> {
    const historyDir = this.options.historyDir

    if (!existsSync(historyDir)) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
      return
    }

    const files = readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 50) // 限制返回数量

    const historyList = files.map(file => {
      const filePath = join(historyDir, file)
      const content = readFileSync(filePath, 'utf-8')
      const report = JSON.parse(content)

      return {
        id: file.replace('.json', ''),
        name: report.name,
        timestamp: report.generatedAt,
        suites: report.suites.length,
        totalTasks: report.suites.reduce((sum: number, s: any) => sum + s.results.length, 0)
      }
    })

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(historyList))
  }

  /**
   * 提供具体报告
   */
  private async serveReport(_req: any, res: any, pathname: string): Promise<void> {
    const reportId = pathname.split('/').pop()?.replace('.json', '')

    if (!reportId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid report ID' }))
      return
    }

    const reportPath = join(this.options.historyDir, `${reportId}.json`)

    if (!existsSync(reportPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Report not found' }))
      return
    }

    const content = readFileSync(reportPath, 'utf-8')
    const report = JSON.parse(content)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(report))
  }

  /**
   * 提供对比数据
   */
  private async serveComparison(req: any, res: any): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const baselineId = url.searchParams.get('baseline')
    const currentId = url.searchParams.get('current')

    if (!baselineId || !currentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing baseline or current parameter' }))
      return
    }

    const baselinePath = join(this.options.historyDir, `${baselineId}.json`)
    const currentPath = join(this.options.historyDir, `${currentId}.json`)

    if (!existsSync(baselinePath) || !existsSync(currentPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'One or both reports not found' }))
      return
    }

    const baselineContent = readFileSync(baselinePath, 'utf-8')
    const currentContent = readFileSync(currentPath, 'utf-8')

    const baselineReport = JSON.parse(baselineContent)
    const currentReport = JSON.parse(currentContent)

    const comparison = this.compareReports(baselineReport, currentReport)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(comparison))
  }

  /**
   * 提供服务器状态
   */
  private async serveStatus(_req: any, res: any): Promise<void> {
    const status = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      historyCount: this.getHistoryCount()
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(status))
  }

  /**
   * 对比两个报告
   */
  private compareReports(baseline: any, current: any): any {
    const comparisons: any[] = []

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
          baselineOps: baselineResult.opsPerSecond,
          currentOps: currentResult.opsPerSecond,
          improvement,
          isRegression: improvement < -5, // 性能下降超过 5%
          isImprovement: improvement > 5   // 性能提升超过 5%
        })
      }
    }

    return {
      baseline: baseline.generatedAt,
      current: current.generatedAt,
      comparisons,
      summary: {
        totalComparisons: comparisons.length,
        improvements: comparisons.filter(c => c.isImprovement).length,
        regressions: comparisons.filter(c => c.isRegression).length,
        avgImprovement: comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length
      }
    }
  }

  /**
   * 获取历史记录数量
   */
  private getHistoryCount(): number {
    const historyDir = this.options.historyDir
    if (!existsSync(historyDir)) return 0

    const files = readdirSync(historyDir)
    return files.filter(f => f.endsWith('.json')).length
  }
}

// CLI 启动入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost'
  }

  const server = new BenchmarkServer(options)

  server.start().catch(console.error)

  // 优雅关闭
  process.on('SIGINT', async () => {
    console.log('\n👋 正在关闭服务器...')
    await server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await server.stop()
    process.exit(0)
  })
}

export default BenchmarkServer
