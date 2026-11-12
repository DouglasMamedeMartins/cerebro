import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { DailyPlanDecisionCoordinator } from '../src/hooks/dailyPlanDecisionCoordinator.ts'
const uiSource = await readFile(new URL('../src/components/StudyPlanRecommendations.tsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const hookSource = await readFile(new URL('../src/hooks/useDailyStudyPlan.ts', import.meta.url), 'utf8')

test('a interface mapeia os cinco estados e apresenta recomendação, execução e sessões', () => {
  for (const [status, label] of Object.entries({ not_started: 'Não iniciado', in_progress: 'Em andamento', completed: 'Concluído', ignored: 'Ignorado', replaced: 'Substituído' })) {
    assert.match(uiSource, new RegExp(`${status}: '${label}'`))
  }
  for (const field of ['Recomendado', 'Executado', 'Sessões', 'Última sessão']) assert.ok(uiSource.includes(field))
})

test('mantém percentual numérico acima de 100 e limita somente a barra visual', () => {
  assert.match(uiSource, /\{execution\.recommendedTimePercent\}%/)
  assert.match(uiSource, /Math\.min\(100, execution\.recommendedTimePercent\)/)
})

test('expõe as rotas reais complete, ignore e replace, com replacementTopicId e Idempotency-Key', () => {
  for (const endpoint of ["'complete'", "'ignore'", "'replace'"]) assert.ok(apiSource.includes(endpoint))
  assert.match(apiSource, /'Idempotency-Key': idempotencyKey/)
  assert.match(apiSource, /JSON\.stringify\(\{ replacementTopicId \}\)/)
  assert.match(uiSource, /window\.confirm\(/)
})

test('visão geral e página completa usam o mesmo hook e recarregam detalhes da projeção', () => {
  assert.match(appSource, /const dailyStudyPlan = useDailyStudyPlan\(candidate\?\.id\)/)
  assert.match(appSource, /<StudyPlan plan=\{dailyStudyPlan\}/)
  assert.match(appSource, /<StudyPlanPage plan=\{dailyStudyPlan\}/)
  assert.match(hookSource, /studyPlanApi\.getDetails\(plan\.plan\.id\)/)
})

test('decisões do mesmo coordenador/item compartilham operação e preservam chave/payload para retry', async () => {
  const coordinator = new DailyPlanDecisionCoordinator()
  const keys = ['key-1', 'key-2']
  const calls = []
  await coordinator.start('item-1', 'replaced', 'topic-2', () => keys.shift(), async (...args) => { calls.push(args); throw new Error('network') })
  assert.equal(coordinator.snapshot().get('item-1').status, 'failed')
  assert.equal(await coordinator.start('item-1', 'ignored', undefined, () => 'key-2', async () => {}), false)
  assert.equal(calls[0][1], 'key-1')
  assert.equal(calls[0][2], 'topic-2')
  assert.equal(coordinator.close('item-1'), true)
})

test('falhas transitórias repetem a mesma chave e HTTP 409 não inicia outra decisão', async () => {
  const coordinator = new DailyPlanDecisionCoordinator()
  const { ApiError } = await import('../src/services/api.ts')
  const calls = []
  await coordinator.start('item-1', 'completed', undefined, () => 'same-key', async (...args) => { calls.push(args); throw new ApiError('timeout', 408) })
  assert.equal(coordinator.snapshot().get('item-1').status, 'retryable')
  await coordinator.retry('item-1', async (...args) => { calls.push(args); throw new ApiError('conflict', 409) })
  assert.equal(coordinator.snapshot().get('item-1').status, 'conflict')
  assert.deepEqual(calls.map((call) => call[1]), ['same-key', 'same-key'])
  assert.equal(await coordinator.start('item-1', 'ignored', undefined, () => 'new-key', async () => {}), false)
})

test('após sucesso, operação nova recebe chave independente', async () => {
  const coordinator = new DailyPlanDecisionCoordinator()
  const used = []
  await coordinator.start('item-1', 'completed', undefined, () => 'first', async (_decision, key) => used.push(key))
  await coordinator.start('item-1', 'ignored', undefined, () => 'second', async (_decision, key) => used.push(key))
  assert.deepEqual(used, ['first', 'second'])
})
