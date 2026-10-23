import { Sparkles } from 'lucide-react'

interface PageHeadingProps {
  eyebrow: string
  title: string
  description: string
}

export function PageHeading({ eyebrow, title, description }: PageHeadingProps) {
  return (
    <section className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div><h1>{title}</h1><p className="welcome-copy">{description}</p></div>
      <span className="demo-page-tag"><Sparkles size={14} aria-hidden="true" /> DADOS DEMONSTRATIVOS</span>
    </section>
  )
}
