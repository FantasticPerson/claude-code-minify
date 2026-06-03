import { describe, it, expect } from 'vitest'
import { Message } from '../src/core/types.js'
import { CompactStrategy, NoCompact, BasicCompact, TieredCompact } from '../src/context/strategy.js'

// ============ Helpers ============

function userMsg(text: string): Message {
  return { role: 'user', content: [{ type: 'text', text }] }
}

function assistantToolCall(toolName: string, id: string): Message {
  return { role: 'assistant', content: [{ type: 'tool_use', id, name: toolName, input: { file_path: '/test' } }] }
}

function toolResultMsg(toolUseId: string, content: string, isError = false): Message {
  return { role: 'user', content: [{ type: 'tool_result', toolUseId, content, isError }] }
}

function assistantTextMsg(text: string): Message {
  return { role: 'assistant', content: [{ type: 'text', text }] }
}

// ============ NoCompact ============

describe('NoCompact', () => {
  it('returns messages unchanged with phase 0', () => {
    const strategy = new NoCompact()
    const messages = [userMsg('hello'), assistantTextMsg('hi')]
    const result = strategy.compact(messages, 1000)

    expect(result.messages).toBe(messages) // same reference
    expect(result.phase).toBe(0)
  })

  it('returns phase 0 regardless of message size', () => {
    const strategy = new NoCompact()
    const longText = 'a'.repeat(10000)
    const messages = [userMsg(longText)]
    const result = strategy.compact(messages, 10) // tiny budget

    expect(result.messages).toBe(messages)
    expect(result.phase).toBe(0)
  })
})

// ============ BasicCompact ============

describe('BasicCompact', () => {
  it('does not trigger when tokens < budget * 0.8', () => {
    const strategy = new BasicCompact()
    // Short message that should be under threshold
    const messages = [userMsg('hello'), assistantTextMsg('hi')]
    const result = strategy.compact(messages, 1000)

    expect(result.phase).toBe(0)
    expect(result.messages).toEqual(messages)
  })

  it('triggers phase >= 1 when long tool results exceed threshold', () => {
    const strategy = new BasicCompact({ compressRecentRounds: 1 })
    // Build messages that exceed 80% of budget
    // budget=260, trigger at 208 tokens, target at 156 tokens
    // Pre-compression: ~213 tokens (triggers at 208)
    // After compression: ~71 tokens (under 156 target, no truncation needed)
    const longResult = 'x'.repeat(600) // ~150 tokens for text + overhead
    const messages: Message[] = [
      userMsg('read a file'),          // old: index 0, outside protected zone
      assistantToolCall('file_read', 'tu_1'),  // old: index 1
      toolResultMsg('tu_1', longResult),       // old: index 2, will be compressed
      userMsg('recent question'),      // recent: index 3, protected
      assistantTextMsg('recent answer'),       // recent: index 4, protected
    ]
    const result = strategy.compact(messages, 260)

    expect(result.phase).toBeGreaterThanOrEqual(1)
    // The long tool result should be compressed (content no longer contains 600 x's)
    const toolResults = result.messages
      .flatMap(m => m.content)
      .filter(b => b.type === 'tool_result') as any[]
    expect(toolResults.length).toBeGreaterThanOrEqual(1)
    expect(toolResults[0].content).toContain('[Compressed:')
    expect(toolResults[0].content.length).toBeLessThan(100)
  })

  it('preserves recent rounds when compressing', () => {
    const strategy = new BasicCompact({ compressRecentRounds: 1 })
    const longResult = 'x'.repeat(600)

    // With compressRecentRounds=1, last 2 messages are protected
    const messages: Message[] = [
      userMsg('old message'),            // outside protected zone
      assistantToolCall('file_read', 'tu_1'),  // outside protected zone
      toolResultMsg('tu_1', longResult),       // outside protected zone, will be compressed
      userMsg('recent question'),       // recent, protected
      assistantTextMsg('recent answer'),        // recent, protected
    ]
    const result = strategy.compact(messages, 100)

    // Recent messages should still be intact
    expect(result.messages.some(m => m.content.some(b => b.type === 'text' && (b as any).text === 'recent question'))).toBe(true)
  })
})

// ============ TieredCompact ============

describe('TieredCompact', () => {
  it('returns phase 0 when tokens < budget * 0.75', () => {
    const strategy = new TieredCompact()
    const messages = [userMsg('short')]
    const result = strategy.compact(messages, 1000)

    expect(result.phase).toBe(0)
    expect(result.messages).toEqual(messages)
  })

  it('Phase 1: truncates long tool results (>2000 chars) at >=75% budget', () => {
    const strategy = new TieredCompact({ keepRecent: 2, phaseThresholds: [0.75, 0.85, 0.95], toolResultTruncateLen: 2000 })

    // Long tool result to push tokens over 75% of budget=100 (75 tokens)
    // 2001 chars = ~501 tokens for the content alone
    const longResult = 'y'.repeat(2001)
    const messages: Message[] = [
      userMsg('read'),
      assistantToolCall('file_read', 'tu_1'),
      toolResultMsg('tu_1', longResult),
    ]
    const result = strategy.compact(messages, 100)

    expect(result.phase).toBeGreaterThanOrEqual(1)
    // Tool result should be truncated
    const toolResultBlock = result.messages[2].content[0] as any
    expect(toolResultBlock.content).toContain('[Truncated:')
    expect(toolResultBlock.content).toContain('2001')
  })

  it('Phase 2: removes tool results at >=85% budget', () => {
    const strategy = new TieredCompact({
      keepRecent: 2,
      phaseThresholds: [0.75, 0.85, 0.95],
      toolResultTruncateLen: 2000,
    })

    // Create enough content to stay above 85% even after phase 1 truncation
    // After phase 1 truncation, we need > 85 tokens for budget=100
    // We need multiple large messages
    const messages: Message[] = [
      userMsg('a'.repeat(400)),   // ~100 tokens
      assistantToolCall('file_read', 'tu_1'),
      toolResultMsg('tu_1', 'z'.repeat(2001)),  // will be truncated in phase 1
    ]
    const result = strategy.compact(messages, 100)

    // After phase 1 truncation, the long result becomes short, but the user msg is still ~100 tokens
    // So it should trigger phase 2
    expect(result.phase).toBeGreaterThanOrEqual(2)
    const toolResultBlock = result.messages[2].content[0] as any
    expect(toolResultBlock.content).toContain('[Result removed]')
  })

  it('Phase 3: keeps only first user message + last 2 rounds at >=95% budget', () => {
    const strategy = new TieredCompact({
      keepRecent: 2,
      phaseThresholds: [0.75, 0.85, 0.95],
      toolResultTruncateLen: 2000,
    })

    // Build lots of content to hit phase 3
    const messages: Message[] = [
      userMsg('first question'),
      assistantTextMsg('first answer'),
      userMsg('second question'),
      assistantTextMsg('second answer'),
      userMsg('third question'),
      assistantToolCall('file_read', 'tu_1'),
      toolResultMsg('tu_1', 'z'.repeat(2001)),
      // Recent: last 2 rounds
      userMsg('recent question'),
      assistantTextMsg('recent answer'),
    ]
    const result = strategy.compact(messages, 100)

    expect(result.phase).toBe(3)
    // First user message should be preserved
    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: 'first question' })
    // Recent messages should be present
    expect(result.messages.some(m => m.content.some(b => b.type === 'text' && (b as any).text === 'recent question'))).toBe(true)
    // Total messages should be limited
    // first user msg + last 4 messages (2 rounds) = 5 max
    expect(result.messages.length).toBeLessThanOrEqual(5)
  })

  it('always preserves the first user message', () => {
    const strategy = new TieredCompact({
      keepRecent: 1,
      phaseThresholds: [0.1, 0.2, 0.3], // very low thresholds to force phase 3
      toolResultTruncateLen: 10,
    })

    const messages: Message[] = [
      userMsg('important first message'),
      assistantTextMsg('answer'),
      userMsg('q2'),
      assistantTextMsg('a2'),
    ]
    const result = strategy.compact(messages, 100)

    expect(result.messages[0].content[0]).toEqual({ type: 'text', text: 'important first message' })
  })

  it('uses default options when none provided', () => {
    const strategy = new TieredCompact()
    const messages = [userMsg('hello')]
    const result = strategy.compact(messages, 1000)

    expect(result.phase).toBe(0)
  })
})
