import { ArrowRight, Check, CircleHelp, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { demoQuestions } from '../data/dashboard'
import { PageHeading } from './PageHeading'

export function QuestionsPage() {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const question = demoQuestions[questionIndex]
  const isCorrect = selectedOption === question.correctOptionId

  function confirmAnswer() {
    if (selectedOption && !submitted) setSubmitted(true)
  }

  function advanceQuestion() {
    setQuestionIndex((current) => (current + 1) % demoQuestions.length)
    setSelectedOption(null)
    setSubmitted(false)
  }

  return (
    <div className="feature-page">
      <PageHeading eyebrow="PRATIQUE COM ATENÇÃO" title="Questões" description="Resolva itens de exemplo e confira o raciocínio após confirmar sua resposta." />
      <section className="question-layout" aria-label="Questão demonstrativa">
        <div className="panel question-card">
          <div className="question-card-top"><div className="question-type"><CircleHelp size={17} aria-hidden="true" /><span>QUESTÃO DEMONSTRATIVA</span></div><span className="question-counter">{String(questionIndex + 1).padStart(2, '0')} <span>/ {String(demoQuestions.length).padStart(2, '0')}</span></span></div>
          <div className="question-tags"><span>{question.subject}</span><span>{question.topic}</span></div>
          <h2 className="question-prompt">{question.prompt}</h2>
          <div className="answer-options" role="group" aria-label="Alternativas de resposta">{question.options.map((option) => {
            const isSelected = selectedOption === option.id
            const isAnswer = submitted && option.id === question.correctOptionId
            const isWrongSelection = submitted && isSelected && !isCorrect
            return <button key={option.id} type="button" className={`answer-option ${isSelected ? 'answer-option-selected' : ''} ${isAnswer ? 'answer-option-correct' : ''} ${isWrongSelection ? 'answer-option-wrong' : ''}`} onClick={() => !submitted && setSelectedOption(option.id)} aria-pressed={isSelected} disabled={submitted}>
              <span className="option-letter">{option.id.toUpperCase()}</span><span className="option-text">{option.text}</span>{isAnswer && <Check className="option-result-icon" size={18} aria-label="Alternativa correta" />}{isWrongSelection && <X className="option-result-icon" size={18} aria-label="Alternativa incorreta" />}
            </button>
          })}</div>
          {submitted && <div className={`answer-feedback ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`} role="status"><div className="feedback-icon">{isCorrect ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}</div><div><strong>{isCorrect ? 'Resposta correta' : 'Ainda não — veja a alternativa correta'}</strong><p>{question.explanation}</p></div></div>}
          <div className="question-actions">{submitted ? <button className="primary-action" onClick={advanceQuestion}>Próxima questão <ArrowRight size={16} aria-hidden="true" /></button> : <button className="primary-action" onClick={confirmAnswer} disabled={!selectedOption}>Confirmar resposta <Check size={16} aria-hidden="true" /></button>}</div>
        </div>
        <aside className="panel question-aside"><div className="question-aside-icon"><RotateCcw size={19} aria-hidden="true" /></div><span className="section-kicker">PRÁTICA SEM PRESSÃO</span><h3>Aprender também é revisar o caminho.</h3><p>Escolha uma alternativa e confirme para ver o feedback. Sua resposta fica apenas nesta demonstração.</p><div className="question-aside-note"><span className="tiny-info">i</span> Itens fictícios para demonstração. Não são questões oficiais.</div></aside>
      </section>
    </div>
  )
}
