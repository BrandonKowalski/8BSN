import {useEffect, useRef} from 'react'
import {PACKAGES, romsOf} from './packages/registry'
import type {BroadcastPackage, Credit} from './sdk/types'

type Props = { onClose: () => void; active: BroadcastPackage | null }

const EMULATION: Credit = {what: 'Emulation', who: 'Mesen by Sour, GPL-3.0, compiled to WebAssembly'}

const NETWORK_CREDITS: Credit[] = [
    {what: 'Font', who: 'Press Start 2P by CodeMan38, SIL Open Font License'},
    {what: 'Scores', who: 'ESPN Public Scoreboard'},
    {what: 'BUILT BY', who: "Brandon T. Kowalski"}
]

const join = (names: readonly string[]) =>
    names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`

const OWNERS = join([...new Set(PACKAGES.flatMap((pkg) => pkg.owners ?? []))])

const ROMS = romsOf(PACKAGES)

export default function InfoModal({onClose, active}: Props) {
    const credits = [EMULATION, ...(active ? [active] : PACKAGES).flatMap((pkg) => pkg.credits ?? []), ...NETWORK_CREDITS]

    const closeRef = useRef<HTMLButtonElement | null>(null)

    useEffect(() => {
        closeRef.current?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.code !== 'Escape') return
            event.stopImmediatePropagation()
            onClose()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [onClose])

    return (
        <div className="info-backdrop" onClick={onClose}>
            <div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title"
                 onClick={(event) => event.stopPropagation()}>
                <h2 id="info-title">ABOUT 8-Bit Sports Network</h2>
                <section>
                    <h3>CREDITS</h3>
                    <dl className="info-credits">
                        {credits.map(({what, who}) => (
                            <div key={`${what} ${who}`}>
                                <dt>{what}</dt>
                                <dd>{who}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
                <section>
                    <h3>PACKAGES</h3>
                    <ul className="info-roms">
                        {PACKAGES.map((pkg) => (
                            <li key={pkg.id}>
                                <span className="info-rom-title">{`${pkg.name} package ${pkg.version}`}</span>
                            </li>
                        ))}
                    </ul>
                </section>
                <section>
                    <h3>SUPPORTED ROMS</h3>
                    <ul className="info-roms">
                        {ROMS.map(({rom}) => (
                            <li key={rom.sha1}>
                                <span className="info-rom-title">{rom.title}</span>
                                <span className="info-rom-about">{rom.about}</span>
                                <code className="info-rom-hash">SHA-1 {rom.sha1}</code>
                            </li>
                        ))}
                    </ul>
                </section>
                <p className="info-note">8BSN is not affiliated with {OWNERS}.</p>
                <button type="button" data-nav ref={closeRef} onClick={onClose}>
                    CLOSE
                </button>
            </div>
        </div>
    )
}
