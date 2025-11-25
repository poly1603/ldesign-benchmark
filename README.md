# 🏁 性能基准测试框架

用于验证各包优化效果的统一基准测试框架。

---

## 📋 目录结构

```
benchmark/
├── README.md                 # 本文件
├── setup.ts                  # 测试环境设置
├── utils/
│   ├── benchmark-runner.ts   # 基准测试运行器
│   ├── performance-reporter.ts # 性能报告生成
│   └── comparison.ts         # 优化前后对比
├── router/
│   ├── route-matching.bench.ts      # 路由匹配测试
│   └── guard-execution.bench.ts     # 守卫执行测试
├── color/
│   ├── color-space.bench.ts         # 色彩空间转换
│   └── batch-operations.bench.ts    # 批量操作测试
├── i18n/
│   ├── translation.bench.ts         # 翻译性能测试
│   └── cache-hierarchy.bench.ts     # 缓存层级测试
├── size/
│   └── responsive.bench.ts          # 响应式计算测试
├── http/
│   └── deduplication.bench.ts       # 请求去重测试
└── engine/
    └── middleware.bench.ts           # 中间件执行测试
```

---

## 🚀 快速开始

### 安装依赖

```bash
pnpm add -D vitest tinybench
```

### 运行所有基准测试

```bash
# 运行所有测试
pnpm benchmark

# 运行特定包的测试
pnpm benchmark:router
pnpm benchmark:color
pnpm benchmark:i18n
```

### 对比优化前后

```bash
# 生成对比报告
pnpm benchmark:compare
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

## ✅ 最佳实践

1. **预热运行** - 避免冷启动影响
2. **多次采样** - 减少误差
3. **隔离环境** - 避免其他进程干扰
4. **版本控制** - 保存历史基准数据
5. **持续监控** - CI/CD 中自动运行

---

**开始测量，验证优化效果！** 🏁
