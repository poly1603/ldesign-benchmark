import { createBenchmark } from '../dist/index.js'
// 简单的基准测试示例
export default function setupBenchmark(runner: any) {
  const bench = createBenchmark('简单基准测试示例')

  bench.add('数组 push 操作', () => {
    const arr: number[] = []
    for (let i = 0; i < 1000; i++) {
      arr.push(i)
    }
  })

  bench.add('数组 concat 操作', () => {
    let arr: number[] = []
    for (let i = 0; i < 1000; i++) {
      arr = arr.concat([i])
    }
  })

  bench.add('对象属性访问', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
    let sum = 0
    for (let i = 0; i < 1000; i++) {
      sum += obj.a + obj.b + obj.c + obj.d + obj.e
    }
  })

  runner.addSuite('simple', bench)
}
