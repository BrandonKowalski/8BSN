import {useCallback, useEffect, useRef, useState} from 'react'
import {romStore} from './rom/romStore'
import {validateRom} from './rom/validateRom'
import {PACKAGES} from './packages/registry'
import type {BroadcastPackage, Credit, Detail} from './sdk/types'

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

const detailsOf = (pkg: BroadcastPackage): Detail[] => [
    {label: 'BY', value: pkg.author},
    {label: 'VERSION', value: pkg.version},
    ...(pkg.about ?? []),
]

export default function InfoModal({onClose, active}: Props) {
    const credits = [EMULATION, ...(active ? [active] : PACKAGES).flatMap((pkg) => pkg.credits ?? []), ...NETWORK_CREDITS]

    const closeRef = useRef<HTMLButtonElement | null>(null)
    const [stored, setStored] = useState<ReadonlySet<string> | null>(null)
    const [confirming, setConfirming] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        const found = new Set<string>()
        for (const bytes of await romStore.loadAll()) {
            const result = await validateRom(bytes)
            if (result.ok) found.add(result.rom.sha1)
        }
        setStored(found)
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const remove = async (sha1: string) => {
        setConfirming(null)
        await romStore.remove(sha1)
        await refresh()
    }

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
                            <li key={pkg.id} data-testid="info-package">
                                <span className="info-package-row">
                                    <span className="info-rom-title">{pkg.name}</span>
                                    <button type="button" data-nav onClick={() => setOpen(open === pkg.id ? null : pkg.id)}>
                                        {open === pkg.id ? 'HIDE' : 'DETAILS'}
                                    </button>
                                </span>
                                {open === pkg.id && (
                                    <div className="info-package-details">
                                        <dl className="info-credits">
                                            {detailsOf(pkg).map(({label, value}) => (
                                                <div key={`${label} ${value}`}>
                                                    <dt>{label}</dt>
                                                    <dd>{value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                        <h4>SUPPORTED ROMS</h4>
                                        <ul className="info-roms">
                                            {pkg.roms.map((rom) => (
                                                <li key={rom.sha1} data-testid="info-rom">
                                                    <span className="info-rom-title">{rom.title}</span>
                                                    <span className="info-rom-about">{rom.about}</span>
                                                    <code className="info-rom-hash">SHA-1 {rom.sha1}</code>
                                                    {stored && (
                                                        <span className="info-rom-stored">
                                                            <span className={stored.has(rom.sha1) ? 'info-rom-status info-rom-present' : 'info-rom-status'}>
                                                                {stored.has(rom.sha1) ? 'STORED' : 'NOT STORED'}
                                                            </span>
                                                            {stored.has(rom.sha1) && confirming !== rom.sha1 && (
                                                                <button type="button" data-nav onClick={() => setConfirming(rom.sha1)}>
                                                                    REMOVE
                                                                </button>
                                                            )}
                                                            {confirming === rom.sha1 && (
                                                                <>
                                                                    <span>Remove this ROM?</span>
                                                                    <button type="button" data-nav onClick={() => void remove(rom.sha1)}>
                                                                        YES
                                                                    </button>
                                                                    <button type="button" data-nav onClick={() => setConfirming(null)}>
                                                                        NO
                                                                    </button>
                                                                </>
                                                            )}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
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
