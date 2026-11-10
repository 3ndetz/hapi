import { describe, expect, it, vi } from 'vitest'
import { notifySessionStartedWithRetry, shouldRetryPacStartupNotification } from './notifySessionStarted'

describe('runner startup notification retry', () => {
    it('limits retries to experimental runner-started OpenCode sessions', () => {
        expect(shouldRetryPacStartupNotification('runner', 'opencode', '1')).toBe(true)
        expect(shouldRetryPacStartupNotification('terminal', 'opencode', '1')).toBe(false)
        expect(shouldRetryPacStartupNotification('runner', 'claude', '1')).toBe(false)
        expect(shouldRetryPacStartupNotification('runner', 'opencode', undefined)).toBe(false)
    })
    it('retries failed notification and stops after acknowledgement', async () => {
        const notify = vi.fn<() => Promise<{ error?: string }>>()
            .mockResolvedValueOnce({ error: 'temporarily unavailable' })
            .mockRejectedValueOnce(new Error('timed out'))
            .mockResolvedValueOnce({})
        const wait = vi.fn(async () => {})
        await expect(notifySessionStartedWithRetry(notify, 5, wait)).resolves.toEqual({})
        expect(notify).toHaveBeenCalledTimes(3)
        expect(wait).toHaveBeenCalledTimes(2)
    })

    it('returns the final failure without retrying beyond the bound', async () => {
        const notify = vi.fn(async () => ({ error: 'unavailable' }))
        const wait = vi.fn(async () => {})
        await expect(notifySessionStartedWithRetry(notify, 2, wait)).resolves.toEqual({ error: 'unavailable' })
        expect(notify).toHaveBeenCalledTimes(2)
        expect(wait).toHaveBeenCalledOnce()
    })
})
