import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import { withFileLock, AbortLockError } from '../src/tools/file-lock.js'

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// 每个用例用唯一 key，避免共享模块级锁表互相干扰
let counter = 0
const uniqueKey = () => path.join(os.tmpdir(), `file-lock-test-${Date.now()}-${counter++}.txt`)

describe('withFileLock', () => {
  it('同 key 并发：临界区不重叠（串行）', async () => {
    const key = uniqueKey()
    let active = 0
    let maxActive = 0
    const fn = async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await delay(30)
      active--
    }
    await Promise.all([withFileLock(key, fn), withFileLock(key, fn), withFileLock(key, fn)])
    expect(maxActive).toBe(1)
  })

  it('不同 key 并发：真正并行（耗时 ≈ 单次）', async () => {
    const a = uniqueKey()
    const b = uniqueKey()
    const start = performance.now()
    await Promise.all([
      withFileLock(a, async () => { await delay(40) }),
      withFileLock(b, async () => { await delay(40) }),
    ])
    const elapsed = performance.now() - start
    // 并行应远小于串行的 80ms
    expect(elapsed).toBeLessThan(70)
  })

  it('fn 抛错后链不断，后续同 key 调用仍能正常执行', async () => {
    const key = uniqueKey()
    await expect(withFileLock(key, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    const r = await withFileLock(key, async () => 'ok')
    expect(r).toBe('ok')
  })

  it('排队等锁期间 abort：抛 AbortLockError 且不执行 fn', async () => {
    const key = uniqueKey()
    let releaseHolder!: () => void
    const hold = new Promise<void>(r => { releaseHolder = r })
    // 先占住锁不放
    const holderP = withFileLock(key, async () => { await hold; return 'holder' })
    await delay(5)

    const ctrl = new AbortController()
    let ran = false
    const waiterP = withFileLock(key, async () => { ran = true; return 'waiter' }, ctrl.signal)
    ctrl.abort()

    await expect(waiterP).rejects.toBeInstanceOf(AbortLockError)
    expect(ran).toBe(false)

    releaseHolder()
    expect(await holderP).toBe('holder')
  })

  it('abort 的等待者退出后，后续等待者仍排在真正持锁者之后', async () => {
    const key = uniqueKey()
    let releaseA!: () => void
    const holdA = new Promise<void>(r => { releaseA = r })
    let aRan = false
    const aP = withFileLock(key, async () => { aRan = true; await holdA; return 'a' })
    await delay(5) // 让 A 先获锁

    // B 排队后立即 abort
    const ctrl = new AbortController()
    let bRan = false
    const bP = withFileLock(key, async () => { bRan = true; return 'b' }, ctrl.signal)
    ctrl.abort()
    await expect(bP).rejects.toBeInstanceOf(AbortLockError)
    expect(bRan).toBe(false)

    // C 排队且不 abort —— 此刻 A 仍持锁，C 不应提前执行
    let cRan = false
    const cP = withFileLock(key, async () => { cRan = true; return 'c' })
    await delay(20)
    expect(cRan).toBe(false) // 若 B 的 abort 让 C 跳过 A，这里会是 true（回归 bug）

    releaseA()
    expect(await cP).toBe('c')
    expect(await aP).toBe('a')
    expect(aRan).toBe(true)
  })
})
