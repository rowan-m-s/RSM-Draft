import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A card graphic, large, in the middle of the screen, with a line above
 * saying what it is. Closes on the backdrop, the cross, or Escape.
 */
export function Lightbox({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-pl-bg/90 p-4 pt-[calc(1rem+env(safe-area-inset-top))]"
    >
      <div className="flex w-full max-w-3xl items-center justify-between gap-3">
        <p className="display min-w-0 truncate text-xl text-pl-text sm:text-2xl">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded px-2 py-1 text-pl-muted hover:bg-pl-surface-2 hover:text-pl-text"
        >
          ✕
        </button>
      </div>
      <div className="w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  )
}
