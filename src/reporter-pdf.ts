/**
 * PDF 报告生成器
 * 
 * 使用 pdfkit 生成包含图表和表格的 PDF 报告
 */

import PDFDocument from 'pdfkit'
import type { BenchmarkResult } from './types'

/**
 * PDF 报告选项
 */
export interface PDFReportOptions {
  /** 页面大小 */
  pageSize?: 'A4' | 'Letter'
  /** 是否包含图表 */
  includeCharts?: boolean
  /** 是否包含详细统计 */
  includeDetailedStats?: boolean
  /** 自定义页眉 */
  header?: string
  /** 自定义页脚 */
  footer?: string
  /** 语言 */
  locale?: 'zh-CN' | 'en-US'
}

/**
 * PDF 报告生成器类
 */
export class PDFReporter {
  /**
   * 生成 PDF 报告
   * 
   * @param results - 基准测试结果
   * @param suiteName - 套件名称
   * @param options - PDF 选项
   * @returns PDF Buffer
   */
  async generate(
    results: BenchmarkResult[],
    suiteName: string,
    options: PDFReportOptions = {}
  ): Promise<Buffer> {
    const {
      pageSize = 'A4',
      includeCharts = true,
      includeDetailedStats = true,
      header,
      footer,
      locale = 'zh-CN',
    } = options

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const doc = new PDFDocument({
        size: pageSize,
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      })

      // 收集数据块
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])))
      doc.on('error', reject)

      try {
        // 标题
        doc.fontSize(24)
          .fillColor('#4CAF50')
          .text(suiteName, { align: 'center' })
          .moveDown()

        // 自定义页眉
        if (header) {
          doc.fontSize(12)
            .fillColor('#666')
            .text(header, { align: 'center' })
            .moveDown()
        }

        // 生成时间
        doc.fontSize(10)
          .fillColor('#999')
          .text(
            locale === 'zh-CN'
              ? `生成时间: ${new Date().toLocaleString('zh-CN')}`
              : `Generated: ${new Date().toLocaleString('en-US')}`,
            { align: 'center' }
          )
          .moveDown(2)

        // 摘要统计
        this.addSummary(doc, results, locale)
        doc.moveDown(2)

        // 详细结果表格
        this.addResultsTable(doc, results, locale, includeDetailedStats)

        // 图表（简化版 - 使用文本表示）
        if (includeCharts) {
          doc.addPage()
          this.addCharts(doc, results, locale)
        }

        // 自定义页脚
        if (footer) {
          doc.fontSize(10)
            .fillColor('#999')
            .text(footer, 50, doc.page.height - 50, {
              align: 'center',
              width: doc.page.width - 100,
            })
        }

        // 完成
        doc.end()
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 添加摘要统计
   */
  private addSummary(
    doc: PDFKit.PDFDocument,
    results: BenchmarkResult[],
    locale: string
  ): void {
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )
    const totalIterations = results.reduce((sum, r) => sum + r.iterations, 0)

    doc.fontSize(16)
      .fillColor('#333')
      .text(locale === 'zh-CN' ? '摘要统计' : 'Summary Statistics', {
        underline: true,
      })
      .moveDown()

    doc.fontSize(12).fillColor('#666')

    const summaryData = [
      [locale === 'zh-CN' ? '测试任务数' : 'Total Tasks', results.length],
      [
        locale === 'zh-CN' ? '最高 ops/sec' : 'Highest ops/sec',
        this.formatOps(fastest.opsPerSecond),
      ],
      [
        locale === 'zh-CN' ? '最快平均时间' : 'Fastest Avg Time',
        `${fastest.avgTime.toFixed(4)} ms`,
      ],
      [locale === 'zh-CN' ? '总迭代次数' : 'Total Iterations', totalIterations],
    ]

    summaryData.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`)
    })
  }

  /**
   * 添加结果表格
   */
  private addResultsTable(
    doc: PDFKit.PDFDocument,
    results: BenchmarkResult[],
    locale: string,
    includeDetailedStats: boolean
  ): void {
    doc.addPage()
    doc.fontSize(16)
      .fillColor('#333')
      .text(locale === 'zh-CN' ? '详细结果' : 'Detailed Results', {
        underline: true,
      })
      .moveDown()

    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )

    results.forEach((result, index) => {
      const isFastest = result.name === fastest.name

      // 任务名称
      doc.fontSize(14)
        .fillColor(isFastest ? '#4CAF50' : '#333')
        .text(`${isFastest ? '🏆 ' : ''}${result.name}`)
        .moveDown(0.5)

      // 基本统计
      doc.fontSize(10).fillColor('#666')

      const basicStats = [
        [
          locale === 'zh-CN' ? 'ops/sec' : 'ops/sec',
          this.formatOps(result.opsPerSecond),
        ],
        [
          locale === 'zh-CN' ? '平均时间' : 'Avg Time',
          `${result.avgTime.toFixed(4)} ms`,
        ],
        [
          locale === 'zh-CN' ? '误差' : 'RME',
          `±${result.rme.toFixed(2)}%`,
        ],
        [
          locale === 'zh-CN' ? '迭代次数' : 'Iterations',
          result.iterations.toString(),
        ],
      ]

      basicStats.forEach(([label, value]) => {
        doc.text(`  ${label}: ${value}`)
      })

      // 详细统计
      if (includeDetailedStats && result.percentiles) {
        doc.moveDown(0.5)
        doc.text(
          `  ${locale === 'zh-CN' ? '百分位数' : 'Percentiles'}:`
        )
        doc.text(`    P50: ${result.percentiles.p50.toFixed(4)} ms`)
        doc.text(`    P95: ${result.percentiles.p95.toFixed(4)} ms`)
        doc.text(`    P99: ${result.percentiles.p99.toFixed(4)} ms`)
      }

      if (includeDetailedStats && result.memory) {
        doc.moveDown(0.5)
        doc.text(
          `  ${locale === 'zh-CN' ? '内存' : 'Memory'}: ${this.formatBytes(result.memory.delta)}`
        )
      }

      doc.moveDown(1.5)

      // 检查是否需要新页面
      if (doc.y > doc.page.height - 150 && index < results.length - 1) {
        doc.addPage()
      }
    })
  }

  /**
   * 添加图表（文本表示）
   */
  private addCharts(
    doc: PDFKit.PDFDocument,
    results: BenchmarkResult[],
    locale: string
  ): void {
    doc.fontSize(16)
      .fillColor('#333')
      .text(locale === 'zh-CN' ? '性能对比' : 'Performance Comparison', {
        underline: true,
      })
      .moveDown()

    // ops/sec 条形图（文本表示）
    doc.fontSize(14)
      .fillColor('#666')
      .text(locale === 'zh-CN' ? 'ops/sec 对比' : 'ops/sec Comparison')
      .moveDown(0.5)

    const maxOps = Math.max(...results.map((r) => r.opsPerSecond))

    results.forEach((result) => {
      const percentage = (result.opsPerSecond / maxOps) * 100
      const barLength = Math.floor(percentage / 2) // 最大 50 个字符
      const bar = '█'.repeat(barLength)

      doc.fontSize(10)
        .fillColor('#333')
        .text(`${result.name}:`)
        .fillColor('#4CAF50')
        .text(`  ${bar} ${this.formatOps(result.opsPerSecond)}`)
        .moveDown(0.5)
    })

    doc.moveDown(2)

    // 平均时间对比
    doc.fontSize(14)
      .fillColor('#666')
      .text(locale === 'zh-CN' ? '平均时间对比' : 'Average Time Comparison')
      .moveDown(0.5)

    const maxTime = Math.max(...results.map((r) => r.avgTime))

    results.forEach((result) => {
      const percentage = (result.avgTime / maxTime) * 100
      const barLength = Math.floor(percentage / 2)
      const bar = '█'.repeat(barLength)

      doc.fontSize(10)
        .fillColor('#333')
        .text(`${result.name}:`)
        .fillColor('#FF9800')
        .text(`  ${bar} ${result.avgTime.toFixed(4)} ms`)
        .moveDown(0.5)
    })
  }

  /**
   * 格式化 ops/sec
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
   * 格式化字节
   */
  private formatBytes(bytes: number): string {
    const sign = bytes >= 0 ? '+' : ''
    const abs = Math.abs(bytes)
    if (abs >= 1024 * 1024) {
      return `${sign}${(bytes / (1024 * 1024)).toFixed(2)} MB`
    }
    if (abs >= 1024) {
      return `${sign}${(bytes / 1024).toFixed(2)} KB`
    }
    return `${sign}${bytes} B`
  }
}
