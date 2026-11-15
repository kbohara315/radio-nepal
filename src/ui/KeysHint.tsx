import { useState } from 'react'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { useStagePopup } from './stage'
import './ui.css'

const KEYS: { keys: string[]; does: string }[] = [
  { keys: ['Space'], does: 'On / off (volume)' },
  { keys: ['B'], does: 'Switch band' },
  { keys: ['←', '→'], does: 'Tune (Shift: big step)' },
  { keys: ['[', ']'], does: 'Previous / next station' },
  { keys: ['↑', '↓'], does: 'Volume' },
]

/** Collapsed "?" button: the keyboard shortcuts live in a small popover instead of under the radio. */
export function KeysHint() {
  const [open, setOpen] = useState(false)
  const popup = useStagePopup('end', open)
  return (
    <Popover open={open} onOpenChange={setOpen} {...popup.root}>
      <PopoverTrigger className="strip__btn strip__btn--round keys-trigger" aria-label="Keyboard shortcuts">
        ?
      </PopoverTrigger>
      <PopoverContent className="keys" ref={popup.contentRef} {...popup.content} sideOffset={8} collisionPadding={8}>
        <PopoverTitle className="keys__title">Keyboard</PopoverTitle>
        <dl className="keys__list">
          {KEYS.map(({ keys, does }) => (
            <div key={does} className="keys__row">
              <dt>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
