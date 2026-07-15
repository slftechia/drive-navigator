interface NavSpeedHudProps {
  speedKmh: number | null;
  limitKmh: number;
  fromOsm?: boolean;
}

/** Velocímetro + placa de limite (layout Waze). */
export default function NavSpeedHud({ speedKmh, limitKmh, fromOsm = false }: NavSpeedHudProps) {
  const current = speedKmh != null && speedKmh >= 1 ? Math.round(speedKmh) : 0;
  const over = current > limitKmh + 3;

  return (
    <div className={`nav-speed-hud ${over ? 'nav-speed-over' : ''}`} aria-label="Velocidade">
      <div className="nav-speed-dial">
        <div className="nav-speed-current">{current}</div>
        <div className="nav-speed-unit">km/h</div>
      </div>
      <div
        className={`nav-speed-limit ${fromOsm ? 'nav-speed-limit-osm' : ''}`}
        title={fromOsm ? 'Limite via OpenStreetMap' : 'Limite estimado'}
      >
        {limitKmh}
      </div>
    </div>
  );
}
