import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const apiSource = await readFile(new URL('../src/services/api.ts', import.meta.url), 'utf8')
const historySource = await readFile(new URL('../src/components/StudyPlanHistory.tsx', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../src/components/StudyPlanPage.tsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const hookSource = await readFile(new URL('../src/hooks/useDailyStudyPlan.ts', import.meta.url), 'utf8')

test('histórico consulta a listagem real com paginação e filtros opcionais', () => {
  assert.match(apiSource, /async list\(filters: \{ from\?: string; to\?: string; page\?: number; limit\?: number \}/)
  assert.match(apiSource, /request<unknown>\(`\/api\/study-plans\$\{suffix\}`\)/)
  assert.match(apiSource, /page: page\.page as number,[\s\S]*limit: page\.limit as number,[\s\S]*total: page\.total as number,[\s\S]*totalPages: page\.totalPages as number/)
  assert.match(historySource, /studyPlanApi\.list\(\{ page, limit: PAGE_SIZE \}\)/)
})

test('listagem apresenta somente os campos existentes na resposta do backend', () => {
  for (const field of ['planDate', 'version', 'availableMinutes', 'itemCount', 'generatedAt']) {
    assert.match(historySource, new RegExp(`plan\\.${field}`))
  }
  assert.doesNotMatch(historySource, /plan\.(candidateName|score|title|completionPercent)/)
})

test('selecionar uma versão busca seus detalhes persistidos pelo endpoint existente', () => {
  assert.match(historySource, /studyPlanApi\.getDetails\(planId\)/)
  assert.match(apiSource, /`\/api\/study-plans\/\$\{encodeURIComponent\(planId\)\}`/)
  assert.match(historySource, /selectedPlan && <HistoricalPlanDetails plan=\{selectedPlan\}/)
})

test('detalhes históricos separam programação ativa e atividades retiradas', () => {
  assert.match(historySource, /personalization\?\.isScheduled !== false/)
  assert.match(historySource, /personalization\?\.isScheduled === false/)
  assert.match(historySource, /Fora da programação/)
})

test('detalhes mostram personalização, execução, sessões, eventos e origem manual', () => {
  for (const pattern of [
    /recommendedDurationMinutes/,
    /plannedDurationMinutes/,
    /execution\?\.executedMinutes/,
    /execution\?\.sessionCount/,
    /execution\?\.lastSessionAt/,
    /execution\.events/,
    /recommendationSource === 'manual'/,
  ]) assert.match(historySource, pattern)
})

test('plano histórico é um componente independente do estado compartilhado do plano atual', () => {
  assert.match(pageSource, /<StudyPlanHistory currentPlanId=\{plan\.status === 'ready'[\s\S]*plan\.status === 'no-plan'[\s\S]*undefined\}/)
  assert.match(historySource, /useState<DailyStudyPlanSnapshot \| null>\(null\)/)
  assert.doesNotMatch(historySource, /useDailyStudyPlan|setPlan\(/)
  assert.match(historySource, /currentPlanId === undefined \? \[\]/)
  assert.match(hookSource, /studyPlanApi\.getCurrent\(\)/)
  assert.match(appSource, /const dailyStudyPlan = useDailyStudyPlan\(candidate\?\.id\)/)
})

test('consulta histórica é somente leitura e não recebe fluxo para novas sessões', () => {
  assert.doesNotMatch(historySource, /StudyPlanRecommendations|registration|studySessionApi|recordSession|customize\(/)
  assert.match(historySource, /CONSULTA SOMENTE LEITURA/)
  assert.match(historySource, /Plano anterior/)
})

test('paginação permite avançar e voltar dentro dos limites do servidor', () => {
  assert.match(historySource, /setPage\(\(value\) => Math\.max\(1, value - 1\)\)/)
  assert.match(historySource, /setPage\(\(value\) => Math\.min\(pagination\.totalPages, value \+ 1\)\)/)
  assert.match(historySource, /pagination\.page} de \{pagination\.totalPages/)
})

test('estados de carregamento, vazio e falhas de autorização/rede são apresentados', () => {
  assert.match(historySource, /Carregando histórico/)
  assert.match(historySource, /Ainda não há versões anteriores/)
  assert.match(historySource, /Sua sessão expirou/)
  assert.match(historySource, /não tem autorização/)
  assert.match(historySource, /Verifique a conexão/)
  assert.match(historySource, /Tentar novamente/)
})

test('seleção histórica não altera o plano atual e oferece retorno a ele', () => {
  assert.match(historySource, /setSelectedPlan\(details\)/)
  assert.doesNotMatch(historySource, /setPlan\(|refresh\(\)|loadCurrent\(/)
  assert.match(historySource, /Voltar ao plano atual/)
  assert.match(pageSource, /id="current-plan-title"/)
})
