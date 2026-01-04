#!/usr/bin/env node

/**
 * Benchmark 可视化服务器
 * 
 * 提供 Web 界面来查看和操作基准测试结果
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import path from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import type { BenchmarkResult, ProgressInfo } from './types.js'

interface ServerOptions {
  port: number
  host: string
  historyDir: string
  enableWebSocket?: boolean
}

/**
 * WebSocket 消息类型
 */
export interface WSMessage {
  type: 'progress' | 'result' | 'error' | 'status' | 'complete'
  payload: unknown
}

export interface ProgressMessage extends WSMessage {
  type: 'progress'
  payload: ProgressInfo
}

export interface ResultMessage extends WSMessage {
  type: 'result'
  payload: {
    suite: string
    result: BenchmarkResult
  }
}

export interface CompleteMessage extends WSMessage {
  type: 'complete'
  payload: {
    suite: string
    results: BenchmarkResult[]
  }
}

export class BenchmarkServer {
  private server: any
  private wss: WebSocketServer | null = null
  private wsClients: Set<WebSocket> = new Set()
  private options: ServerOptions

  constructor(options: Partial<ServerOptions> = {}) {
    this.options = {
      port: options.port || 3000,
      host: options.host || 'localhost',
      historyDir: options.historyDir || join(process.cwd(), '.benchmark-history'),
      enableWebSocket: options.enableWebSocket !== false
    }
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    this.server = createServer(this.handleRequest.bind(this))

    // 初始化 WebSocket 服务器
    if (this.options.enableWebSocket) {
      this.wss = new WebSocketServer({ server: this.server })
      this.setupWebSocket()
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, (err?: Error) => {
        if (err) {
          reject(err)
        } else {
          console.log(`🚀 Benchmark 服务器已启动`)
          console.log(`📊 访问地址: http://${this.options.host}:${this.options.port}`)
          console.log(`📚 历史记录目录: ${this.options.historyDir}`)
          if (this.options.enableWebSocket) {
            console.log(`🔌 WebSocket 已启用 (实时推送)`)
          }
          resolve()
        }
      })
    })
  }

  /**
   * 设置 WebSocket 服务器
   */
  private setupWebSocket(): void {
    if (!this.wss) return

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('📡 新的 WebSocket 连接')
      this.wsClients.add(ws)

      // 发送欢迎消息
      this.sendToClient(ws, {
        type: 'status',
        payload: {
          message: 'Connected to Benchmark Server',
          timestamp: new Date().toISOString(),
          clientCount: this.wsClients.size
        }
      })

      ws.on('close', () => {
        console.log('📡 WebSocket 连接关闭')
        this.wsClients.delete(ws)
      })

      ws.on('error', (error) => {
        console.error('WebSocket 错误:', error)
        this.wsClients.delete(ws)
      })
    })
  }

  /**
   * 发送消息给单个客户端
   */
  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * 广播进度更新
   */
  broadcastProgress(progress: ProgressInfo): void {
    const message: ProgressMessage = {
      type: 'progress',
      payload: progress
    }
    this.broadcast(message)
  }

  /**
   * 广播结果
   */
  broadcastResult(suite: string, result: BenchmarkResult): void {
    const message: ResultMessage = {
      type: 'result',
      payload: { suite, result }
    }
    this.broadcast(message)
  }

  /**
   * 广播套件完成
   */
  broadcastComplete(suite: string, results: BenchmarkResult[]): void {
    const message: CompleteMessage = {
      type: 'complete',
      payload: { suite, results }
    }
    this.broadcast(message)
  }

  /**
   * 广播消息给所有客户端
   */
  private broadcast(message: WSMessage): void {
    const data = JSON.stringify(message)
    this.wsClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // 关闭所有 WebSocket 连接
    if (this.wss) {
      this.wsClients.forEach(ws => {
        ws.close()
      })
      this.wss.close()
    }

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
      } else if (pathname.startsWith('/api/trend/')) {
        await this.serveTrendData(req, res, pathname)
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
    const dashboardHTML = this.getDashboardHTML()
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(dashboardHTML)
  }

  /**
   * 获取仪表板 HTML
   */
  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LDesign Benchmark Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .status-bar { background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center; }
    .status-indicator { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
    .status-indicator.connected { background: #4caf50; animation: pulse 2s infinite; }
    .status-indicator.disconnected { background: #f44336; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .dashboard { display: grid; grid-template-columns: 1fr 2fr; gap: 20px; }
    .sidebar { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-height: 600px; overflow-y: auto; }
    .main-content { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .loading { text-align: center; padding: 40px; color: #666; }
    .live-indicator { background: #ff5722; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; animation: blink 1.5s infinite; }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .history-item { padding: 10px; border-bottom: 1px solid #ddd; cursor: pointer; transition: background 0.2s; }
    .history-item:hover { background: #f5f5f5; }
    .history-item.active { background: #e3f2fd; border-left: 3px solid #2196f3; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 LDesign Benchmark Dashboard</h1>
      <p>实时性能监控和可视化分析 (Enhanced with WebSocket)</p>
    </div>
    
    <div class="status-bar">
      <div>
        <span class="status-indicator disconnected" id="wsStatus"></span>
        <span id="wsStatusText">连接中...</span>
      </div>
      <div id="liveProgress" style="display: none;">
        <span class="live-indicator">🔴 LIVE</span>
        <span id="progressText" style="margin-left: 10px;"></span>
      </div>
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
            <p style="margin-top: 20px; color: #666;">
              <strong>新功能:</strong><br>
              • WebSocket 实时推送<br>
              • 趋势数据 API: /api/trend/{suite}/{task}<br>
              • 多报告对比 API: /api/compare?reports=id1,id2,id3
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    class BenchmarkDashboard {
      constructor() {
        this.currentReport = null
        this.ws = null
        this.connectWebSocket()
        this.loadHistory()
      }

      connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = protocol + '//' + window.location.host
        
        try {
          this.ws = new WebSocket(wsUrl)
          
          this.ws.onopen = () => {
            console.log('WebSocket connected')
            document.getElementById('wsStatus').className = 'status-indicator connected'
            document.getElementById('wsStatusText').textContent = 'WebSocket 已连接'
          }
          
          this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data)
            this.handleWebSocketMessage(message)
          }
          
          this.ws.onclose = () => {
            document.getElementById('wsStatus').className = 'status-indicator disconnected'
            document.getElementById('wsStatusText').textContent = 'WebSocket 已断开'
          }
        } catch (error) {
          console.error('WebSocket connection failed:', error)
        }
      }

      handleWebSocketMessage(message) {
        if (message.type === 'progress') {
          const p = message.payload
          document.getElementById('liveProgress').style.display = 'block'
          document.getElementById('progressText').textContent = 
            p.suite + ' - ' + p.task + ' (' + p.current + '/' + p.total + ') ' + p.percentage.toFixed(1) + '%'
        } else if (message.type === 'complete') {
          document.getElementById('liveProgress').style.display = 'none'
          this.loadHistory()
        }
      }

      async loadHistory() {
        const response = await fetch('/api/history')
        const history = await response.json()
        this.renderHistory(history)
      }

      renderHistory(history) {
        const html = history.length === 0 ? '<div class="loading">暂无历史记录</div>' :
          history.map(item => {
            return '<div class="history-item" onclick="dashboard.selectReport(\\'' + item.id + '\\')">' +
              '<div style="font-weight: bold;">' + new Date(item.timestamp).toLocaleString('zh-CN') + '</div>' +
              '<div style="color: #666; font-size: 0.9em;">' + item.suites + ' 个套件 • ' + item.totalTasks + ' 个任务</div>' +
            '</div>'
          }).join('')
        document.getElementById('historyList').innerHTML = html
      }

      async selectReport(reportId) {
        document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'))
        event.target.closest('.history-item').classList.add('active')
        
        const response = await fetch('/api/report/' + reportId)
        this.currentReport = await response.json()
        this.renderReport(this.currentReport)
      }

      renderReport(report) {
        const stats = {
          totalSuites: report.suites.length,
          totalTasks: report.suites.reduce((sum, suite) => sum + suite.results.length, 0)
        }
        let html = '<h2>' + report.name + '</h2>' +
          '<p style="color: #666;">生成时间: ' + new Date(report.generatedAt).toLocaleString('zh-CN') + '</p>' +
          '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0;">' +
            '<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center;">' +
              '<div style="font-size: 24px; font-weight: bold;">' + stats.totalSuites + '</div>' +
              '<div style="color: #666;">测试套件</div>' +
            '</div>' +
            '<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center;">' +
              '<div style="font-size: 24px; font-weight: bold;">' + stats.totalTasks + '</div>' +
              '<div style="color: #666;">测试任务</div>' +
            '</div>' +
          '</div>'
        
        report.suites.forEach(suite => {
          html += '<div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">' +
            '<h3>' + suite.name + '</h3>' +
            '<div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-top: 10px;">' +
              '<div style="font-weight: bold;">任务名称</div>' +
              '<div style="font-weight: bold;">操作/秒</div>' +
              '<div style="font-weight: bold;">平均时间</div>' +
              '<div style="font-weight: bold;">误差</div>'
          
          suite.results.forEach(r => {
            html += '<div>' + r.name + '</div>' +
              '<div>' + this.formatOps(r.opsPerSecond) + '</div>' +
              '<div>' + r.avgTime.toFixed(4) + 'ms</div>' +
              '<div>±' + r.rme.toFixed(2) + '%</div>'
          })
          
          html += '</div></div>'
        })
        
        document.getElementById('reportView').innerHTML = html
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
    const reportIds = url.searchParams.get('reports')?.split(',') || []

    // 支持旧的 baseline/current 参数
    const baselineId = url.searchParams.get('baseline')
    const currentId = url.searchParams.get('current')

    if (baselineId && currentId) {
      // 旧的双报告对比
      return this.serveTwoReportComparison(baselineId, currentId, res)
    }

    if (reportIds.length < 2) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'At least 2 report IDs required. Use ?reports=id1,id2,id3' }))
      return
    }

    try {
      const comparison = await this.getComparisonData(reportIds)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(comparison))
    } catch (error) {
      console.error('对比报告失败:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to compare reports' }))
    }
  }

  /**
   * 旧的双报告对比（向后兼容）
   */
  private async serveTwoReportComparison(baselineId: string, currentId: string, res: any): Promise<void> {
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
   * 获取多报告对比数据
   */
  async getComparisonData(reportIds: string[]): Promise<any> {
    const reports: any[] = []

    // 加载所有报告
    for (const reportId of reportIds) {
      const reportPath = join(this.options.historyDir, `${reportId}.json`)
      if (!existsSync(reportPath)) {
        throw new Error(`Report not found: ${reportId}`)
      }

      const content = readFileSync(reportPath, 'utf-8')
      const report = JSON.parse(content)
      reports.push({
        id: reportId,
        name: report.name,
        generatedAt: report.generatedAt,
        report
      })
    }

    // 收集所有唯一的套件和任务
    const taskMap = new Map<string, Map<string, any[]>>()

    for (const { id, report } of reports) {
      for (const suite of report.suites || []) {
        if (!taskMap.has(suite.name)) {
          taskMap.set(suite.name, new Map())
        }

        const suiteMap = taskMap.get(suite.name)!

        for (const result of suite.results || []) {
          if (!suiteMap.has(result.name)) {
            suiteMap.set(result.name, [])
          }

          suiteMap.get(result.name)!.push({
            reportId: id,
            opsPerSecond: result.opsPerSecond,
            avgTime: result.avgTime,
            minTime: result.minTime,
            maxTime: result.maxTime,
            rme: result.rme
          })
        }
      }
    }

    // 构建对比数据
    const comparisons: any[] = []

    for (const [suiteName, suiteMap] of taskMap.entries()) {
      for (const [taskName, values] of suiteMap.entries()) {
        if (values.length < 2) continue // 至少需要2个报告才能对比

        // 计算趋势
        const firstOps = values[0].opsPerSecond
        const lastOps = values[values.length - 1].opsPerSecond
        const improvement = ((lastOps - firstOps) / firstOps) * 100

        comparisons.push({
          suite: suiteName,
          task: taskName,
          values,
          trend: improvement > 5 ? 'improving' : improvement < -5 ? 'degrading' : 'stable',
          improvement,
          avgOpsPerSecond: values.reduce((sum, v) => sum + v.opsPerSecond, 0) / values.length,
          avgTime: values.reduce((sum, v) => sum + v.avgTime, 0) / values.length
        })
      }
    }

    // 计算汇总统计
    const improvements = comparisons.filter(c => c.trend === 'improving').length
    const regressions = comparisons.filter(c => c.trend === 'degrading').length
    const stable = comparisons.filter(c => c.trend === 'stable').length
    const avgChange = comparisons.reduce((sum, c) => sum + c.improvement, 0) / comparisons.length || 0

    return {
      reports: reports.map(r => ({
        id: r.id,
        name: r.name,
        generatedAt: r.generatedAt
      })),
      comparisons,
      summary: {
        totalComparisons: comparisons.length,
        improvements,
        regressions,
        stable,
        avgChange
      }
    }
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
   * 获取历史记录数量
   */
  private getHistoryCount(): number {
    const historyDir = this.options.historyDir
    if (!existsSync(historyDir)) return 0

    return readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .length
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
   * 提供趋势数据 API
   */
  private async serveTrendData(req: any, res: any, pathname: string): Promise<void> {
    // 解析路径: /api/trend/{suiteName}/{taskName}
    const parts = pathname.split('/').filter(Boolean)
    if (parts.length < 4) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid trend API path. Expected: /api/trend/{suiteName}/{taskName}' }))
      return
    }

    const suiteName = decodeURIComponent(parts[2])
    const taskName = decodeURIComponent(parts[3])

    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const range = url.searchParams.get('range') || 'month' // week, month, quarter, year
    const points = parseInt(url.searchParams.get('points') || '30')

    try {
      const trendData = await this.getTrendData(suiteName, taskName, { range, points })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(trendData))
    } catch (error) {
      console.error('获取趋势数据失败:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to get trend data' }))
    }
  }

  /**
   * 获取趋势数据
   */
  async getTrendData(
    suiteName: string,
    taskName: string,
    options?: { range?: string; points?: number }
  ): Promise<any> {
    const historyDir = this.options.historyDir

    if (!existsSync(historyDir)) {
      return {
        task: taskName,
        suite: suiteName,
        dataPoints: [],
        trend: 'stable',
        changeRate: 0
      }
    }

    // 计算时间范围
    const now = new Date()
    const rangeMap: Record<string, number> = {
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      quarter: 90 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    }
    const rangeMs = rangeMap[options?.range || 'month'] || rangeMap.month
    const startDate = new Date(now.getTime() - rangeMs)

    // 读取所有历史文件
    const files = readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()

    const dataPoints: any[] = []

    for (const file of files) {
      try {
        const filePath = path.join(historyDir, file)
        const content = readFileSync(filePath, 'utf-8')
        const report = JSON.parse(content)

        const reportDate = new Date(report.generatedAt)
        if (reportDate < startDate) continue

        // 查找匹配的套件和任务
        const suite = report.suites?.find((s: any) => s.name === suiteName)
        if (!suite) continue

        const result = suite.results?.find((r: any) => r.name === taskName)
        if (!result) continue

        dataPoints.push({
          timestamp: reportDate.getTime(),
          date: report.generatedAt,
          opsPerSecond: result.opsPerSecond,
          avgTime: result.avgTime,
          minTime: result.minTime,
          maxTime: result.maxTime,
          rme: result.rme,
          commitHash: report.environment?.gitCommit,
          branch: report.environment?.gitBranch
        })

        // 限制数据点数量
        if (dataPoints.length >= (options?.points || 30)) {
          break
        }
      } catch (error) {
        console.error(`解析文件 ${file} 失败:`, error)
      }
    }

    // 反转数据点，使其按时间正序排列
    dataPoints.reverse()

    // 计算趋势
    const trend = this.calculateTrend(dataPoints)
    const changeRate = this.calculateChangeRate(dataPoints)

    return {
      task: taskName,
      suite: suiteName,
      dataPoints,
      trend,
      changeRate,
      summary: {
        totalPoints: dataPoints.length,
        avgOpsPerSecond: dataPoints.reduce((sum, p) => sum + p.opsPerSecond, 0) / dataPoints.length || 0,
        avgTime: dataPoints.reduce((sum, p) => sum + p.avgTime, 0) / dataPoints.length || 0,
        range: options?.range || 'month'
      }
    }
  }

  /**
   * 计算趋势方向
   */
  private calculateTrend(dataPoints: any[]): 'improving' | 'stable' | 'degrading' {
    if (dataPoints.length < 2) return 'stable'

    const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2))
    const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2))

    const firstAvg = firstHalf.reduce((sum, p) => sum + p.opsPerSecond, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, p) => sum + p.opsPerSecond, 0) / secondHalf.length

    const change = ((secondAvg - firstAvg) / firstAvg) * 100

    if (change > 5) return 'improving'
    if (change < -5) return 'degrading'
    return 'stable'
  }

  /**
   * 计算变化率（百分比/周）
   */
  private calculateChangeRate(dataPoints: any[]): number {
    if (dataPoints.length < 2) return 0

    const first = dataPoints[0]
    const last = dataPoints[dataPoints.length - 1]

    const timeDiff = last.timestamp - first.timestamp
    const weeks = timeDiff / (7 * 24 * 60 * 60 * 1000)

    if (weeks === 0) return 0

    const opsChange = ((last.opsPerSecond - first.opsPerSecond) / first.opsPerSecond) * 100

    return opsChange / weeks
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
