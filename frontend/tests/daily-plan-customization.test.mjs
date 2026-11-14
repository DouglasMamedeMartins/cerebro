import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { DailyPlanCustomizationCoordinator } from '../src/hooks/dailyPlanCustomizationCoordinator.ts'
import { ApiError } from '../src/services/api.ts'

const coordinatorSource = await readFile(new URL('../src/hooks/dailyPlanCustomizationCoordinator.ts', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
const hookSource = await readFile(new URL('../src/hooks/useDailyStudyPlan.ts', import.meta.url), 'utf8')
const recommendationsSource = await readFile(new URL('../src/components/StudyPlanRecommendations.tsx', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../src/components/StudyPlanPage.tsx', import.meta.url), 'utf8')
const manualFormSource = await readFile(new URL('../src/components/ManualPlanActivityForm.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('as quatro operações usam as rotas reais e enviam Idempotency-Key', () => {
  for (const route of [
    '/reorder', '/items/${encodeURIComponent(itemId)}/duration', '/items', '/items/${encodeURIComponent(itemId)}/unschedule',
  ]) assert.ok(apiSource.includes(route))
  assert.match(apiSource, /'Idempotency-Key': idempotencyKey/)
  assert.match(apiSource, /JSON\.stringify\(body\)/)
  assert.match(apiSource, /idempotencyKey, \{ itemIds \}\)/)
  assert.match(apiSource, /idempotencyKey, \{ plannedDurationMinutes \}\)/)
  assert.match(apiSource, /idempotencyKey, payload\)/)
})

test('a projeção mantém campos do snapshot separados da personalização e aceita origem manual', () => {
  assert.match(apiSource, /recommendationSource: 'best_action' \| 'additional_topic' \| 'manual'/)
  assert.match(apiSource, /plannedDurationMinutes: number/)
  assert.match(hookSource, /personalization\?\.presentationOrder/)
  assert.match(hookSource, /personalization\?\.plannedDurationMinutes/)
  assert.match(hookSource, /unscheduledActivities/)
})

test('itens retirados ficam em seção histórica separada com execução preservada', () => {
  assert.match(pageSource, /Fora da programação/)
  assert.match(pageSource, /execution\?\.executedMinutes/)
  assert.match(pageSource, /execution\?\.sessionCount/)
  assert.match(pageSource, /personalization\?\.plannedDurationMinutes/)
})

test('a inclusão manual usa tópicos da conta autenticada e os tipos aceitos pela API', () => {
  assert.match(manualFormSource, /candidateApi\.getTopics\(candidateId\)/)
  for (const type of ['study', 'review', 'questions', 'mixed', 'maintenance']) assert.ok(manualFormSource.includes(`'${type}'`))
  assert.match(manualFormSource, /2_147_483_647/)
  assert.match(manualFormSource, /presentationOrder/)
  assert.match(recommendationsSource, /Adicionada manualmente/)
})

test('Dashboard e página completa continuam consumindo a mesma instância do hook', () => {
  assert.match(appSource, /const dailyStudyPlan = useDailyStudyPlan\(candidate\?\.id\)/)
  assert.match(appSource, /<StudyPlan plan=\{dailyStudyPlan\}/)
  assert.match(appSource, /<StudyPlanPage plan=\{dailyStudyPlan\}/)
  assert.match(hookSource, /studyPlanApi\.getDetails\(result\.plan\.id\)/)
  assert.match(hookSource, /setPlan\(result\.plan\)/)
  assert.match(hookSource, /studyPlanApi\.addActivity\(planId, \{[\s\S]*topicId: request\.topicId/)
  assert.doesNotMatch(hookSource, /studyPlanApi\.addActivity\(planId, request, key\)/)
})

test('reordenação, duração e retirada repetem a chave e o payload original após falha transitória', async () => {
  for (const request of [
    { operation: 'reorder', itemIds: ['a', 'b', 'c'] },
    { operation: 'duration', itemId: 'a', plannedDurationMinutes: 55 },
    { operation: 'unschedule', itemId: 'b' },
    { operation: 'add', topicId: 'topic', activityType: 'review', plannedDurationMinutes: 30, presentationOrder: 2 },
  ]) {
    const coordinator = new DailyPlanCustomizationCoordinator()
    const calls = []
    await coordinator.start(request, () => 'same-uuid', async (payload, key) => {
      calls.push({ payload: structuredClone(payload), key })
      throw new ApiError('timeout', 408)
    })
    assert.equal(coordinator.snapshot().status, 'retryable')
    await coordinator.retry(async (payload, key) => {
      calls.push({ payload: structuredClone(payload), key })
    })
    assert.deepEqual(calls, [
      { payload: request, key: 'same-uuid' },
      { payload: request, key: 'same-uuid' },
    ])
    assert.equal(coordinator.snapshot().status, 'success')
  }
})

test('HTTP 409 preserva o conflito e impede retry automático ou operação concorrente', async () => {
  const coordinator = new DailyPlanCustomizationCoordinator()
  let uuidCalls = 0
  const request = { operation: 'unschedule', itemId: 'item-1' }
  await coordinator.start(request, () => `uuid-${++uuidCalls}`, async () => { throw new ApiError('stale plan', 409) })
  assert.equal(coordinator.snapshot().status, 'conflict')
  assert.equal(await coordinator.retry(async () => {}), false)
  assert.equal(await coordinator.start({ operation: 'duration', itemId: 'item-1', plannedDurationMinutes: 45 }, () => `uuid-${++uuidCalls}`, async () => {}), false)
  assert.equal(uuidCalls, 1)
  assert.equal(coordinator.close(), true)
})

test('uma nova operação lógica recebe UUID independente depois do sucesso', async () => {
  const coordinator = new DailyPlanCustomizationCoordinator()
  let uuidCalls = 0
  const keys = []
  await coordinator.start({ operation: 'duration', itemId: 'item-1', plannedDurationMinutes: 45 }, () => `uuid-${++uuidCalls}`, async (_request, key) => keys.push(key))
  await coordinator.start({ operation: 'duration', itemId: 'item-1', plannedDurationMinutes: 50 }, () => `uuid-${++uuidCalls}`, async (_request, key) => keys.push(key))
  assert.deepEqual(keys, ['uuid-1', 'uuid-2'])
})

test('bloqueia duplo envio enquanto a personalização está em andamento', async () => {
  const coordinator = new DailyPlanCustomizationCoordinator()
  let resolveRequest
  let uuidCalls = 0
  const pending = coordinator.start({ operation: 'reorder', itemIds: ['a', 'b'] }, () => `uuid-${++uuidCalls}`, () => new Promise((resolve) => { resolveRequest = resolve }))
  assert.equal(coordinator.snapshot().status, 'sending')
  assert.equal(await coordinator.start({ operation: 'unschedule', itemId: 'a' }, () => `uuid-${++uuidCalls}`, async () => {}), false)
  assert.equal(uuidCalls, 1)
  resolveRequest()
  await pending
  assert.equal(coordinator.snapshot().status, 'success')
})

test('a interface confirma retirada, diferencia duração planejada e bloqueia terminais', () => {
  assert.match(recommendationsSource, /window\.confirm\(`Retirar/)
  assert.match(recommendationsSource, /Planejado/)
  assert.match(recommendationsSource, /recomendado/)
  assert.match(recommendationsSource, /terminal \|\| position/)
  assert.match(recommendationsSource, /Retirar da programação/)
  assert.match(recommendationsSource, /operation: 'reorder', itemIds: next\.map\(\(activity\) => activity\.id\)/)
  assert.match(recommendationsSource, /movable = activities\.filter/)
})
