import { useEffect, useState } from 'react'
import './ui.css'

/** The install event Chrome/Edge fire once the app meets the installability criteria. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const runningInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * "Install" button, shown only when the browser offers an install prompt and the app is not
 * already running installed. iOS Safari has no prompt (Share → Add to Home Screen instead).
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Keep the event so our own button can trigger it later.
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => setPrompt(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!prompt || runningInstalled()) return null

  const install = async () => {
    setPrompt(null)
    await prompt.prompt()
    await prompt.userChoice
  }

  return (
    <button type="button" className="strip__btn" onClick={install}>
      Install
    </button>
  )
}
