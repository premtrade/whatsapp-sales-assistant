import React, { useRef, useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end sm:items-center justify-center min-h-[100dvh] sm:min-h-screen px-0 sm:px-4 pt-4 pb-0 sm:pb-20 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`relative bg-white rounded-t-2xl sm:rounded-lg shadow-xl transform transition-all w-full sm:my-8 sm:w-full ${sizeClasses[size]} text-left max-h-[92dvh] overflow-y-auto overscroll-contain`}
        >
          {title && (
            <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 truncate pr-2">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="touch-target shrink-0 inline-flex items-center justify-center w-10 h-10 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-surface-100 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <div className="px-4 sm:px-6 py-4 safe-area-bottom">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
