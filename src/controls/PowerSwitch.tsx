import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import './switches.css'

export interface PowerSwitchProps {
  checked: boolean
  onChange: (on: boolean) => void
}

/** Horizontal slide switch, OFF on the left and ON on the right. Fills its slot. */
export function PowerSwitch({ checked, onChange }: PowerSwitchProps) {
  return (
    <div className="slide">
      <Switch
        className="slide__switch"
        aria-label="Power"
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
      >
        <span className="slide__label slide__label--start" aria-hidden="true">
          OFF
        </span>
        <span className="slide__label slide__label--end" aria-hidden="true">
          ON
        </span>
        <SwitchThumb className="slide__nub" />
      </Switch>
    </div>
  )
}
