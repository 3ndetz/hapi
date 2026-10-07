import { afterEach, describe, expect, it, vi } from 'vitest';
import { renameWithRetry } from './renameWithRetry';
import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
vi.mock('node:fs/promises', () => ({ rename: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const platform = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: platform }); vi.restoreAllMocks(); vi.mocked(rename).mockReset(); vi.mocked(delay).mockClear(); });
describe('atomic rename retry', () => {
    it('retries Windows sharing violations and replaces without deleting either file', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EPERM' }))
            .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' })).mockResolvedValue(undefined);
        await renameWithRetry('temporary', 'owner.json');
        expect(rename).toHaveBeenCalledTimes(3);
        expect(rename).toHaveBeenLastCalledWith('temporary', 'owner.json');
        expect(delay).toHaveBeenNthCalledWith(1, 10);
        expect(delay).toHaveBeenNthCalledWith(2, 20);
    });
    it('bounds a persistent access failure and preserves the original error', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        const error = Object.assign(new Error('denied'), { code: 'EACCES' });
        vi.mocked(rename).mockRejectedValue(error);
        await expect(renameWithRetry('temporary', 'owner.json')).rejects.toBe(error);
        expect(rename).toHaveBeenCalledTimes(20);
        expect(delay).toHaveBeenCalledTimes(19);
    });
    it('does not retry missing files or Unix errors', async () => {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        vi.mocked(rename).mockRejectedValue(error);
        await expect(renameWithRetry('temporary', 'owner.json')).rejects.toBe(error);
        expect(rename).toHaveBeenCalledTimes(1);
        expect(delay).not.toHaveBeenCalled();
        vi.mocked(rename).mockClear();
        Object.defineProperty(process, 'platform', { value: 'linux' });
        vi.mocked(rename).mockRejectedValue(Object.assign(new Error('denied'), { code: 'EPERM' }));
        await expect(renameWithRetry('temporary', 'owner.json')).rejects.toThrow('denied');
        expect(rename).toHaveBeenCalledTimes(1);
    });
});
