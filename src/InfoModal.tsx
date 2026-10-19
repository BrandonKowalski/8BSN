import {useEffect, useRef} from 'react'
import {ROM_PROFILES} from './rom/profiles'

type Props = { onClose: () => void }

const CREDITS = [
    {what: 'Emulation', who: 'Mesen by Sour, GPL-3.0, compiled to WebAssembly'},
    {what: 'Game', who: 'Tecmo Super Bowl by Tecmo, 1991'},
    {what: 'ROM Hacking', who: 'Knobbe, bruddog, SBlueman and the other legends on tecmobowl.org'},
    {what: 'Font', who: 'Press Start 2P by CodeMan38, SIL Open Font License'},
    {what: 'Scores', who: 'ESPN Public Scoreboard'},
    {what: 'BUILT BY', who: "Brandon T. Kowalski"}
]

export default function InfoModal({onClose}: Props) {
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
                        {CREDITS.map(({what, who}) => (
                            <div key={what}>
                                <dt>{what}</dt>
                                <dd>{who}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
                <section>
                    <h3>SUPPORTED ROMS</h3>
                    <ul className="info-roms">
                        {ROM_PROFILES.map((profile) => (
                            <li key={profile.sha1}>
                                <span className="info-rom-title">{profile.title}</span>
                                <span className="info-rom-about">{profile.about}</span>
                                <code className="info-rom-hash">SHA-1 {profile.sha1}</code>
                            </li>
                        ))}
                    </ul>
                </section>
                <p className="info-note">8BSN is not affiliated with Tecmo, the NFL or the NFLPA.</p>
                <button type="button" data-nav ref={closeRef} onClick={onClose}>
                    CLOSE
                </button>
            </div>
        </div>
    )
}
