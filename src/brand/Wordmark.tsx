import '@fontsource/press-start-2p/400.css'
import './wordmark.css'

const STRIPES = ['wm-gold', 'wm-red', 'wm-blue']

export default function Wordmark({ variant }: { variant: 'c2' | 'c3' }) {
  return (
    <span className={`wordmark wordmark-${variant}`} role="img" aria-label="8BSN">
      <span className="wm-text" aria-hidden="true">
        <span className="wm-8">8</span>
        <span className="wm-rest">BSN</span>
      </span>
      {variant === 'c3' && (
        <span className="wm-stripes" aria-hidden="true">
          {STRIPES.map((tone) => (
            <span className={`wm-stripe ${tone}`} key={tone} />
          ))}
        </span>
      )}
    </span>
  )
}
