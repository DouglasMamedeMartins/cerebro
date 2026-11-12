export type DashboardSection = 'Visão geral' | 'Plano de estudos' | 'Questões' | 'Revisões' | 'Desempenho'

export const navigationItems: { label: DashboardSection; icon: 'overview' | 'plan' | 'questions' | 'reviews' | 'performance' }[] = [
  { label: 'Visão geral', icon: 'overview' },
  { label: 'Plano de estudos', icon: 'plan' },
  { label: 'Questões', icon: 'questions' },
  { label: 'Revisões', icon: 'reviews' },
  { label: 'Desempenho', icon: 'performance' },
]

export const metrics = [
  { key: 'answered' as const, label: 'Questões respondidas', value: null, note: 'no total', icon: 'questions' as const, tone: 'blue' },
  { key: 'accuracy' as const, label: 'Aproveitamento', value: null, note: 'percentual geral', icon: 'target' as const, tone: 'cyan' },
  { key: 'streak' as const, label: 'Sequência de estudos', value: null, note: 'sequência atual', icon: 'calendar' as const, tone: 'violet' },
  { key: 'studyTime' as const, label: 'Tempo de estudo', value: null, note: 'tempo acumulado', icon: 'clock' as const, tone: 'teal' },
]

export const studyActivities = [
  { subject: 'Direito Constitucional', topic: 'Direitos e garantias fundamentais', duration: '25 min', state: 'Próxima', tone: 'blue' },
  { subject: 'Direito Penal', topic: 'Teoria do crime', duration: '30 min', state: 'Planejada', tone: 'violet' },
  { subject: 'Legislação aplicada à PMDF', topic: 'Revisão de tópicos prioritários', duration: '20 min', state: 'Planejada', tone: 'teal' },
]

export type StudyStatus = 'Concluída' | 'Em andamento' | 'Planejada'
export type StudyPlanActivity = {
  id: string
  subject: string
  topic: string
  durationMinutes: number
  status: StudyStatus
  progress: number
}

export const studyPlanActivities: StudyPlanActivity[] = [
  { id: 'constitutional-rights', subject: 'Direito Constitucional', topic: 'Direitos e garantias fundamentais', durationMinutes: 25, status: 'Em andamento', progress: 60 },
  { id: 'penal-crime', subject: 'Direito Penal', topic: 'Teoria do crime', durationMinutes: 30, status: 'Planejada', progress: 0 },
  { id: 'pmdf-law', subject: 'Legislação aplicada à PMDF', topic: 'Revisão de tópicos prioritários', durationMinutes: 20, status: 'Planejada', progress: 0 },
  { id: 'administrative-acts', subject: 'Direito Administrativo', topic: 'Atos administrativos', durationMinutes: 25, status: 'Concluída', progress: 100 },
  { id: 'criminal-procedure', subject: 'Direito Processual Penal', topic: 'Inquérito policial', durationMinutes: 30, status: 'Concluída', progress: 100 },
]

export type DemoQuestion = {
  subject: string
  topic: string
  prompt: string
  options: { id: string; text: string }[]
  correctOptionId: string
  explanation: string
}

export const demoQuestions: DemoQuestion[] = [
  {
    subject: 'Direito Constitucional',
    topic: 'Direitos e garantias fundamentais',
    prompt: 'Nos termos da Constituição Federal, qual alternativa apresenta um direito social expressamente previsto no art. 6º?',
    options: [
      { id: 'a', text: 'Propriedade industrial.' },
      { id: 'b', text: 'Transporte.' },
      { id: 'c', text: 'Livre associação profissional.' },
      { id: 'd', text: 'Direito de petição.' },
    ],
    correctOptionId: 'b',
    explanation: 'O art. 6º inclui o transporte entre os direitos sociais. Este item é demonstrativo e não representa uma questão oficial.',
  },
  {
    subject: 'Direito Penal',
    topic: 'Teoria do crime',
    prompt: 'Na estrutura analítica tripartida do crime, quais são os seus elementos?',
    options: [
      { id: 'a', text: 'Tipicidade, ilicitude e culpabilidade.' },
      { id: 'b', text: 'Conduta, resultado e nexo causal, exclusivamente.' },
      { id: 'c', text: 'Dolo, culpa e punibilidade.' },
      { id: 'd', text: 'Imputabilidade, potencial consciência da ilicitude e exigibilidade de conduta diversa.' },
    ],
    correctOptionId: 'a',
    explanation: 'A concepção tripartida reúne fato típico, ilicitude e culpabilidade. Este item é apenas demonstrativo.',
  },
  {
    subject: 'Legislação aplicada à PMDF',
    topic: 'Organização institucional',
    prompt: 'Em um estudo de legislação institucional, qual prática ajuda a conferir se a norma consultada está atualizada?',
    options: [
      { id: 'a', text: 'Usar somente resumos sem indicar a fonte.' },
      { id: 'b', text: 'Consultar a publicação oficial e verificar alterações posteriores.' },
      { id: 'c', text: 'Presumir que toda reprodução online está vigente.' },
      { id: 'd', text: 'Desconsiderar a data de publicação da norma.' },
    ],
    correctOptionId: 'b',
    explanation: 'Conferir a fonte oficial e alterações posteriores é uma forma responsável de estudar normas. Este item é demonstrativo.',
  },
]

export type DemoReview = {
  id: string
  title: string
  subject: string
  priority: 'Alta' | 'Média' | 'Atenção'
  estimatedMinutes: number
}

export const reviewQueue: DemoReview[] = [
  { id: 'constitutional-control', title: 'Controle de constitucionalidade', subject: 'Direito Constitucional', priority: 'Alta', estimatedMinutes: 20 },
  { id: 'people-concurrence', title: 'Concurso de pessoas', subject: 'Direito Penal', priority: 'Média', estimatedMinutes: 15 },
  { id: 'administrative-acts-review', title: 'Atos administrativos', subject: 'Direito Administrativo', priority: 'Atenção', estimatedMinutes: 18 },
  { id: 'fundamental-rights-review', title: 'Direitos e garantias fundamentais', subject: 'Direito Constitucional', priority: 'Alta', estimatedMinutes: 22 },
]

export const performanceHistory = [
  { label: 'Sem 1', score: 62 },
  { label: 'Sem 2', score: 67 },
  { label: 'Sem 3', score: 65 },
  { label: 'Sem 4', score: 71 },
  { label: 'Sem 5', score: 74 },
  { label: 'Sem 6', score: 78 },
]

export const performanceBySubject = [
  { subject: 'Direito Constitucional', score: 84, answered: 320 },
  { subject: 'Direito Penal', score: 78, answered: 286 },
  { subject: 'Direito Administrativo', score: 73, answered: 214 },
  { subject: 'Legislação aplicada à PMDF', score: 69, answered: 188 },
  { subject: 'Direito Processual Penal', score: 64, answered: 276 },
]
