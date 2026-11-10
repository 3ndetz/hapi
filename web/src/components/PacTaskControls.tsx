import { useRef, useState } from 'react'
import type { BackgroundTask } from '@/types/api'
import { useTranslation } from '@/lib/use-translation'

export function PacTaskControls({ tasks, onStop }: { tasks: readonly BackgroundTask[]; onStop: (taskId: string) => Promise<void> }) {
    const { t } = useTranslation()
    const pendingIds = useRef(new Set<string>())
    const [pending, setPending] = useState<string[]>([])
    const [requested, setRequested] = useState<string[]>([])
    const [failed, setFailed] = useState<string[]>([])

    if (!tasks.length) return null

    async function stop(taskId: string) {
        if (pendingIds.current.has(taskId)) return
        pendingIds.current.add(taskId)
        setPending((current) => [...current, taskId])
        setFailed((current) => current.filter((id) => id !== taskId))
        try {
            await onStop(taskId)
            setRequested((current) => current.includes(taskId) ? current : [...current, taskId])
        } catch {
            setFailed((current) => current.includes(taskId) ? current : [...current, taskId])
        } finally {
            pendingIds.current.delete(taskId)
            setPending((current) => current.filter((id) => id !== taskId))
        }
    }

    return (
        <details data-testid="pac-tasks" className="group mx-3 mt-3 rounded-md border border-[var(--app-border)] bg-[var(--app-subtle-bg)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--app-fg)] [&::-webkit-details-marker]:hidden">
                {t('session.pacTasks.title')} · {tasks.length}
                <span className="ml-auto text-[10px] text-[var(--app-hint)] transition-transform group-open:rotate-180" aria-hidden="true">▼</span>
            </summary>
            <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto border-t border-[var(--app-border)] px-3 py-2">
                {tasks.map((task) => (
                    <li key={task.id} className="flex min-w-0 items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="break-words text-sm text-[var(--app-fg)]">{task.description || task.id}</div>
                            {requested.includes(task.id) ? <div className="text-xs text-[var(--app-hint)]" role="status">{t('session.pacTasks.requested')}</div> : null}
                            {failed.includes(task.id) ? <div className="text-xs text-red-600" role="alert">{t('session.pacTasks.failed')}</div> : null}
                        </div>
                        <button type="button" data-testid="pac-stop-task" className="min-h-11 rounded-md border border-[var(--app-border)] px-3 text-xs font-medium text-[var(--app-fg)] disabled:opacity-50"
                            disabled={pending.includes(task.id)} aria-label={`${t('session.pacTasks.stop')}: ${task.description || task.id}`}
                            onClick={() => { void stop(task.id) }}>
                            {pending.includes(task.id) ? t('session.pacTasks.stopping') : t('session.pacTasks.stop')}
                        </button>
                    </li>
                ))}
            </ul>
        </details>
    )
}
