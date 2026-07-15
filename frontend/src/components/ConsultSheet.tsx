import { useState } from 'react';
import DestinationInput, { type SelectedDestination } from './DestinationInput';
import type { TripPlan, VehicleConfig, FuelAlert } from '../api';
import { alertTypeIcon, alertTypeLabel } from '../lib/roadAlerts';
import type { AlertSoundSettings } from '../lib/alertSounds';
import type { SavedPlace } from '../lib/savedPlaces';

export type ConsultTab = 'route' | 'vehicle' | 'pois' | 'stops' | 'alerts' | 'saved';

interface ConsultSheetProps {
  tab: ConsultTab;
  onTabChange: (tab: ConsultTab) => void;
  onClose: () => void;
  trip: TripPlan | null;
  vehicle: VehicleConfig;
  onVehicleChange: (v: VehicleConfig) => void;
  onSaveVehicle: () => void;
  fuelDisplay: FuelAlert | null | undefined;
  originMode: 'gps' | 'custom';
  onOriginModeChange: (m: 'gps' | 'custom') => void;
  originText: string;
  onOriginTextChange: (v: string) => void;
  onOriginPick: (d: SelectedDestination) => void;
  waypoints: Array<{ id: string; label: string }>;
  onAddWaypoint: () => void;
  onRemoveWaypoint: (id: string) => void;
  onWaypointChange: (id: string, label: string) => void;
  onWaypointPick: (id: string, d: SelectedDestination) => void;
  userLat: number;
  userLon: number;
  gpsActive: boolean;
  distanceTraveled: number;
  alertSounds: AlertSoundSettings;
  onAlertSoundsChange: (s: AlertSoundSettings) => void;
  onSaveAlertSounds: () => void;
  homePlace: SavedPlace | null;
  workPlace: SavedPlace | null;
  favorites: SavedPlace[];
  onSetHome: (d: SelectedDestination) => void;
  onSetWork: (d: SelectedDestination) => void;
  onClearHome: () => void;
  onClearWork: () => void;
  onAddFavorite: (d: SelectedDestination) => void;
  onRemoveFavorite: (id: string) => void;
  onGoToSaved: (place: SavedPlace) => void;
  onUseGpsAsHome: () => void;
  onUseGpsAsWork: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
  onSelectPoi?: (poi: { name: string; lat: number; lon: number; address?: string; category?: string }) => void;
}

const POI_ICONS: Record<string, string> = { fuel: '⛽', food: '🍽️', hotel: '🏨' };
const POI_GROUPS = [
  { key: 'fuel' as const, label: 'Postos' },
  { key: 'hotel' as const, label: 'Hotéis' },
  { key: 'food' as const, label: 'Restaurantes' },
];

export default function ConsultSheet({
  tab,
  onTabChange,
  onClose,
  trip,
  vehicle,
  onVehicleChange,
  onSaveVehicle,
  fuelDisplay,
  originMode,
  onOriginModeChange,
  originText,
  onOriginTextChange,
  onOriginPick,
  waypoints,
  onAddWaypoint,
  onRemoveWaypoint,
  onWaypointChange,
  onWaypointPick,
  userLat,
  userLon,
  gpsActive,
  distanceTraveled,
  alertSounds,
  onAlertSoundsChange,
  onSaveAlertSounds,
  homePlace,
  workPlace,
  favorites,
  onSetHome,
  onSetWork,
  onClearHome,
  onClearWork,
  onAddFavorite,
  onRemoveFavorite,
  onGoToSaved,
  onUseGpsAsHome,
  onUseGpsAsWork,
  onOpenTerms,
  onOpenPrivacy,
  onSelectPoi,
}: ConsultSheetProps) {
  const [homeQuery, setHomeQuery] = useState('');
  const [workQuery, setWorkQuery] = useState('');
  const [favQuery, setFavQuery] = useState('');

  const tabLabel = (t: ConsultTab): string => {
    if (t === 'route') return 'Rota';
    if (t === 'alerts') return 'Alertas';
    if (t === 'vehicle') return 'Veículo';
    if (t === 'pois') return 'Locais';
    if (t === 'saved') return 'Salvos';
    return 'Descanso';
  };

  return (
    <div className="consult-overlay" onClick={onClose}>
      <div className="consult-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="consult-handle" />
        <div className="consult-header">
          <h2>Consultar</h2>
          <button type="button" className="icon-btn" onClick={onClose}>×</button>
        </div>

        <div className="consult-tabs">
          {(['route', 'alerts', 'saved', 'pois', 'stops', 'vehicle'] as ConsultTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'active' : ''}
              onClick={() => onTabChange(t)}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        <div className="consult-body">
          {tab === 'route' && (
            <>
              <div className="field">
                <label>Partida</label>
                <div className="segmented">
                  <button type="button" className={originMode === 'gps' ? 'active' : ''} onClick={() => onOriginModeChange('gps')}>
                    Meu local
                  </button>
                  <button type="button" className={originMode === 'custom' ? 'active' : ''} onClick={() => onOriginModeChange('custom')}>
                    Outro local
                  </button>
                </div>
                {originMode === 'gps' ? (
                  <p className="field-hint">{gpsActive ? 'GPS ativo' : 'GPS indisponível'}</p>
                ) : (
                  <DestinationInput
                    value={originText}
                    onChange={onOriginTextChange}
                    onPick={onOriginPick}
                    userLat={userLat}
                    userLon={userLon}
                    placeholder="Origem"
                  />
                )}
              </div>
              <div className="waypoints-block">
                <div className="waypoints-header">
                  <label>Paradas</label>
                  <button type="button" className="secondary waypoints-add" onClick={onAddWaypoint}>
                    + Parada
                  </button>
                </div>
                {waypoints.map((wp, i) => (
                  <div key={wp.id} className="waypoint-row">
                    <span className="waypoint-num">{i + 1}</span>
                    <DestinationInput
                      value={wp.label}
                      onChange={(v) => onWaypointChange(wp.id, v)}
                      onPick={(d) => onWaypointPick(wp.id, d)}
                      userLat={userLat}
                      userLon={userLon}
                      placeholder="Parada"
                    />
                    <button type="button" className="waypoint-remove" onClick={() => onRemoveWaypoint(wp.id)}>×</button>
                  </div>
                ))}
              </div>
              {trip && (
                <div className="trip-stats">
                  <div className="stat-card">
                    <div className="value">{trip.route.totalDistanceKm.toFixed(0)} km</div>
                    <div className="label">Distância</div>
                  </div>
                  <div className="stat-card">
                    <div className="value">{distanceTraveled.toFixed(1)} km</div>
                    <div className="label">Percorridos</div>
                  </div>
                </div>
              )}
              {fuelDisplay && (
                <div className={`alert-box ${fuelDisplay.status}`}>
                  <strong>{fuelDisplay.message}</strong>
                </div>
              )}
              {trip?.roadAlerts && trip.roadAlerts.length > 0 && (
                <div className="consult-alerts-block">
                  <h3 className="consult-alerts-title">Alertas na rota</h3>
                  <p className="field-hint">No mapa: apenas radares e lombadas. Lista completa abaixo.</p>
                  {(['radar', 'lombada', 'perigo'] as const).map((type) => {
                    const items = trip.roadAlerts!.filter((a) => a.type === type);
                    if (!items.length) return null;
                    return (
                      <div key={type} className="consult-alert-group">
                        <h4>
                          {alertTypeIcon(type)} {alertTypeLabel(type)}
                          <span className="poi-group-count">{items.length}</span>
                        </h4>
                        <ul className="consult-alert-list">
                          {items.map((a) => (
                            <li key={a.id}>{a.label}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'pois' && (
            !trip ? (
              <p className="field-hint">Planeje uma rota primeiro.</p>
            ) : trip.pois.length === 0 ? (
              <p className="field-hint">Carregando postos, hotéis e restaurantes…</p>
            ) : (
              POI_GROUPS.map((g) => {
                const items = trip.pois.filter((p) => p.category === g.key);
                if (!items.length) return null;
                return (
                  <div key={g.key} className="poi-group">
                    <h3 className="poi-group-title">
                      {POI_ICONS[g.key]} {g.label}
                      <span className="poi-group-count">{items.length}</span>
                    </h3>
                    <ul className="poi-list">
                      {items.map((poi) => (
                        <li key={poi.id} className="poi-item">
                          <button
                            type="button"
                            className="poi-item-btn"
                            onClick={() => {
                              onSelectPoi?.({
                                name: poi.name,
                                lat: poi.lat,
                                lon: poi.lon,
                                address: poi.address,
                                category: poi.category,
                              });
                            }}
                          >
                            <span className={`poi-icon ${poi.category}`}>{POI_ICONS[poi.category]}</span>
                            <div>
                              <div>{poi.name}</div>
                              {poi.address && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{poi.address}</div>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )
          )}

          {tab === 'stops' && (
            !trip ? (
              <p className="field-hint">Planeje uma rota primeiro.</p>
            ) : (
              trip.scheduledStops.map((s, i) => (
                <div key={i} className="stop-item">
                  ⏱ {Math.floor(s.minutesUntil / 60)}h{s.minutesUntil % 60}m — {s.message}
                </div>
              ))
            )
          )}

          {tab === 'alerts' && (
            <>
              <p className="field-hint">Sons ao se aproximar de radares e lombadas na rota (somente em navegação).</p>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alertSounds.master}
                  onChange={(e) => onAlertSoundsChange({ ...alertSounds, master: e.target.checked })}
                />
                <span>Alertas sonoros ativos</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alertSounds.radar}
                  disabled={!alertSounds.master}
                  onChange={(e) => onAlertSoundsChange({ ...alertSounds, radar: e.target.checked })}
                />
                <span>📷 Radares</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alertSounds.lombada}
                  disabled={!alertSounds.master}
                  onChange={(e) => onAlertSoundsChange({ ...alertSounds, lombada: e.target.checked })}
                />
                <span>⬥ Lombadas</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alertSounds.voice}
                  disabled={!alertSounds.master}
                  onChange={(e) => onAlertSoundsChange({ ...alertSounds, voice: e.target.checked })}
                />
                <span>🗣 Aviso por voz nos alertas (120 m)</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={alertSounds.navGuidance}
                  onChange={(e) => onAlertSoundsChange({ ...alertSounds, navGuidance: e.target.checked })}
                />
                <span>🧭 Voz das manobras (navegação)</span>
              </label>
              <div className="alert-sound-tests">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void import('../lib/alertSounds').then((m) => {
                      m.unlockAlertAudio();
                      m.playRadarAlertSound();
                      if (alertSounds.voice) m.speakNavigation('Radar à frente');
                    });
                  }}
                >
                  Testar radar
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void import('../lib/alertSounds').then((m) => {
                      m.unlockAlertAudio();
                      m.playLombadaAlertSound();
                      if (alertSounds.voice) m.speakNavigation('Lombada à frente');
                    });
                  }}
                >
                  Testar lombada
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    void import('../lib/alertSounds').then((m) => {
                      m.unlockAlertAudio();
                      if (alertSounds.navGuidance) m.speakNavigation('Em 300 metros, vire à direita');
                    });
                  }}
                >
                  Testar voz
                </button>
              </div>
              <button type="button" className="primary" style={{ width: '100%', marginTop: '0.75rem' }} onClick={onSaveAlertSounds}>
                Salvar preferências
              </button>
            </>
          )}

          {tab === 'saved' && (
            <>
              <p className="field-hint">Casa, trabalho e favoritos ficam neste aparelho.</p>

              <div className="saved-slot">
                <div className="saved-slot-head">
                  <strong>🏠 Casa</strong>
                  {homePlace && (
                    <button type="button" className="ghost saved-slot-clear" onClick={onClearHome}>
                      Remover
                    </button>
                  )}
                </div>
                {homePlace ? (
                  <button type="button" className="saved-place-row" onClick={() => onGoToSaved(homePlace)}>
                    <span>
                      <em>{homePlace.placeName || homePlace.label}</em>
                      <small>{homePlace.locationTag || homePlace.city || homePlace.label}</small>
                    </span>
                    <span className="saved-go">Ir</span>
                  </button>
                ) : (
                  <>
                    <DestinationInput
                      value={homeQuery}
                      onChange={setHomeQuery}
                      onPick={(d) => {
                        onSetHome(d);
                        setHomeQuery('');
                      }}
                      userLat={userLat}
                      userLon={userLon}
                      placeholder="Buscar endereço de casa…"
                    />
                    <button type="button" className="ghost" style={{ marginTop: '0.4rem' }} onClick={onUseGpsAsHome} disabled={!gpsActive}>
                      Usar posição atual
                    </button>
                  </>
                )}
              </div>

              <div className="saved-slot">
                <div className="saved-slot-head">
                  <strong>💼 Trabalho</strong>
                  {workPlace && (
                    <button type="button" className="ghost saved-slot-clear" onClick={onClearWork}>
                      Remover
                    </button>
                  )}
                </div>
                {workPlace ? (
                  <button type="button" className="saved-place-row" onClick={() => onGoToSaved(workPlace)}>
                    <span>
                      <em>{workPlace.placeName || workPlace.label}</em>
                      <small>{workPlace.locationTag || workPlace.city || workPlace.label}</small>
                    </span>
                    <span className="saved-go">Ir</span>
                  </button>
                ) : (
                  <>
                    <DestinationInput
                      value={workQuery}
                      onChange={setWorkQuery}
                      onPick={(d) => {
                        onSetWork(d);
                        setWorkQuery('');
                      }}
                      userLat={userLat}
                      userLon={userLon}
                      placeholder="Buscar endereço do trabalho…"
                    />
                    <button type="button" className="ghost" style={{ marginTop: '0.4rem' }} onClick={onUseGpsAsWork} disabled={!gpsActive}>
                      Usar posição atual
                    </button>
                  </>
                )}
              </div>

              <div className="saved-slot">
                <div className="saved-slot-head">
                  <strong>📍 Favoritos</strong>
                </div>
                <DestinationInput
                  value={favQuery}
                  onChange={setFavQuery}
                  onPick={(d) => {
                    onAddFavorite(d);
                    setFavQuery('');
                  }}
                  userLat={userLat}
                  userLon={userLon}
                  placeholder="Adicionar favorito…"
                />
                {favorites.length === 0 ? (
                  <p className="field-hint" style={{ marginTop: '0.6rem' }}>Nenhum favorito ainda.</p>
                ) : (
                  <ul className="saved-fav-list">
                    {favorites.map((f) => (
                      <li key={f.id}>
                        <button type="button" className="saved-place-row" onClick={() => onGoToSaved(f)}>
                          <span>
                            <em>{f.placeName || f.label}</em>
                            <small>{f.locationTag || f.city || f.label}</small>
                          </span>
                          <span className="saved-go">Ir</span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn saved-fav-remove"
                          aria-label="Remover favorito"
                          onClick={() => onRemoveFavorite(f.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {tab === 'vehicle' && (
            <>
              <div className="field">
                <label>Nome</label>
                <input value={vehicle.name} onChange={(e) => onVehicleChange({ ...vehicle, name: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>Autonomia (km)</label>
                  <input type="number" value={vehicle.autonomyKm} onChange={(e) => onVehicleChange({ ...vehicle, autonomyKm: Number(e.target.value) })} />
                </div>
                <div className="field">
                  <label>Combustível (km)</label>
                  <input type="number" value={vehicle.currentFuelKm} onChange={(e) => onVehicleChange({ ...vehicle, currentFuelKm: Number(e.target.value) })} />
                </div>
              </div>
              <button type="button" className="primary" style={{ width: '100%' }} onClick={onSaveVehicle}>
                Salvar
              </button>
              <div className="legal-footer">
                <button type="button" className="legal-link" onClick={onOpenTerms}>
                  Termos de Uso
                </button>
                <span aria-hidden>·</span>
                <button type="button" className="legal-link" onClick={onOpenPrivacy}>
                  Privacidade
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
