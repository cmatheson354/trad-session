import TuneCard from './TuneCard.jsx'

export default function TuneGrid({ tunes, onSelect, notationView = "sheet", statusLabels = {}, tapMode = false }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
      {tunes.map(tune => (
        <TuneCard
          key={tune.id}
          tune={tune}
          onClick={() => onSelect(tune)}
          notationView={notationView} statusLabels={statusLabels} tapMode={tapMode}
        />
      ))}
    </div>
  )
}
