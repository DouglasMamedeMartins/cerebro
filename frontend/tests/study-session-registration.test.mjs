import assert from 'node:assert/strict'
import { test } from 'node:test'
import { StudySessionRegistrationCoordinator } from '../src/hooks/studySessionRegistrationCoordinator.ts'

const payload = {
  candidateId: 'candidate-a',
  topicId: 'topic-a',
  durationMinutes: 42,
  studyPlanItemId: 'plan-item-a',
}

test('cria sessão com nova UUID e payload do item persistido', async () => {
  const calls = []
  const coordinator = new StudySessionRegistrationCoordinator(async (request, key) => {
    calls.push({ request, key })
    return { id: 'session-1', ...request, studiedAt: '2026-11-12T12:00:00.000Z' }
  }, () => {}, () => '00000000-0000-4000-8000-000000000001')

  assert.equal(coordinator.start('plan-item-a', payload), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, [{ request: payload, key: '00000000-0000-4000-8000-000000000001' }])
  assert.equal(coordinator.getSnapshot().get('plan-item-a').status, 'success')
})

test('falha de rede e retry preservam exatamente UUID e payload originais', async () => {
  const calls = []
  let callNumber = 0
  const coordinator = new StudySessionRegistrationCoordinator(async (request, key) => {
    calls.push({ request, key })
    if (callNumber++ === 0) throw { kind: 'network' }
    return { id: 'session-2', ...request, studiedAt: '2026-11-12T12:00:00.000Z' }
  }, () => {}, () => '00000000-0000-4000-8000-000000000002')

  coordinator.start('plan-item-a', payload)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(coordinator.getSnapshot().get('plan-item-a').status, 'retryable')
  assert.equal(coordinator.retry('plan-item-a'), true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, [
    { request: payload, key: '00000000-0000-4000-8000-000000000002' },
    { request: payload, key: '00000000-0000-4000-8000-000000000002' },
  ])
  assert.equal(coordinator.getSnapshot().get('plan-item-a').status, 'success')
})

test('após sucesso, a próxima sessão intencional recebe nova chave e atualiza o histórico', async () => {
  let uuid = 0
  let historyRefreshes = 0
  const keys = []
  const coordinator = new StudySessionRegistrationCoordinator(async (request, key) => {
    keys.push(key)
    return { id: `session-${keys.length}`, ...request, studiedAt: '2026-11-12T12:00:00.000Z' }
  }, () => { historyRefreshes += 1 }, () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`)

  coordinator.start('plan-item-a', payload)
  await new Promise((resolve) => setImmediate(resolve))
  coordinator.start('plan-item-a', { ...payload, durationMinutes: 10 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(keys, [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
  ])
  assert.equal(historyRefreshes, 2)
})

test('rejeita duração inválida e impede envio duplicado enquanto a operação está em andamento', async () => {
  let resolveRequest
  let requests = 0
  const coordinator = new StudySessionRegistrationCoordinator(() => {
    requests += 1
    return new Promise((resolve) => { resolveRequest = resolve })
  }, () => {}, () => '00000000-0000-4000-8000-000000000004')

  assert.throws(() => coordinator.start('plan-item-a', { ...payload, durationMinutes: 0 }), RangeError)
  assert.throws(() => coordinator.start('plan-item-a', { ...payload, durationMinutes: 1.5 }), RangeError)
  coordinator.start('plan-item-a', payload)
  assert.equal(coordinator.start('plan-item-a', payload), false)
  assert.equal(requests, 1)
  resolveRequest({ id: 'session-4', ...payload, studiedAt: '2026-11-12T12:00:00.000Z' })
  await new Promise((resolve) => setImmediate(resolve))
})

test('409 mantém tentativa bloqueada sem criar outra chave automaticamente', async () => {
  let uuidCalls = 0
  let requests = 0
  const coordinator = new StudySessionRegistrationCoordinator(async () => {
    requests += 1
    throw { status: 409 }
  }, () => {}, () => `uuid-${++uuidCalls}`)

  coordinator.start('plan-item-a', payload)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(coordinator.getSnapshot().get('plan-item-a').status, 'conflict')
  assert.equal(coordinator.start('plan-item-a', { ...payload, durationMinutes: 20 }), false)
  assert.equal(uuidCalls, 1)
  assert.equal(requests, 1)
  assert.equal(coordinator.close('plan-item-a'), true)
})
