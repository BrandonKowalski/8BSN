import { playerTag, type TagFit } from '../../game/format'
import type { RosterPlayer } from '../../game/roster'

export default function PlayerTag({ player, fit }: { player: RosterPlayer; fit: TagFit }) {
  const { number, name, position } = playerTag(player, fit)
  return (
    <span className="player-tag" data-testid="player-tag">
      {number && <span className="player-tag-num">{number}</span>}
      {number && ' '}
      <span className="player-tag-name">{name}</span>
      {position && ' '}
      {position && <span className="player-tag-pos">{position}</span>}
    </span>
  )
}
