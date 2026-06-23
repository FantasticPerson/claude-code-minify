import * as path from 'path'

/**
 * withFileLock 在排队等锁阶段被 abort 时抛出。
 * 调用方（engine 的工具执行 try/catch）会把它当作普通工具错误处理，下一轮再走 interrupted 分支。
 */
export class AbortLockError extends Error {
  constructor(message = 'file lock aborted while waiting') {
    super(message)
    this.name = 'AbortLockError'
  }
}

/**
 * 模块级共享锁表。同一 Node 进程内所有 file_edit/file_write 调用共用，
 * 从而让多个 chat/Session/chatStream 实例并发时对同一文件互斥。
 *
 * key   = 标准化绝对路径（path.normalize + path.resolve）
 *         注意：不解析 symlink——通过软链路径与真实路径并发写同一物理文件不会互斥。
 * value = 该 key 当前持锁者「让出锁」的占位 promise（已吞错，必 resolve），下一个等待者的 prev 即取它。
 *
 * 不做条目清理：每个唯一路径常驻一个 resolved promise，代价可忽略（SDK 场景文件路径有限）；
 * 而清理会在「abort 退出 + 仍有持锁者」时错误丢失队列信息，得不偿失。
 */
const locks = new Map<string, Promise<unknown>>()

/**
 * 对同一文件路径的临界区做进程内互斥：同 key 串行，不同 key 并行。
 *
 * 实现要点：
 * - 占位用 gate = prev.then(() => turn)，而非 turn 本身。这样当本任因 abort 从未获锁时
 *   release turn，gate 即等价于 prev——后续等待者仍正确排在前一个持锁者之后，不会跳过它。
 * - 等的是 prev（前一个让出），不是 gate（避免「自己等自己 turn」死锁）。
 * - fn 抛错原样向上传播；finally 必在所有分支（含 abort）release，保证链不断、不死锁。
 * - signal：排队等锁期间被 abort 则抛 AbortLockError 且不执行 fn；acquire 成功后、执行 fn 前
 *   再查一次 signal.aborted，覆盖 raceAbort 返回与 fn 启动之间的末段竞态。
 *   abort 为尽力而为——若 fn 已启动则按无锁原状执行，不承诺绝对取消。
 *
 * 第二期若需跨进程互斥，替换本函数内部实现为 OS 文件锁即可，
 * 保持 (filePath, fn, signal?) 签名与 abort 语义不变（不为第二期预留 backend 注入参数）。
 */
export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const key = path.normalize(path.resolve(filePath))

  const prev = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const turn = new Promise<void>(resolve => { release = resolve })
  const gate = prev.then(() => turn)
  locks.set(key, gate.then(() => {}, () => {}))

  try {
    await raceAbort(prev, signal)
    if (signal?.aborted) throw new AbortLockError()
    return await fn()
  } finally {
    release()
  }
}

/** 等 p 完成，或 signal 先被 abort 则 reject AbortLockError。 */
function raceAbort(p: Promise<unknown>, signal?: AbortSignal): Promise<void> {
  if (!signal) return p.then(() => {})
  if (signal.aborted) return Promise.reject(new AbortLockError())
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new AbortLockError())
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(
      () => { signal.removeEventListener('abort', onAbort); resolve() },
      // 兜底：prev 正常不会 reject（locks 存的是吞错 promise），若异常 reject 也放行，避免永久 pending
      () => { signal.removeEventListener('abort', onAbort); resolve() },
    )
  })
}
