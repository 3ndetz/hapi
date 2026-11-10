export function shouldRetryPacStartupNotification(startedBy: string | null | undefined, flavor: string | null | undefined, experimental: string | undefined): boolean {
    return startedBy === 'runner' && flavor === 'opencode' && experimental === '1'
}

export async function notifySessionStartedWithRetry(
    notify: () => Promise<{ error?: string } | undefined>,
    attempts: number,
    wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 500))
): Promise<{ error?: string }> {
    let result: { error?: string } = { error: 'Runner notification failed' }
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            result = (await notify()) ?? {}
        } catch (error) {
            result = { error: error instanceof Error ? error.message : String(error) }
        }
        if (!result.error) return result
        if (attempt + 1 < attempts) await wait()
    }
    return result
}
