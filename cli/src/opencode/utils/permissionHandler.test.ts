import { describe, expect, it, vi } from 'vitest';
import type { ApiSessionClient } from '@/api/apiSession';
import type { AgentBackend, PermissionRequest, PermissionResponse } from '@/agent/types';
import { OpencodePermissionHandler } from './permissionHandler';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}));

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createHarness(getPermissionMode: () => 'default' | 'plan' | 'yolo' = () => 'default') {
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };
    const rpcHandlers = new Map<string, (params: unknown) => Promise<unknown> | unknown>();
    let permissionHandler: ((request: PermissionRequest) => void) | null = null;
    let permissionCancelled: ((id: string) => void) | null = null;
    const respondCalls: Array<{
        sessionId: string;
        request: PermissionRequest;
        response: PermissionResponse;
    }> = [];

    const session = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => Promise<unknown> | unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        }
    } as unknown as ApiSessionClient;

    const backend: AgentBackend = {
        async initialize() {},
        async newSession() {
            return 'agent-session';
        },
        async prompt() {},
        async cancelPrompt() {},
        async respondToPermission(sessionId, request, response) {
            respondCalls.push({ sessionId, request, response });
        },
        onPermissionRequest(handler) {
            permissionHandler = handler;
        },
        onPermissionCancelled(handler) {
            permissionCancelled = handler;
        },
        async disconnect() {}
    };

    new OpencodePermissionHandler(session, backend, getPermissionMode);

    return {
        rpcHandlers,
        respondCalls,
        getAgentState: () => agentState,
        emitPermissionRequest(request: PermissionRequest) {
            if (!permissionHandler) {
                throw new Error('Permission handler was not registered');
            }
            permissionHandler(request);
        },
        emitPermissionCancelled(id: string) {
            if (!permissionCancelled) throw new Error('Permission cancellation handler was not registered');
            permissionCancelled(id);
        }
    };
}

async function flushAsyncWork(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function buildRequest(overrides?: Partial<PermissionRequest>): PermissionRequest {
    return {
        id: 'perm-1',
        sessionId: 'session-1',
        toolCallId: 'perm-1',
        title: 'Write',
        rawInput: { path: 'file.ts' },
        options: [
            {
                optionId: 'allow-once',
                name: 'Allow once',
                kind: 'allow_once'
            },
            {
                optionId: 'reject-once',
                name: 'Reject once',
                kind: 'reject_once'
            }
        ],
        ...overrides
    };
}

describe('OpencodePermissionHandler plan mode', () => {
    it('denies non-auto-approved tool requests instead of queueing them', async () => {
        const harness = createHarness(() => 'plan');

        harness.emitPermissionRequest(buildRequest());
        await flushAsyncWork();

        expect(harness.respondCalls).toEqual([
            {
                sessionId: 'session-1',
                request: expect.objectContaining({ id: 'perm-1', title: 'Write' }),
                response: { outcome: 'selected', optionId: 'reject-once' }
            }
        ]);
        expect(harness.getAgentState().requests).toEqual({});
        expect(harness.getAgentState().completedRequests).toMatchObject({
            'perm-1': {
                tool: 'Write',
                status: 'denied',
                decision: 'denied',
                reason: 'Plan mode blocks tool execution'
            }
        });
    });

    it('cancels plan-mode requests when OpenCode offers no reject option', async () => {
        const harness = createHarness(() => 'plan');

        harness.emitPermissionRequest(buildRequest({
            id: 'perm-no-reject',
            options: [
                {
                    optionId: 'allow-once',
                    name: 'Allow once',
                    kind: 'allow_once'
                }
            ]
        }));
        await flushAsyncWork();

        expect(harness.respondCalls).toEqual([
            {
                sessionId: 'session-1',
                request: expect.objectContaining({ id: 'perm-no-reject' }),
                response: { outcome: 'cancelled' }
            }
        ]);
        expect(harness.getAgentState().completedRequests).toMatchObject({
            'perm-no-reject': {
                status: 'canceled',
                decision: 'abort'
            }
        });
    });

    it('still auto-approves hapi title updates in plan mode', async () => {
        const harness = createHarness(() => 'plan');

        harness.emitPermissionRequest(buildRequest({
            id: 'perm-title',
            toolCallId: 'perm-title',
            title: 'hapi_change_title',
            rawInput: { title: 'Planning' }
        }));
        await flushAsyncWork();

        expect(harness.respondCalls).toEqual([
            {
                sessionId: 'session-1',
                request: expect.objectContaining({ id: 'perm-title', title: 'hapi_change_title' }),
                response: { outcome: 'selected', optionId: 'allow-once' }
            }
        ]);
        expect(harness.getAgentState().requests).toEqual({});
        expect(harness.getAgentState().completedRequests).toMatchObject({
            'perm-title': {
                tool: 'hapi_change_title',
                status: 'approved',
                decision: 'approved'
            }
        });
    });
});

describe('PAC interactive questions', () => {
    it.each(['yolo', 'plan'] as const)('asks the user in %s mode and preserves answers', async (mode) => {
        const harness = createHarness(() => mode);
        harness.emitPermissionRequest(buildRequest({ title: 'AskUserQuestion', pacQuestion: true, rawInput: { questions: [{ question: 'Pick?' }] } }));
        await flushAsyncWork();
        expect(harness.respondCalls).toEqual([]);
        expect(harness.getAgentState().requests).toHaveProperty('perm-1');
        await harness.rpcHandlers.get('permission')!({ id: 'perm-1', approved: true, answers: { '0': ['one', 'two'] } });
        expect(harness.respondCalls[0].response).toEqual({ outcome: 'selected', optionId: 'allow-once', pacAnswers: { '0': ['one', 'two'] } });
        expect(harness.getAgentState().completedRequests).toMatchObject({ 'perm-1': { answers: { '0': ['one', 'two'] } } });
    });

    it('cancels an approval with no answers', async () => {
        const harness = createHarness();
        harness.emitPermissionRequest(buildRequest({ title: 'AskUserQuestion', pacQuestion: true }));
        await harness.rpcHandlers.get('permission')!({ id: 'perm-1', approved: true });
        expect(harness.respondCalls[0].response).toEqual({ outcome: 'cancelled' });
        expect(harness.getAgentState().completedRequests).toMatchObject({ 'perm-1': { status: 'canceled' } });
    });

    it('propagates rejection without submitting an answer', async () => {
        const harness = createHarness(() => 'yolo');
        harness.emitPermissionRequest(buildRequest({ title: 'AskUserQuestion', pacQuestion: true }));
        await harness.rpcHandlers.get('permission')!({ id: 'perm-1', approved: false, decision: 'denied' });
        expect(harness.respondCalls[0].response).toEqual({ outcome: 'selected', optionId: 'reject-once' });
        expect(harness.getAgentState().completedRequests).toMatchObject({ 'perm-1': { status: 'denied' } });
    });
});

describe('PAC source permission cancellation', () => {
    it('cancels only the matching pending request', async () => {
        const harness = createHarness();
        harness.emitPermissionRequest(buildRequest({ id: 'first', toolCallId: 'first' }));
        harness.emitPermissionRequest(buildRequest({ id: 'second', toolCallId: 'second' }));
        harness.emitPermissionCancelled('first');
        await flushAsyncWork();
        expect(harness.respondCalls).toEqual([{ sessionId: 'session-1', request: expect.objectContaining({ id: 'first' }), response: { outcome: 'cancelled' } }]);
        expect(harness.getAgentState().requests).not.toHaveProperty('first');
        expect(harness.getAgentState().requests).toHaveProperty('second');
        expect(harness.getAgentState().completedRequests).toMatchObject({ first: { status: 'canceled', decision: 'abort' } });
    });
});
