import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MapView, { type MapMode } from './components/MapView';
import SearchScreen from './components/SearchScreen';
import RoutePreviewSheet, { type RouteMode } from './components/RoutePreviewSheet';
import NavInstructionBanner from './components/NavInstructionBanner';
import NavBottomBar from './components/NavBottomBar';
import NavSpeedHud from './components/NavSpeedHud';
import ArrivalSheet from './components/ArrivalSheet';
import ConsultSheet, { type ConsultTab } from './components/ConsultSheet';
import { type SelectedDestination } from './components/DestinationInput';
import {
  planTrip,
  loadVehicleConfig,
  saveVehicleConfig,
  getCurrentPosition,
  watchPosition,
  getFuelStatus,
  checkHealth,
  fetchRoadAlerts,
  fetchTripPois,
  type VehicleConfig,
  type TripPlan,
  type FuelAlert,
  type RouteInstruction,
} from './api';
import { haversineKm, estimateRouteRemainder, estimateRoadSpeedLimitKmh, sliceRouteWindow } from './utils/geo';
import { filterAlertsOnRoute, mergeRoadAlerts } from './lib/roadAlerts';
import { loadAlertSoundSettings, saveAlertSoundSettings, unlockAlertAudio } from './lib/alertSounds';
import { useRoadAlertSounds } from './hooks/useRoadAlertSounds';
import { useRoadAlertsLoader } from './hooks/useRoadAlertsLoader';
import { useRouteRecalculation } from './hooks/useRouteRecalculation';
import { useArrivalDetection } from './hooks/useArrivalDetection';
import { useSpeedLimit } from './hooks/useSpeedLimit';
import { routeAlternativeToRoute, formatRouteDuration, formatTollSummary } from './lib/routeFormat';
import './App.css';

type AppScreen = 'home' | 'search' | 'route-preview' | 'navigating';

interface WaypointEntry {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
  locationTag?: string;
}

const DEFAULT_CENTER = { lat: -27.5954, lon: -48.548 };

function isAcceptableGps(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function isGpsNearRoute(
  lat: number,
  lon: number,
  routePoints: { lat: number; lon: number }[] | undefined,
  routeOrigin: { lat: number; lon: number } | undefined,
  maxKm = 25
): boolean {
  if (!routePoints?.length) return true;
  const anchor = routeOrigin ?? routePoints[0];
  return haversineKm(lat, lon, anchor.lat, anchor.lon) <= maxKm;
}

function getNextInstruction(
  instructions: RouteInstruction[] | undefined,
  lat: number,
  lon: number
): RouteInstruction | null {
  if (!instructions?.length) return null;
  let best: RouteInstruction | null = null;
  let bestDist = Infinity;
  for (const inst of instructions) {
    const d = haversineKm(lat, lon, inst.lat, inst.lon);
    if (d > 0.03 && d < bestDist) {
      bestDist = d;
      best = inst;
    }
  }
  if (best) return best;

  const last = instructions[instructions.length - 1];
  const distToLast = haversineKm(lat, lon, last.lat, last.lon);
  if (distToLast <= 0.08) {
    return {
      ...last,
      message: 'Você chegou ao destino',
      instructionType: 'arrive',
    };
  }
  return instructions[0];
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [vehicle, setVehicle] = useState<VehicleConfig>(loadVehicleConfig);
  const [selectedDest, setSelectedDest] = useState<SelectedDestination>({ label: '' });
  const [position, setPosition] = useState(DEFAULT_CENTER);
  const [gpsActive, setGpsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [liveFuel, setLiveFuel] = useState<FuelAlert | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [originMode, setOriginMode] = useState<'gps' | 'custom'>('gps');
  const [originText, setOriginText] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState<SelectedDestination>({ label: '' });
  const [waypoints, setWaypoints] = useState<WaypointEntry[]>([]);
  const [followingGps, setFollowingGps] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [navigationStartToken, setNavigationStartToken] = useState(0);
  const [heading, setHeading] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState<number | null>(null);
  const [routeOverview, setRouteOverview] = useState(false);
  const [routeOverviewToken, setRouteOverviewToken] = useState(0);
  const [routePreviewMinimized, setRoutePreviewMinimized] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultTab, setConsultTab] = useState<ConsultTab>('route');
  const [alertSounds, setAlertSounds] = useState(loadAlertSoundSettings);
  const [arrived, setArrived] = useState(false);

  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const vehicleRef = useRef(vehicle);
  const tripRef = useRef(trip);
  const screenRef = useRef(screen);
  useEffect(() => { vehicleRef.current = vehicle; }, [vehicle]);
  useEffect(() => { tripRef.current = trip; }, [trip]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    checkHealth().then(() => setApiOk(true)).catch(() => setApiOk(false));
    // Acorda API Render em background (rotas/planejamento).
    void fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/health`, { method: 'GET' }).catch(() => {});
  }, []);

  const resolveOrigin = useCallback((): { lat: number; lon: number; label: string } => {
    if (originMode === 'custom' && selectedOrigin.lat != null && selectedOrigin.lon != null) {
      return {
        lat: selectedOrigin.lat,
        lon: selectedOrigin.lon,
        label: selectedOrigin.locationTag ?? selectedOrigin.label,
      };
    }
    return { lat: position.lat, lon: position.lon, label: 'Seu local' };
  }, [originMode, selectedOrigin, position]);

  const updateFuelStatus = useCallback(async (lat: number, lon: number, traveled: number) => {
    const v = vehicleRef.current;
    const t = tripRef.current;
    const remaining = v.currentFuelKm - traveled;
    try {
      const alert = await getFuelStatus({
        currentLat: lat,
        currentLon: lon,
        remainingFuelKm: remaining,
        fuelReserveKm: v.fuelReserveKm,
        routePoints: t?.route.legs.flatMap((l) => l.points),
      });
      setLiveFuel(alert);
    } catch {
      setLiveFuel({
        remainingKm: remaining,
        status: remaining <= v.fuelReserveKm + 30 ? 'critical' : remaining <= v.fuelReserveKm + 80 ? 'warning' : 'ok',
        message: `Autonomia restante: ${Math.round(remaining)} km`,
      });
    }
  }, []);

  useEffect(() => {
    getCurrentPosition()
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        if (!isAcceptableGps(lat, lon)) {
          setGpsActive(false);
          return;
        }
        setPosition({ lat, lon });
        setGpsActive(true);
        lastPosRef.current = { lat, lon };

        watchIdRef.current = watchPosition((p) => {
          const newLat = p.coords.latitude;
          const newLon = p.coords.longitude;
          if (!isAcceptableGps(newLat, newLon)) return;
          const t = tripRef.current;
          const pts = t?.route.legs[0]?.points;
          const origin = t?.origin ?? pts?.[0];
          const navigating = screenRef.current === 'navigating';
          if (t && !navigating && !isGpsNearRoute(newLat, newLon, pts, origin)) return;
          setPosition({ lat: newLat, lon: newLon });
          if (p.coords.speed != null && !Number.isNaN(p.coords.speed)) {
            setSpeedMps(Math.max(0, p.coords.speed));
          }
          if (p.coords.heading != null && !Number.isNaN(p.coords.heading)) {
            setHeading(p.coords.heading);
          }
          if (lastPosRef.current) {
            const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lon, newLat, newLon);
            if (dist > 0.05) {
              setDistanceTraveled((prev) => {
                const total = prev + dist;
                updateFuelStatus(newLat, newLon, total);
                return total;
              });
            }
          }
          lastPosRef.current = { lat: newLat, lon: newLon };
        }, () => setGpsActive(false));
      })
      .catch(() => {
        setError('Não foi possível obter localização.');
        setGpsActive(false);
      });

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [updateFuelStatus]);

  const planRoute = useCallback(async (dest: SelectedDestination) => {
    const destLabel = dest.label.trim();
    if (!destLabel) return;

    const origin = resolveOrigin();
    const validWaypoints = waypoints
      .filter((w) => w.lat != null && w.lon != null)
      .map((w) => ({ lat: w.lat!, lon: w.lon! }));

    setSelectedDest(dest);
    setLoading(true);
    setError(null);
    setDistanceTraveled(0);

    try {
      const result = await planTrip({
        originLat: origin.lat,
        originLon: origin.lon,
        destination: destLabel,
        destinationLat: dest.lat,
        destinationLon: dest.lon,
        destinationLocationTag: dest.locationTag ?? dest.label,
        waypoints: validWaypoints.length > 0 ? validWaypoints : undefined,
        currentFuelKm: vehicle.currentFuelKm,
        fuelReserveKm: vehicle.fuelReserveKm,
        stopIntervalMinutes: vehicle.stopIntervalMinutes,
      });
      setTrip(result);
      setLiveFuel(result.fuelAlert);
      setRoutePreviewMinimized(false);
      setScreen('route-preview');

      const pts = result.route.legs[0]?.points;
      if (pts?.length) {
        void fetchTripPois({ routePoints: pts })
          .then(({ pois }) => {
            setTrip((prev) => {
              if (!prev) return prev;
              return { ...prev, pois };
            });
          })
          .catch(() => { /* POIs carregam em segundo plano */ });

        const origin = result.origin ?? pts[0];
        const alertPts =
          result.route.totalDistanceKm > 100
            ? sliceRouteWindow(pts, origin.lat, origin.lon, 10, 90)
            : pts;
        void fetchRoadAlerts(alertPts)
          .then((roadAlerts) => {
            const onRoute = filterAlertsOnRoute(roadAlerts, pts, 0.18);
            if (!onRoute.length) return;
            setTrip((prev) =>
              prev ? { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, onRoute) } : prev
            );
          })
          .catch(() => { /* alertas carregam em segundo plano */ });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes('AbortError') ? 'A requisição demorou demais. Tente novamente.' : msg);
    } finally {
      setLoading(false);
    }
  }, [resolveOrigin, waypoints, vehicle]);

  const handleSearchPick = (dest: SelectedDestination) => {
    setScreen('home');
    planRoute(dest);
  };

  const handleRouteChoice = (mode: RouteMode) => {
    if (mode === 'navigate') {
      unlockAlertAudio();
      setArrived(false);
      setFollowingGps(true);
      setRouteOverview(false);
      setRoutePreviewMinimized(false);
      setNavigationStartToken((t) => t + 1);
      setScreen('navigating');
      return;
    }
    setRoutePreviewMinimized(true);
  };

  const handleSelectRoute = (id: string) => {
    setTrip((prev) => {
      if (!prev) return prev;
      const alts = prev.routeAlternatives?.length
        ? prev.routeAlternatives
        : prev.route
          ? [{
              id: 'default',
              kind: 'with_tolls' as const,
              label: 'Rota sugerida',
              hasTolls: false,
              tollCount: 0,
              tollCostEstimateBrl: null,
              totalDistanceKm: prev.route.totalDistanceKm,
              totalDurationMinutes: prev.route.totalDurationMinutes,
              legs: prev.route.legs,
              instructions: prev.route.instructions,
              boundingBox: prev.route.boundingBox,
            }]
          : [];
      if (!alts.length) return prev;
      const alt = alts.find((a) => a.id === id);
      if (!alt) return prev;
      return {
        ...prev,
        selectedRouteId: id,
        route: routeAlternativeToRoute(alt),
      };
    });
  };

  const stopNavigation = useCallback(() => {
    setArrived(false);
    setScreen('route-preview');
    setRoutePreviewMinimized(false);
    setFollowingGps(true);
    setRouteOverview(false);
  }, []);

  const goHome = useCallback(() => {
    setArrived(false);
    setScreen('home');
    setTrip(null);
    setSelectedDest({ label: '' });
    setFollowingGps(true);
    setRouteOverview(false);
  }, []);

  const endNavigation = useCallback(() => {
    if (window.confirm('Encerrar a navegação?')) {
      stopNavigation();
    }
  }, [stopNavigation]);

  const handleRecenter = () => {
    setRouteOverview(false);
    setRecenterToken((t) => t + 1);
    setFollowingGps(true);
  };

  const handleViewRoute = () => {
    setFollowingGps(false);
    setRouteOverview(true);
    setRouteOverviewToken((t) => t + 1);
  };

  const addWaypoint = () => setWaypoints((p) => [...p, { id: crypto.randomUUID(), label: '' }]);
  const removeWaypoint = (id: string) => setWaypoints((p) => p.filter((w) => w.id !== id));
  const updateWaypoint = (id: string, dest: SelectedDestination) => {
    setWaypoints((p) =>
      p.map((w) =>
        w.id === id
          ? { ...w, label: dest.locationTag ?? dest.label, lat: dest.lat, lon: dest.lon, locationTag: dest.locationTag }
          : w
      )
    );
  };

  const mapMode: MapMode = useMemo(() => {
    if (screen === 'navigating') return 'navigate';
    if (screen === 'route-preview') return 'preview';
    return 'idle';
  }, [screen]);

  const previewAlternatives = useMemo(() => {
    if (trip?.routeAlternatives?.length) return trip.routeAlternatives;
    if (!trip?.route) return [];
    return [
      {
        id: 'default',
        kind: 'with_tolls' as const,
        label: 'Rota sugerida',
        hasTolls: false,
        tollCount: 0,
        tollCostEstimateBrl: null,
        totalDistanceKm: trip.route.totalDistanceKm,
        totalDurationMinutes: trip.route.totalDurationMinutes,
        legs: trip.route.legs,
        instructions: trip.route.instructions,
        boundingBox: trip.route.boundingBox,
      },
    ];
  }, [trip]);

  const selectedRouteAlt = useMemo(() => {
    if (!previewAlternatives.length) return null;
    const id = trip?.selectedRouteId ?? previewAlternatives[0]?.id;
    return previewAlternatives.find((a) => a.id === id) ?? previewAlternatives[0];
  }, [trip?.selectedRouteId, previewAlternatives]);

  const mapAlternatives = useMemo(() => {
    if (!previewAlternatives.length) return undefined;
    return previewAlternatives.map((alt) => ({
      id: alt.id,
      points: alt.legs[0]?.points ?? alt.legs.flatMap((l) => l.points),
    }));
  }, [previewAlternatives]);

  const routePoints = useMemo(() => {
    if (!trip?.route.legs.length) return undefined;
    const primary = trip.route.legs[0]?.points;
    if (primary?.length) return primary;
    return trip.route.legs.flatMap((l) => l.points);
  }, [trip]);

  useRoadAlertsLoader({
    active: screen === 'navigating',
    position,
    routePoints,
    navigationStartToken,
    onAlerts: setTrip,
  });

  const navRemainder = useMemo(() => {
    if (!trip?.route || !routePoints?.length) return null;
    return estimateRouteRemainder(
      position.lat,
      position.lon,
      routePoints,
      trip.route.totalDurationMinutes,
      trip.route.totalDistanceKm,
      speedMps
    );
  }, [trip, routePoints, position.lat, position.lon, speedMps]);

  const speedKmh = speedMps != null && speedMps > 0.5 ? speedMps * 3.6 : null;
  const estimatedLimitKmh = navRemainder
    ? estimateRoadSpeedLimitKmh(navRemainder.distanceRemainingKm, navRemainder.durationRemainingMinutes)
    : 40;
  const { speedLimitKmh, fromOsm: speedLimitFromOsm } = useSpeedLimit(
    screen === 'navigating',
    position.lat,
    position.lon,
    estimatedLimitKmh
  );

  useArrivalDetection({
    active: screen === 'navigating' && !arrived,
    position,
    destination: trip?.destination,
    distanceRemainingKm: navRemainder?.distanceRemainingKm,
    onArrived: () => setArrived(true),
  });

  const fuelDisplay = liveFuel ?? trip?.fuelAlert;
  const originLabel = resolveOrigin().label;
  const nextInstruction = getNextInstruction(trip?.route.instructions, position.lat, position.lon);

  useRoadAlertSounds(
    screen === 'navigating',
    position.lat,
    position.lon,
    trip?.roadAlerts,
    alertSounds,
    navigationStartToken,
    routePoints
  );

  const recalculating = useRouteRecalculation({
    active: screen === 'navigating',
    position,
    trip,
    routePoints,
    vehicle,
    distanceTraveled,
    onTripUpdate: setTrip,
    onNavigationRefresh: () => setNavigationStartToken((t) => t + 1),
    onError: setError,
  });

  return (
    <div className={`app app-waze screen-${screen}`}>
      <div className="map-container">
        <MapView
          userPosition={position}
          userHeading={heading}
          userSpeedMps={speedMps}
          routePoints={routePoints}
          routeOrigin={trip?.origin ?? (routePoints?.[0] ? { lat: routePoints[0].lat, lon: routePoints[0].lon } : undefined)}
          destination={trip?.destination}
          roadAlerts={trip?.roadAlerts}
          nextManeuver={screen === 'navigating' ? nextInstruction : null}
          mode={mapMode}
          layoutKey={screen}
          navigationStartToken={navigationStartToken}
          onFollowChange={setFollowingGps}
          followingGps={followingGps}
          routeOverviewActive={routeOverview}
          routeOverviewToken={routeOverviewToken}
          recenterToken={recenterToken}
          routeAlternatives={mapAlternatives}
          selectedRouteId={trip?.selectedRouteId}
        />

        {screen === 'home' && !trip && (
          <>
            <button type="button" className="home-menu-btn icon-btn" onClick={() => { setConsultOpen(true); setConsultTab('vehicle'); }} aria-label="Menu">
              ☰
            </button>
            <button type="button" className="home-search-bar" onClick={() => setScreen('search')}>
              <span className="home-search-icon">🔍</span>
              Para onde?
            </button>
          </>
        )}

        {screen === 'home' && trip && (
          <button type="button" className="home-search-bar home-search-bar-compact" onClick={() => setScreen('route-preview')}>
            {selectedDest.locationTag ?? selectedDest.label} · {trip.route.totalDistanceKm.toFixed(0)} km
          </button>
        )}

        {screen === 'navigating' && trip && (
          <NavInstructionBanner
            instruction={arrived ? null : nextInstruction}
            userLat={position.lat}
            userLon={position.lon}
            destinationLabel={trip.destination.locationTag ?? trip.destination.address}
            recalculating={recalculating}
            arrived={arrived}
          />
        )}

        {screen === 'navigating' && trip && !routeOverview && (
          <NavSpeedHud speedKmh={speedKmh} limitKmh={speedLimitKmh} fromOsm={speedLimitFromOsm} />
        )}

        {screen === 'navigating' && trip && navRemainder && (
          <NavBottomBar
            arrivalTime={navRemainder.arrivalTime}
            durationRemainingMinutes={navRemainder.durationRemainingMinutes}
            distanceRemainingKm={navRemainder.distanceRemainingKm}
            followingGps={followingGps}
            onRecenter={handleRecenter}
            onViewRoute={handleViewRoute}
            onOpenMenu={() => { setConsultOpen(true); setConsultTab('alerts'); }}
            onEndNavigation={endNavigation}
            routeOverview={routeOverview}
          />
        )}

        {screen === 'navigating' && trip && arrived && (
          <ArrivalSheet
            destinationLabel={trip.destination.locationTag ?? trip.destination.address}
            onEnd={stopNavigation}
            onContinue={() => setArrived(false)}
          />
        )}

        <div className="gps-status">
          <span className={`gps-dot ${gpsActive ? '' : 'inactive'}`} />
          {gpsActive ? 'GPS' : 'Sem GPS'}
          {apiOk === false && ' · offline'}
        </div>
      </div>

      {loading && <div className="loading-overlay">Calculando roteiro…</div>}

      {screen === 'search' && (
        <SearchScreen
          userLat={position.lat}
          userLon={position.lon}
          originLabel={originLabel}
          onBack={() => setScreen('home')}
          onPick={handleSearchPick}
        />
      )}

      {screen === 'route-preview' && trip && !routePreviewMinimized && previewAlternatives.length > 0 && (
        <RoutePreviewSheet
          alternatives={previewAlternatives}
          selectedRouteId={trip.selectedRouteId ?? previewAlternatives[0].id}
          onSelectRoute={handleSelectRoute}
          destination={selectedDest}
          originLabel={originLabel}
          onChoose={handleRouteChoice}
          onBack={goHome}
        />
      )}

      {screen === 'route-preview' && trip && routePreviewMinimized && selectedRouteAlt && (
        <div className="route-preview-minibar">
          <button type="button" className="route-preview-minibar-back icon-btn" onClick={goHome} aria-label="Voltar">
            ←
          </button>
          <div className="route-preview-minibar-info">
            <strong>{formatRouteDuration(selectedRouteAlt.totalDurationMinutes)}</strong>
            <span>
              {selectedRouteAlt.totalDistanceKm.toFixed(0)} km · {formatTollSummary(selectedRouteAlt)}
            </span>
          </div>
          <button type="button" className="primary route-preview-minibar-go" onClick={() => handleRouteChoice('navigate')}>
            Ir agora
          </button>
        </div>
      )}

      {consultOpen && (
        <ConsultSheet
          tab={consultTab}
          onTabChange={setConsultTab}
          onClose={() => setConsultOpen(false)}
          trip={trip}
          vehicle={vehicle}
          onVehicleChange={setVehicle}
          onSaveVehicle={() => { saveVehicleConfig(vehicle); setConsultOpen(false); }}
          fuelDisplay={fuelDisplay}
          originMode={originMode}
          onOriginModeChange={setOriginMode}
          originText={originText}
          onOriginTextChange={setOriginText}
          onOriginPick={(d) => { setOriginText(d.label); setSelectedOrigin(d); }}
          waypoints={waypoints}
          onAddWaypoint={addWaypoint}
          onRemoveWaypoint={removeWaypoint}
          onWaypointChange={(id, label) => setWaypoints((p) => p.map((w) => (w.id === id ? { ...w, label } : w)))}
          onWaypointPick={updateWaypoint}
          userLat={position.lat}
          userLon={position.lon}
          gpsActive={gpsActive}
          distanceTraveled={distanceTraveled}
          alertSounds={alertSounds}
          onAlertSoundsChange={setAlertSounds}
          onSaveAlertSounds={() => {
            saveAlertSoundSettings(alertSounds);
            setConsultOpen(false);
          }}
        />
      )}

      {error && screen === 'home' && (
        <div className="toast-error">{error}</div>
      )}
    </div>
  );
}
