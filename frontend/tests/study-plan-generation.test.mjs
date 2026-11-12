import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PlanGenerationCoordinator } from '../src/hooks/dailyStudyPlanGeneration.ts'

test('primeira operação gera uma chave e repete a mesma chave e disponibilidade após falha de rede', async () => {
  const coordinator = new PlanGenerationCoordinator()
  let uuidCalls = 0
  const operation = coordinator.beginOrRetry(90, () => `uuid-${++uuidCalls}`)
  assert.deepEqual(operation, { idempotencyKey: 'uuid-1', availableMinutes: 90 })

  const failed = await coordinator.execute(async (minutes, key) => {
    assert.equal(minutes, 90)
    assert.equal(key, 'uuid-1')
    throw { kind: 'network' }
  })
  assert.equal(failed?.kind, 'retryable')
  assert.deepEqual(coordinator.pending, operation)

  const retryOperation = coordinator.beginOrRetry(150, () => `uuid-${++uuidCalls}`)
  assert.deepEqual(retryOperation, operation)
  const calls = []
  const success = await coordinator.execute(async (minutes, key) => {
    calls.push({ minutes, key })
    return { planId: 'saved-plan' }
  })
  assert.deepEqual(calls, [{ minutes: 90, key: 'uuid-1' }])
  assert.deepEqual(success, { kind: 'success', value: { planId: 'saved-plan' } })
  assert.equal(coordinator.pending, null)
})

test('sucesso encerra a operação e uma nova geração intencional recebe outra chave', async () => {
  const coordinator = new PlanGenerationCoordinator()
  let sequence = 0
  coordinator.beginOrRetry(60, () => `uuid-${++sequence}`)
  await coordinator.execute(async () => 'snapshot')
  assert.equal(coordinator.pending, null)
  assert.deepEqual(coordinator.beginOrRetry(120, () => `uuid-${++sequence}`), {
    idempotencyKey: 'uuid-2',
    availableMinutes: 120,
  })
})

test('NO_ACTION_AVAILABLE encerra sem repetição automática e conflito mantém a chave', async () => {
  const coordinator = new PlanGenerationCoordinator()
  let sequence = 0
  coordinator.beginOrRetry(30, () => `uuid-${++sequence}`)
  const noAction = await coordinator.execute(async () => { throw { code: 'NO_ACTION_AVAILABLE', status: 404 } })
  assert.equal(noAction?.kind, 'no-action')
  assert.equal(coordinator.pending, null)

  const conflictOperation = coordinator.beginOrRetry(30, () => `uuid-${++sequence}`)
  const conflict = await coordinator.execute(async () => { throw { code: 'IDEMPOTENCY_CONFLICT', status: 409 } })
  assert.equal(conflict?.kind, 'conflict')
  assert.deepEqual(coordinator.pending, conflictOperation)
  assert.deepEqual(coordinator.beginOrRetry(90, () => `uuid-${++sequence}`), conflictOperation)
  assert.equal(sequence, 2)
  assert.equal(coordinator.close(), true)
  assert.equal(coordinator.pending, null)
})

test('não inicia uma segunda geração enquanto o POST original está em andamento', async () => {
  const coordinator = new PlanGenerationCoordinator()
  coordinator.beginOrRetry(120, () => 'uuid-1')
  let resolveRequest
  const request = new Promise((resolve) => { resolveRequest = resolve })
  const first = coordinator.execute(() => request)
  assert.equal(coordinator.running, true)
  assert.equal(coordinator.beginOrRetry(60, () => 'uuid-2'), null)
  assert.equal(await coordinator.execute(async () => 'duplicate'), null)
  resolveRequest('saved')
  assert.deepEqual(await first, { kind: 'success', value: 'saved' })
})

test('408, 429 e 5xx mantêm a operação; erros definitivos também exigem encerramento explícito', async () => {
  for (const failure of [
    { status: 408 },
    { status: 429 },
    { status: 503 },
    { kind: 'response' },
  ]) {
    const coordinator = new PlanGenerationCoordinator()
    const operation = coordinator.beginOrRetry(75, () => 'same-key')
    const outcome = await coordinator.execute(async () => { throw failure })
    assert.equal(outcome?.kind, 'retryable')
    assert.deepEqual(coordinator.pending, operation)
  }

  const coordinator = new PlanGenerationCoordinator()
  const operation = coordinator.beginOrRetry(75, () => 'same-key')
  const outcome = await coordinator.execute(async () => { throw { status: 400, code: 'INVALID_INPUT' } })
  assert.equal(outcome?.kind, 'definitive')
  assert.deepEqual(coordinator.pending, operation)
  assert.equal(coordinator.close(), true)
})
