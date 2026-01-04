/**
 * Excel 报告生成器
 * 
 * 使用 exceljs 生成包含多工作表的 Excel 报告
 */

import ExcelJS from 'exceljs'
import type { BenchmarkResult } from './types'

/**
 * Excel 报告选项
 */
export interface ExcelReportOptions {
  /** 是否包含图表工作表 */
  includeCharts?: boolean
  /** 是否包含原始数据 */
  includeRawData?: boolean
  /** 工作表名称 */
  sheetName?: string
  /** 语言 */
  locale?: 'zh-CN' | 'en-US'
}

/**
 * Excel 报告生成器类
 */
export class ExcelReporter {
  /**
   * 生成 Excel 报告
   * 
   * @param results - 基准测试结果
   * @param suiteName - 套件名称
   * @param options - Excel 选项
   * @returns Excel Buffer
   */
  async generate(
    results: BenchmarkResult[],
    suiteName: string,
    options: ExcelReportOptions = {}
  ): Promise<Buffer> {
    const {
      includeRawData = true,
      sheetName = 'Results',
      locale = 'zh-CN',
    } = options

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '@ldesign/benchmark'
    workbook.created = new Date()

    // 添加摘要工作表
    this.addSummarySheet(workbook, results, suiteName, locale)

    // 添加详细结果工作表
    this.addResultsSheet(workbook, results, sheetName, locale)

    // 添加原始数据工作表
    if (includeRawData) {
      this.addRawDataSheet(workbook, results, locale)
    }

    // 生成 Buffer
    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer)
  }

  /**
   * 添加摘要工作表
   */
  private addSummarySheet(
    workbook: ExcelJS.Workbook,
    results: BenchmarkResult[],
    suiteName: string,
    locale: string
  ): void {
    const sheet = workbook.addWorksheet(locale === 'zh-CN' ? '摘要' : 'Summary')

    // 标题
    sheet.getCell('A1').value = suiteName
    sheet.getCell('A1').font = { size: 16, bold: true }
    sheet.mergeCells('A1:B1')

    // 生成时间
    sheet.getCell('A2').value = locale === 'zh-CN' ? '生成时间:' : 'Generated:'
    sheet.getCell('B2').value = new Date().toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')

    // 统计信息
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )
    const totalIterations = results.reduce((sum, r) => sum + r.iterations, 0)

    const summaryData = [
      [locale === 'zh-CN' ? '测试任务数' : 'Total Tasks', results.length],
      [locale === 'zh-CN' ? '最高 ops/sec' : 'Highest ops/sec', fastest.opsPerSecond.toFixed(2)],
      [locale === 'zh-CN' ? '最快平均时间' : 'Fastest Avg Time', `${fastest.avgTime.toFixed(4)} ms`],
      [locale === 'zh-CN' ? '总迭代次数' : 'Total Iterations', totalIterations],
    ]

    summaryData.forEach((row, index) => {
      const rowNum = index + 4
      sheet.getCell(`A${rowNum}`).value = row[0]
      sheet.getCell(`B${rowNum}`).value = row[1]
      sheet.getCell(`A${rowNum}`).font = { bold: true }
    })

    // 设置列宽
    sheet.getColumn(1).width = 25
    sheet.getColumn(2).width = 20
  }

  /**
   * 添加详细结果工作表
   */
  private addResultsSheet(
    workbook: ExcelJS.Workbook,
    results: BenchmarkResult[],
    sheetName: string,
    locale: string
  ): void {
    const sheet = workbook.addWorksheet(sheetName)

    // 表头
    const headers = locale === 'zh-CN'
      ? ['任务名称', 'ops/sec', '平均时间 (ms)', '最小时间 (ms)', '最大时间 (ms)', '标准差', 'RME (%)', '迭代次数', 'P50 (ms)', 'P95 (ms)', 'P99 (ms)', '状态']
      : ['Task Name', 'ops/sec', 'Avg Time (ms)', 'Min Time (ms)', 'Max Time (ms)', 'Std Dev', 'RME (%)', 'Iterations', 'P50 (ms)', 'P95 (ms)', 'P99 (ms)', 'Status']

    sheet.addRow(headers)

    // 设置表头样式
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    // 添加数据
    const fastest = results.reduce((prev, curr) =>
      curr.opsPerSecond > prev.opsPerSecond ? curr : prev
    )

    results.forEach((result) => {
      const row = sheet.addRow([
        result.name,
        result.opsPerSecond,
        result.avgTime,
        result.minTime,
        result.maxTime,
        result.stdDev,
        result.rme,
        result.iterations,
        result.percentiles?.p50 ?? '',
        result.percentiles?.p95 ?? '',
        result.percentiles?.p99 ?? '',
        result.status ?? 'success',
      ])

      // 高亮最快的任务
      if (result.name === fastest.name) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE8F5E9' },
        }
      }

      // 数字格式
      row.getCell(2).numFmt = '#,##0.00'
      row.getCell(3).numFmt = '0.0000'
      row.getCell(4).numFmt = '0.0000'
      row.getCell(5).numFmt = '0.0000'
      row.getCell(6).numFmt = '0.0000'
      row.getCell(7).numFmt = '0.00'
      row.getCell(9).numFmt = '0.0000'
      row.getCell(10).numFmt = '0.0000'
      row.getCell(11).numFmt = '0.0000'
    })

    // 设置列宽
    sheet.columns = [
      { width: 30 }, // Task Name
      { width: 15 }, // ops/sec
      { width: 15 }, // Avg Time
      { width: 15 }, // Min Time
      { width: 15 }, // Max Time
      { width: 12 }, // Std Dev
      { width: 12 }, // RME
      { width: 12 }, // Iterations
      { width: 12 }, // P50
      { width: 12 }, // P95
      { width: 12 }, // P99
      { width: 12 }, // Status
    ]

    // 冻结首行
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }

  /**
   * 添加原始数据工作表
   */
  private addRawDataSheet(
    workbook: ExcelJS.Workbook,
    results: BenchmarkResult[],
    locale: string
  ): void {
    const sheet = workbook.addWorksheet(locale === 'zh-CN' ? '原始数据' : 'Raw Data')

    // 表头
    const headers = locale === 'zh-CN'
      ? ['任务名称', '样本索引', '时间 (ms)']
      : ['Task Name', 'Sample Index', 'Time (ms)']

    sheet.addRow(headers)

    // 设置表头样式
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' },
    }

    // 添加原始样本数据
    results.forEach((result) => {
      if (result.samples && result.samples.length > 0) {
        result.samples.forEach((sample, index) => {
          const row = sheet.addRow([result.name, index + 1, sample])
          row.getCell(3).numFmt = '0.0000'
        })
      }
    })

    // 设置列宽
    sheet.columns = [
      { width: 30 }, // Task Name
      { width: 15 }, // Sample Index
      { width: 15 }, // Time
    ]

    // 冻结首行
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
  }
}
