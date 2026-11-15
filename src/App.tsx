import { useShortcut } from '@ui-sdk/react/shortcuts'
import { BandSwitch } from './controls/BandSwitch'
import { Knob } from './controls/Knob'
import { PowerSwitch } from './controls/PowerSwitch'
import { stations } from './data/stations'
import { stationAtDial, useRadio } from './hooks/useRadio'
import { RadioBody } from './radio/RadioBody'
import { Scene } from './radio/Scene'
import { BAND_RANGE } from './types'
import { Credits } from './ui/Credits'
import { StationList } from './ui/StationList'
import { KeysHint } from './ui/KeysHint'
import { OnAirCard } from './ui/OnAirCard'
import './App.css'

/** True when the focused element does not itself use these keys. */
const focusIsNot = (selector: string) => () => {
  const el = document.activeElement
  return !el || !el.closest(selector)
}
const notOnButton = focusIsNot('button, a, summary, [role="switch"], [role="radio"], [role="button"]')
const notOnArrowUser = focusIsNot('input, select, textarea, [role="radio"], [role="slider"], [role="option"], [role="listbox"]')

export default function App() {
  const radio = useRadio()
  const { band, freq, power, volume, tuning } = radio
  const range = BAND_RANGE[band]
  const dial = freq[band]
  const signal = power ? tuning.signal : 0
  const tuned = stationAtDial(stations, band, dial)

  // Global keys; controls that handle a key themselves are left alone.
  useShortcut('space', radio.togglePower, { description: 'Power', when: notOnButton })
  useShortcut('p', radio.togglePower, { description: 'Power' })
  useShortcut('b', radio.toggleBand, { description: 'Switch band' })
  useShortcut('left', () => radio.nudgeFreq(-1), { description: 'Tune down', when: notOnArrowUser })
  useShortcut('right', () => radio.nudgeFreq(1), { description: 'Tune up', when: notOnArrowUser })
  useShortcut('shift+left', () => radio.nudgeFreq(-10), { description: 'Tune down, big step', when: notOnArrowUser })
  useShortcut('shift+right', () => radio.nudgeFreq(10), { description: 'Tune up, big step', when: notOnArrowUser })
  useShortcut(']', radio.nextStation, { description: 'Next station', when: notOnArrowUser })
  useShortcut('[', radio.prevStation, { description: 'Previous station', when: notOnArrowUser })
  useShortcut('pagedown', radio.nextStation, { description: 'Next station', when: notOnArrowUser })
  useShortcut('pageup', radio.prevStation, { description: 'Previous station', when: notOnArrowUser })
  useShortcut('up', () => radio.nudgeVolume(0.05), { description: 'Volume up', when: notOnArrowUser })
  useShortcut('down', () => radio.nudgeVolume(-0.05), { description: 'Volume down', when: notOnArrowUser })

  const fmtDial = (v: number) => `${band === 'FM' ? v.toFixed(1) : Math.round(v)} ${range.unit}`

  return (
    <Scene>
      <main className="app">
        <div className="app__radio">
          <RadioBody
            power={power}
            band={band}
            freq={dial}
            signal={signal}
            readVisual={radio.readVisual}
            powerSwitch={<PowerSwitch checked={power} onChange={radio.setPower} />}
            bandSwitch={<BandSwitch band={band} onChange={radio.setBand} />}
            volumeKnob={
              <Knob
                label="Volume"
                value={volume}
                min={0}
                max={1}
                step={0.01}
                largeStep={0.1}
                sweep={270}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={radio.setVolume}
                onTick={radio.tick}
              />
            }
            tuningKnob={
              <Knob
                label={`Tuning, ${band}`}
                value={dial}
                min={range.min}
                max={range.max}
                step={range.step}
                largeStep={range.step * 10}
                turns={3}
                momentum
                formatValue={fmtDial}
                onChange={radio.setFreq}
                onTick={radio.tick}
              />
            }
          />
        </div>

        <div className="app__caption">
          <OnAirCard
            power={power}
            band={band}
            freq={dial}
            tuning={tuning}
            actions={
              <>
                <StationList stations={stations} tuned={tuned} onTune={radio.tuneTo} />
                <KeysHint />
              </>
            }
          />
          <div className="app__foot">
            <Credits stations={stations} />
          </div>
        </div>
      </main>
    </Scene>
  )
}
