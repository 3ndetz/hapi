import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { OpencodeModelSelector } from './OpencodeModelSelector'

describe('OpencodeModelSelector', () => {
    it('uses the shared combobox interaction for discovered models', () => {
        const onModelChange = vi.fn()
        render(<I18nProvider>
            <OpencodeModelSelector
                cwd="/project"
                machineId="machine-1"
                isLoading={false}
                error={null}
                availableModels={[{ modelId: 'openai/gpt-5.4', name: 'GPT-5.4' }]}
                currentModelId="openai/gpt-5.4"
                selectedModel={null}
                onModelChange={onModelChange}
            />
        </I18nProvider>)

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'openai/gpt-5.4' } })
        expect(onModelChange).toHaveBeenCalledWith('openai/gpt-5.4')
    })

    it('offers and selects a named PAC model without changing its identifier', () => {
        const onModelChange = vi.fn()
        render(<I18nProvider>
            <OpencodeModelSelector
                cwd="/project"
                machineId="machine-1"
                isLoading={false}
                error={null}
                availableModels={[{ modelId: 'PAC_controller/sonnet', name: 'PAC controller Sonnet' }]}
                currentModelId={null}
                selectedModel={null}
                onModelChange={onModelChange}
            />
        </I18nProvider>)
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PAC_controller/sonnet' } })
        expect(onModelChange).toHaveBeenCalledWith('PAC_controller/sonnet')
    })

    it('keeps local models selectable and offers retry when a PAC is unavailable', () => {
        const onModelChange = vi.fn()
        const onRetry = vi.fn()
        render(<I18nProvider>
            <OpencodeModelSelector
                cwd="/project"
                machineId="machine-1"
                isLoading={false}
                error={null}
                pacDiscoveryWarnings={[{ name: 'offline', code: 'unavailable' }, { name: 'project', code: 'rule_frontmatter_unsupported' }]}
                availableModels={[{ modelId: 'local/model', name: 'Local model' }]}
                currentModelId={null}
                selectedModel={null}
                onModelChange={onModelChange}
                onRetry={onRetry}
            />
        </I18nProvider>)
        expect(screen.getByRole('status').textContent).toContain('offline')
        expect(screen.getByRole('status').textContent).toContain('frontmatter')
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'local/model' } })
        expect(onModelChange).toHaveBeenCalledWith('local/model')
        fireEvent.click(screen.getByRole('button', { name: /retry/i }))
        expect(onRetry).toHaveBeenCalledOnce()
    })
})
