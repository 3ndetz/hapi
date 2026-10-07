import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

/** Windows readers can briefly deny replacing an existing file. Keep both
 * files intact until an atomic rename succeeds; never unlink the destination. */
export async function renameWithRetry(source: string, destination: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try {
            await rename(source, destination);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 19) {
                throw error;
            }
            await delay(Math.min(10 * 2 ** attempt, 100));
        }
    }
}
