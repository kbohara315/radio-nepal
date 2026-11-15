import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control'
import type { Band } from '../types'
import './switches.css'

export interface BandSwitchProps {
  band: Band
  onChange: (band: Band) => void
}

/** Two-position AM / FM slide switch. Arrow keys move between the positions. Fills its slot. */
export function BandSwitch({ band, onChange }: BandSwitchProps) {
  return (
    <div className="slide">
      <SegmentedControl
        className="slide__switch slide__switch--band"
        aria-label="Band"
        value={band}
        loop={false}
        onValueChange={(next) => {
          if (next === 'AM' || next === 'FM') onChange(next)
        }}
      >
        <SegmentedControlIndicator className="slide__nub slide__nub--indicator" />
        <SegmentedControlItem className="slide__item" value="AM">
          AM
        </SegmentedControlItem>
        <SegmentedControlItem className="slide__item" value="FM">
          FM
        </SegmentedControlItem>
      </SegmentedControl>
    </div>
  )
}
