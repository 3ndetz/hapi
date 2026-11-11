import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { PacTaskControls } from './PacTaskControls'

describe('PacTaskControls', () => {
    it('does not render task controls when no background tasks are active', () => {
        const view = render(<I18nProvider><PacTaskControls tasks={[]} onStop={vi.fn()} /></I18nProvider>)
        expect(view.container).toBeEmptyDOMElement()
    })

    it('requests a stop for the selected task and reports the pending outcome', async () => {
        let finish!: () => void
        const onStop = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
        render(<I18nProvider><PacTaskControls tasks={[{ id: 'pac:child', type: 'agent', description: 'Research' }]} onStop={onStop} /></I18nProvider>)
        fireEvent.click(screen.getByText('PAC background tasks · 1'))
        const button = screen.getByRole('button', { name: 'Stop: Research' })
        fireEvent.click(button)
        expect(onStop).toHaveBeenCalledExactlyOnceWith('pac:child')
        expect(button).toBeDisabled()
        finish()
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Stop requested'))
        expect(button).toBeEnabled()
    })

    it('allows retry after a failed request', async () => {
        const onStop = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
        render(<I18nProvider><PacTaskControls tasks={[{ id: 'pac:child', type: 'agent', description: 'Research' }]} onStop={onStop} /></I18nProvider>)
        fireEvent.click(screen.getByText('PAC background tasks · 1'))
        const button = screen.getByRole('button', { name: 'Stop: Research' })
        fireEvent.click(button)
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Stop could not be confirmed'))
        fireEvent.click(button)
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Stop requested'))
        expect(onStop).toHaveBeenCalledTimes(2)
    })
})
