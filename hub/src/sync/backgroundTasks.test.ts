import { describe, expect, it } from 'bun:test'
import { extractBackgroundTasks } from './backgroundTasks'

describe('extractBackgroundTasks', () => {
    it.each(['output', 'codex'])('accepts a %s agent snapshot', (type) => {
        expect(extractBackgroundTasks({ role: 'agent', content: { type, data: {
            type: 'system', subtype: 'background_tasks_changed',
            tasks: [{ task_id: 'pac:child', task_type: 'agent', description: 'Worker' }]
        } } })).toEqual([{ id: 'pac:child', type: 'agent', description: 'Worker' }])
    })

    it('rejects snapshots from users and unrelated payloads', () => {
        const data = { type: 'system', subtype: 'background_tasks_changed', tasks: [] }
        expect(extractBackgroundTasks({ role: 'user', content: { type: 'codex', data } })).toBeNull()
        expect(extractBackgroundTasks({ role: 'agent', content: { type: 'other', data } })).toBeNull()
    })
})
