# 🏁 LDesign 性能基准测试框架

> 📊 用于验证各包优化效果的统一基准测试框架，提供完整的性能测试、分析和可视化解决方案。

**特性一览**: 高性能百分位计算 (O(n)) | WebSocket 实时推送 | 完善的 TypeScript 类型 | 错误边界处理 | 多格式报告 | CI/CD 集成

---

## 🚀 核心特性

### 🔧 强大的 CLI 工具
- **智能文件发现**: 支持 glob 模式自动查找基准测试文件
- **多种报告格式**: Console、JSON、Markdown、HTML
- **实时监听模式**: 文件变化时自动重新运行测试
- **历史记录管理**: 保存和对比历史性能数据
- **阈值检查**: 自动检测性能回归

### 🌐 可视化 Web 界面
- **实时仪表板**: 美观的 Web 界面查看测试结果
- **历史趋势**: 可视化性能变化趋势
- **交互式报告**: 点击查看详细分析
- **对比分析**: 多版本性能对比

### 🔌 可扩展插件系统
- **自定义报告**: 支持插件生成自定义报告格式
- **性能分析**: 内置统计和趋势分析插件
- **事件钩子**: 完整的生命周期事件支持
- **插件开发**: 易于开发和集成新插件

### 📊 深度性能分析
- **内存分析**: 详细的内存使用情况分析（堆、外部内存、RSS）
- **百分位计算**: 使用 QuickSelect 算法实现 O(n) 复杂度
- **异常值检测**: IQR 和 Z-score 方法检测异常样本
- **置信区间**: 计算 90%/95%/99% 置信区间
- **优化建议**: 基于分析结果智能生成优化建议

### 🛡️ 错误处理
- **错误边界**: 完善的错误边界处理 (tryCatch, tryCatchSync)
- **类型安全**: 丰富的类型守卫和验证函数
- **重试机制**: 支持指数退避的重试逻辑
- **恢复建议**: 错误信息包含恢复建议

### 🔄 CI/CD 集成
- **GitHub Actions**: 完整的 CI/CD 工作流
- **自动阈值检查**: PR 时自动检查性能阈值
- **回归检测**: 自动检测性能回归
- **报告生成**: 自动生成和上传测试报告

---

## 📋 目录结构

```
benchmark/
├── README.md                     # 本文件
├── package.json                  # 包配置
├── tsconfig.json                 # TypeScript 配置
├── tsup.config.ts                # 构建配置
├── vitest.config.ts              # 测试配置
├── benchmark.config.example.json # 配置文件示例
├── benchmark.schema.json         # 配置 JSON Schema
├── src/
│   ├── index.ts                  # 主入口
│   ├── benchmark.ts              # 核心基准测试实现
│   ├── reporter.ts               # 报告生成器
│   ├── runner.ts                 # 批量运行器
│   ├── cli.ts                    # 命令行接口
│   ├── server.ts                 # 可视化服务器 (WebSocket 支持)
│   ├── plugins.ts                # 插件系统
│   ├── analyzer.ts               # 性能分析工具
│   ├── analyzer-enhanced.ts      # 增强分析器 (异常检测、置信区间)
│   ├── errors.ts                 # 错误类和错误边界
│   ├── validators.ts             # 类型守卫和验证函数
│   ├── utils/
│   │   └── index.ts              # 共享工具函数
│   ├── types/
│   │   ├── index.ts              # 类型导出
│   │   └── benchmark.ts          # 核心类型定义
│   └── types.ts                  # 类型重导出 (向后兼容)
└── .github/workflows/
    └── benchmark.yml             # CI/CD 工作流
```

---

## 🚀 快速开始

### 安装

```bash
# 在 LDesign 工作区中
pnpm install

# 构建 benchmark 工具
cd tools/benchmark
pnpm build
```

### 基本使用

```bash
# 运行所有基准测试
npx ldbench run

# 运行特定文件的基准测试
npx ldbench run packages/router/**/*.bench.ts

# 使用 glob 模式
npx ldbench run --pattern "**/*.bench.{js,ts}"

# 生成 HTML 报告
npx ldbench run --report html --out ./report.html

# 保存历史记录
npx ldbench run --history

# 与基线对比
npx ldbench run --compare ./baseline-report.json
```

### 可视化界面

```bash
# 启动可视化服务器
npx ldbench serve

# 指定端口和主机
npx ldbench serve --port 8080 --host 0.0.0.0
```

### 查看历史记录

```bash
# 查看最近的历史记录
npx ldbench history

# 查看特定套件的历史
npx ldbench history --suite router

# 限制显示数量
npx ldbench history --limit 20
```

### 监听模式

```bash
# 监听文件变化自动重新运行
npx ldbench run --watch
```

---

## 📊 基准测试示例

### Router 路由匹配

```typescript
// benchmark/router/route-matching.bench.ts
import { describe, bench } from 'vitest'
import { Router } from '@ldesign/router'

describe('Router - 路由匹配性能', () => {
  // 准备测试数据
  const router = new Router()
  const routes = Array.from({ length: 1000 }, (_, i) => ({
    path: i < 500 ? `/static/${i}` : `/dynamic/:id${i}`,
    component: {},
  }))
  
  routes.forEach(r => router.addRoute(r))

  bench('静态路由匹配 (1000 routes)', () => {
    router.match('/static/250')
  }, {
    iterations: 10000,
    warmup: 100,
  })

  bench('动态路由匹配 (1000 routes)', () => {
    router.match('/dynamic/12345')
  }, {
    iterations: 10000,
    warmup: 100,
  })

  bench('未匹配路由 (1000 routes)', () => {
    router.match('/not-found')
  }, {
    iterations: 10000,
    warmup: 100,
  })
})
```

### Color 色彩空间转换

```typescript
// benchmark/color/color-space.bench.ts
import { describe, bench } from 'vitest'
import { Color } from '@ldesign/color'

describe('Color - 色彩空间转换', () => {
  const color = new Color('#ff6b6b')

  bench('RGB → OKLCH (无缓存)', () => {
    const c = new Color('#ff6b6b')
    c.toOKLCH()
  })

  bench('RGB → OKLCH (有缓存)', () => {
    color.toOKLCH()
  })

  bench('RGB → HSL', () => {
    color.toHSL()
  })

  bench('RGB → LAB', () => {
    color.toLAB()
  })

  // 批量操作
  bench('批量转换 100 个颜色', () => {
    const colors = Array.from({ length: 100 }, (_, i) => 
      new Color(`#${i.toString(16).padStart(6, '0')}`)
    )
    colors.forEach(c => c.toOKLCH())
  })
})
```

### I18n 翻译性能

```typescript
// benchmark/i18n/translation.bench.ts
import { describe, bench } from 'vitest'
import { I18n } from '@ldesign/i18n'

describe('I18n - 翻译性能', () => {
  const i18n = new I18n({
    locale: 'zh-CN',
    messages: {
      'zh-CN': {
        'common.hello': '你好',
        'common.world': '世界',
        'user.name': '用户名',
        // ... 1000+ 条翻译
      }
    }
  })

  // 预热缓存
  i18n.t('common.hello')
  i18n.t('common.world')

  bench('热点词条翻译 (L1 缓存)', () => {
    i18n.t('common.hello')
  })

  bench('常用词条翻译 (L2 缓存)', () => {
    i18n.t('user.name')
  })

  bench('冷门词条翻译 (无缓存)', () => {
    i18n.t(`dynamic.key.${Math.random()}`)
  })

  bench('带参数的翻译', () => {
    i18n.t('user.greeting', { name: 'Alice' })
  })
})
```

---

## 📈 性能目标

### Router 包

| 测试项 | 优化前 | 目标 | 测量单位 |
|--------|--------|------|----------|
| 静态路由匹配 (1000) | 5ms | < 1ms | 平均耗时 |
| 动态路由匹配 (1000) | 10ms | < 2ms | 平均耗时 |
| 守卫并行执行 (5个) | 50ms | < 20ms | 总耗时 |

### Color 包

| 测试项 | 优化前 | 目标 | 测量单位 |
|--------|--------|------|----------|
| OKLCH 转换 (首次) | 100μs | < 100μs | 单次耗时 |
| OKLCH 转换 (缓存) | 100μs | < 10μs | 单次耗时 |
| 批量操作 (100色) | 10ms | < 3ms | 总耗时 |

### I18n 包

| 测试项 | 优化前 | 目标 | 测量单位 |
|--------|--------|------|----------|
| L1 缓存翻译 | 50μs | < 10μs | 单次耗时 |
| L2 缓存翻译 | 50μs | < 20μs | 单次耗时 |
| 模板编译翻译 | 200μs | < 80μs | 单次耗时 |

### HTTP 包

| 测试项 | 优化前 | 目标 | 测量单位 |
|--------|--------|------|----------|
| 请求去重准确率 | 95% | > 99% | 百分比 |
| 内存占用 | 10MB | < 7MB | 1000 请求 |
| 批量处理 | 100ms | < 50ms | 50 请求 |

---

## 🔧 工具类

### 基准测试运行器

```typescript
// benchmark/utils/benchmark-runner.ts
import { Bench } from 'tinybench'

export class BenchmarkRunner {
  private bench: Bench

  constructor() {
    this.bench = new Bench({
      time: 1000, // 运行 1 秒
      iterations: 10,
      warmup: true,
      warmupTime: 100,
    })
  }

  add(name: string, fn: () => void) {
    this.bench.add(name, fn)
    return this
  }

  async run() {
    await this.bench.run()
    return this.bench.tasks
  }

  report() {
    console.table(
      this.bench.tasks.map(task => ({
        名称: task.name,
        '平均耗时': `${task.result?.mean.toFixed(3)}ms`,
        '操作/秒': task.result?.hz.toFixed(0),
        '误差': `±${task.result?.rme.toFixed(2)}%`,
      }))
    )
  }
}
```

### 性能报告生成器

```typescript
// benchmark/utils/performance-reporter.ts
export class PerformanceReporter {
  private results: Map<string, BenchmarkResult> = new Map()

  addResult(name: string, result: BenchmarkResult) {
    this.results.set(name, result)
  }

  compare(baseline: string, optimized: string) {
    const baseResult = this.results.get(baseline)
    const optResult = this.results.get(optimized)

    if (!baseResult || !optResult) {
      throw new Error('结果不完整')
    }

    const improvement = (
      (baseResult.mean - optResult.mean) / baseResult.mean * 100
    ).toFixed(2)

    return {
      baseline: baseResult.mean,
      optimized: optResult.mean,
      improvement: `${improvement}%`,
      faster: baseResult.mean / optResult.mean,
    }
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      results: Array.from(this.results.entries()).map(([name, result]) => ({
        name,
        mean: result.mean,
        hz: result.hz,
        samples: result.samples.length,
      })),
    }

    return JSON.stringify(report, null, 2)
  }

  saveToFile(filename: string) {
    const fs = require('fs')
    fs.writeFileSync(filename, this.generateReport())
    console.log(`报告已保存到: ${filename}`)
  }
}

interface BenchmarkResult {
  mean: number
  hz: number
  samples: number[]
  rme: number
}
```

---

## 📝 使用示例

### 基本用法

```typescript
import { BenchmarkRunner } from './utils/benchmark-runner'

const runner = new BenchmarkRunner()

runner
  .add('优化前', () => {
    // 旧实现
  })
  .add('优化后', () => {
    // 新实现
  })

await runner.run()
runner.report()
```

### 生成对比报告

```typescript
import { PerformanceReporter } from './utils/performance-reporter'

const reporter = new PerformanceReporter()

// 运行基准测试并添加结果
const baselineResult = await runBaseline()
const optimizedResult = await runOptimized()

reporter.addResult('baseline', baselineResult)
reporter.addResult('optimized', optimizedResult)

// 对比分析
const comparison = reporter.compare('baseline', 'optimized')
console.log(`性能提升: ${comparison.improvement}`)
console.log(`快了 ${comparison.faster.toFixed(2)} 倍`)

// 保存报告
reporter.saveToFile('./reports/performance-report.json')
```

---

## 🎯 CI/CD 集成

### GitHub Actions 配置

```yaml
# .github/workflows/benchmark.yml
name: Performance Benchmark

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run benchmarks
        run: pnpm benchmark
      
      - name: Compare with baseline
        run: pnpm benchmark:compare
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: reports/
```

---

## 📊 报告示例

### 控制台输出

```
┌─────────────────────────────────┬──────────────┬──────────────┬──────────┐
│ 名称                            │ 平均耗时     │ 操作/秒      │ 误差     │
├─────────────────────────────────┼──────────────┼──────────────┼──────────┤
│ Router - 静态路由 (优化前)      │ 5.234ms      │ 191          │ ±2.3%    │
│ Router - 静态路由 (优化后)      │ 0.987ms      │ 1013         │ ±1.8%    │
│ 性能提升                        │ 5.3倍 ⚡     │              │          │
├─────────────────────────────────┼──────────────┼──────────────┼──────────┤
│ Color - OKLCH (优化前)          │ 98.5μs       │ 10152        │ ±3.1%    │
│ Color - OKLCH (优化后)          │ 8.2μs        │ 121951       │ ±1.5%    │
│ 性能提升                        │ 12倍 ⚡⚡    │              │          │
└─────────────────────────────────┴──────────────┴──────────────┴──────────┘
```

### JSON 报告

```json
{
  "timestamp": "2025-11-24T13:53:00.000Z",
  "results": [
    {
      "name": "Router - 静态路由匹配",
      "baseline": 5.234,
      "optimized": 0.987,
      "improvement": "81.1%",
      "faster": 5.3
    },
    {
      "name": "Color - OKLCH 转换",
      "baseline": 98.5,
      "optimized": 8.2,
      "improvement": "91.7%",
      "faster": 12.0
    }
  ],
  "summary": {
    "totalTests": 15,
    "avgImprovement": "65.3%",
    "passed": 13,
    "failed": 2
  }
}
```

---

## 🛠️ API 参考

### 核心类型

```typescript
// 基准测试任务函数
type BenchmarkTask = () => void | Promise<void>

// 基准测试选项
interface BenchmarkOptions {
  name: string              // 测试名称
  warmup?: number           // 预热次数 (默认: 5)
  time?: number             // 最小运行时间 ms (默认: 1000)
  iterations?: number       // 最小迭代次数 (默认: 10)
  timeout?: number          // 超时时间 ms (默认: 30000)
  retries?: number          // 失败重试次数 (默认: 0)
  collectMemory?: boolean   // 收集内存信息 (默认: false)
  retainSamples?: boolean   // 保留样本数据 (默认: false)
  tags?: string[]           // 标签用于过滤
  onProgress?: ProgressCallback  // 进度回调
}

// 基准测试结果
interface BenchmarkResult {
  readonly name: string
  readonly opsPerSecond: number
  readonly avgTime: number
  readonly minTime: number
  readonly maxTime: number
  readonly stdDev: number
  readonly rme: number
  readonly iterations: number
  readonly totalTime: number
  readonly percentiles?: PercentileStats
  readonly memory?: MemoryStats
  readonly extendedStats?: ExtendedStats
  readonly samples?: readonly number[]
  readonly status?: BenchmarkStatus
  readonly error?: string
  readonly group?: string
  readonly customMetrics?: Record<string, number>
}
```

### 工具函数

```typescript
import {
  // 格式化
  formatBytes,
  formatOps,
  formatTime,
  formatPercentage,
  formatDuration,
  
  // 统计
  calculatePercentile,      // O(n) QuickSelect 算法
  calculateAllPercentiles,
  calculateStats,
  calculateRME,
  
  // 工具
  retry,                    // 指数退避重试
  deepMerge,
  deepFreeze,
  delay,
  chunk,
  
  // 验证
  isPositiveNumber,
  isNonEmptyString,
  assert,
  assertDefined,
} from '@ldesign/benchmark'
```

### 错误处理

```typescript
import {
  // 错误类
  BenchmarkError,
  ConfigurationError,
  ExecutionError,
  TimeoutError,
  ValidationError,
  NetworkError,
  PluginError,
  
  // 工具函数
  captureError,
  formatError,
  createConfigError,
  createTimeoutError,
  
  // 类型守卫
  isBenchmarkError,
  isRetryableError,
  isFatalError,
  
  // 错误边界
  tryCatch,
  tryCatchSync,
  withErrorBoundary,
} from '@ldesign/benchmark'

// 使用错误边界
const result = await tryCatch(
  () => riskyOperation(),
  { taskName: 'myTask', suiteName: 'mySuite' }
)

if (result.success) {
  console.log(result.value)
} else {
  console.error(result.error.format())
}
```

### 验证器

```typescript
import {
  // 类型守卫
  isBenchmarkStatus,
  isBenchmarkPhase,
  isBenchmarkResult,
  isBenchmarkSuite,
  isProgressInfo,
  isCompletedStatus,
  isFailureStatus,
  
  // 验证函数
  validateBenchmarkOptions,
  validateThreshold,
  validateBenchmarkReport,
  
  // 安全解析
  safeParseJSON,
  safeParseInt,
  safeParseFloat,
  
  // 范围验证
  clamp,
  isInRange,
  
  // 路径验证
  isSafePath,
  sanitizeFilename,
} from '@ldesign/benchmark'
```

---

## 🔧 故障排除

### 常见问题

**Q: 测试结果不稳定，误差很大？**

A: 尝试以下方法:
- 增加预热次数: `warmup: 10`
- 增加运行时间: `time: 5000`
- 确保测试环境稳定，关闭其他占用 CPU 的程序
- 使用 `collectMemory: true` 检查是否有 GC 干扰

**Q: 内存使用过高？**

A: 
- 设置 `retainSamples: false` 不保留原始样本
- 减少迭代次数
- 检查测试代码是否有内存泄漏

**Q: 超时错误？**

A:
- 增加超时时间: `timeout: 60000`
- 检查任务是否有无限循环
- 使用 `--debug` 模式查看详细日志

**Q: WebSocket 连接失败？**

A:
- 确保端口未被占用
- 检查防火墙设置
- 尝试使用其他端口: `ldbench serve --port 8080`

---

## ✅ 最佳实践

1. **预热运行** - 避免冷启动和 JIT 编译影响
2. **多次采样** - 减少随机误差，提高可靠性
3. **隔离环境** - 避免其他进程干扰
4. **版本控制** - 保存历史基准数据用于对比
5. **持续监控** - CI/CD 中自动运行基准测试
6. **关注 P95/P99** - 不要只看平均值，尾部延迟更重要
7. **收集内存** - 定期检查内存使用情况

---

## 📝 更新日志

### v0.2.0
- ✨ 新增 QuickSelect O(n) 百分位计算算法
- ✨ 新增完善的错误边界处理 (tryCatch, withErrorBoundary)
- ✨ 新增 NetworkError, PluginError 错误类
- ✨ 新增带恢复建议的错误信息
- ✨ 新增完善的类型守卫和验证器
- ✨ 新增指数退避重试机制
- 📝 改进 TypeScript 类型 (readonly, const assertions)
- 📝 改进 server.ts 完善 API 响应类型
- 🐛 修复多个 TypeScript 类型错误

### v0.1.0
- 🎉 初始版本
- 基本基准测试功能
- CLI 工具
- 可视化服务器
- 插件系统

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 仓库
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交更改: `git commit -m 'feat: add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 提交 Pull Request

---

## 📄 许可证

MIT License - 查看 [LICENSE](./LICENSE) 了解更多信息。

---

**开始测量，验证优化效果！** 🏁
