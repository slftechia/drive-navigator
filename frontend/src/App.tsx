import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MapView, { type MapMode } from './components/MapView';
import SearchScreen from './components/SearchScreen';
import RoutePreviewSheet, { type RouteMode } from './components/RoutePreviewSheet';
import NavInstructionBanner from './components/NavInstructionBanner';
import NavBottomBar from './components/NavBottomBar';
import NavSpeedHud from './components/NavSpeedHud';
import NavAlertBanner from './components/NavAlertBanner';
import ArrivalSheet from './components/ArrivalSheet';
import ConsultSheet, { type ConsultTab } from './components/ConsultSheet';
import { type SelectedDestination } from './components/DestinationInput';
import {
  planTrip,
  enrichTripFromApi,
  loadVehicleConfig,
  saveVehicleConfig,
  getCurrentPosition,
  watchPosition,
  isGpsPermissionDenied,
  getFuelStatus,
  checkHealth,
  fetchRoadAlerts,
  type VehicleConfig,
  type TripPlan,
  type FuelAlert,
  type RouteInstruction,
  submitCommunityReport,
  fetchCommunityReportsAlongRoute,
} from './api';
import {
  haversineKm,
  estimateRouteRemainder,
  estimateRoadSpeedLimitKmh,
  sliceRouteWindow,
  routeProgressKm,
} from './utils/geo';
import { findNextAlertAhead, mergeRoadAlerts } from './lib/roadAlerts';
import { loadAlertSoundSettings, saveAlertSoundSettings, unlockAlertAudio, speakNavigation } from './lib/alertSounds';
import { useRoadAlertSounds } from './hooks/useRoadAlertSounds';
import { useRoadAlertsLoader } from './hooks/useRoadAlertsLoader';
import { useFuelPoisLoader } from './hooks/useFuelPoisLoader';
import { useRouteRecalculation } from './hooks/useRouteRecalculation';
import { useArrivalDetection } from './hooks/useArrivalDetection';
import { useSpeedLimit } from './hooks/useSpeedLimit';
import { useNavVoiceGuidance } from './hooks/useNavVoiceGuidance';
import NavAudioSheet from './components/NavAudioSheet';
import PlaceDetailSheet, { type PlaceDetail } from './components/PlaceDetailSheet';
import InstallPrompt from './components/InstallPrompt';
import LegalConsentModal from './components/LegalConsentModal';
import LegalDocSheet from './components/LegalDocSheet';
import ReportSheet from './components/ReportSheet';
import { useAutoTheme } from './hooks/useAutoTheme';
import { useCurrentStreet } from './hooks/useCurrentStreet';
import { loadRecentSearches, type RecentSearch } from './lib/searchHistory';
import { openMusicApp } from './lib/musicApps';
import {
  loadSavedPlaces,
  setHomePlace,
  setWorkPlace,
  clearHomePlace,
  clearWorkPlace,
  addFavorite,
  removeFavorite,
  savedPlaceToDestination,
  type SavedPlace,
} from './lib/savedPlaces';
import { loadLegalConsent, saveLegalConsent, type LegalDoc } from './lib/legal';
import { ALERT_TYPE_META } from './lib/alertTypes';
import { addUserReport, userReportsAsRoadAlerts, type ReportType } from './lib/userReports';
import { clearDestinationShareParams, parseDestinationFromUrl, shareDestination } from './lib/shareDestination';
import { liveTrafficFromPace } from './lib/trafficEstimate';
import './App.css';

type AppScreen = 'home' | 'search' | 'place-detail' | 'route-preview' | 'navigating';

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
  lon: number,
  routePoints?: Array<{ lat: number; lon: number }>
): RouteInstruction | null {
  if (!instructions?.length) return null;

  // Preferência: primeira manobra à frente na polyline (evita seta atrás do carro).
  if (routePoints && routePoints.length >= 2) {
    const userKm = routeProgressKm({ lat, lon }, routePoints);
    let bestAhead: RouteInstruction | null = null;
    let bestAheadKm = Infinity;
    for (const inst of instructions) {
      const instKm = routeProgressKm(inst, routePoints);
      if (instKm < userKm + 0.025) continue;
      if (instKm < bestAheadKm) {
        bestAheadKm = instKm;
        bestAhead = inst;
      }
    }
    if (bestAhead) return bestAhead;
  }

  let best: RouteInstruction | null = null;
  let bestDist = Infinity;
  for (const inst of instructions) {
    const d = haversineKm(lat, lon, inst.lat, inst.lon);
    if (d > 0.04 && d < bestDist) {
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

function getThenInstruction(
  instructions: RouteInstruction[] | undefined,
  current: RouteInstruction | null,
  lat: number,
  lon: number,
  routePoints?: Array<{ lat: number; lon: number }>
): RouteInstruction | null {
  if (!instructions?.length || !current) return null;
  const idx = instructions.findIndex(
    (i) => i.lat === current.lat && i.lon === current.lon && i.message === current.message
  );
  if (idx >= 0 && idx < instructions.length - 1) return instructions[idx + 1];
  if (!routePoints?.length) return null;
  const currentKm = routeProgressKm(current, routePoints);
  let best: RouteInstruction | null = null;
  let bestKm = Infinity;
  for (const inst of instructions) {
    const km = routeProgressKm(inst, routePoints);
    if (km <= currentKm + 0.04) continue;
    if (km < bestKm) {
      bestKm = km;
      best = inst;
    }
  }
  if (best && haversineKm(lat, lon, best.lat, best.lon) > 0.02) return best;
  return null;
}

export default function App() {
  const theme = useAutoTheme();
  const [homeRecents, setHomeRecents] = useState<RecentSearch[]>(() => loadRecentSearches().slice(0, 3));
  const [screen, setScreen] = useState<AppScreen>('home');
  const [vehicle, setVehicle] = useState<VehicleConfig>(loadVehicleConfig);
  const [selectedDest, setSelectedDest] = useState<SelectedDestination>({ label: '' });
  const [position, setPosition] = useState(DEFAULT_CENTER);
  const [gpsState, setGpsState] = useState<'searching' | 'active' | 'denied'>('searching');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [liveFuel, setLiveFuel] = useState<FuelAlert | null>(null);
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
  const [previewFitToken, setPreviewFitToken] = useState(0);
  const [routePreviewMinimized, setRoutePreviewMinimized] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [consultTab, setConsultTab] = useState<ConsultTab>('route');
  const [alertSounds, setAlertSounds] = useState(loadAlertSoundSettings);
  const [arrived, setArrived] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState(loadSavedPlaces);
  const [legalAccepted, setLegalAccepted] = useState(() => loadLegalConsent() != null);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportToast, setReportToast] = useState<string | null>(null);
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null);
  const [placeFavSaved, setPlaceFavSaved] = useState(false);
  const [placeOverlay, setPlaceOverlay] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [audioSheetOpen, setAudioSheetOpen] = useState(false);

  const gpsActive = gpsState === 'active';
  const gpsLabel =
    gpsState === 'active' ? 'GPS' : gpsState === 'searching' ? 'Localizando…' : 'Sem GPS';

  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const vehicleRef = useRef(vehicle);
  const tripRef = useRef(trip);
  const screenRef = useRef(screen);
  useEffect(() => { vehicleRef.current = vehicle; }, [vehicle]);
  useEffect(() => { tripRef.current = trip; }, [trip]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    void checkHealth().catch(() => {});
    void fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/health`, { method: 'GET' }).catch(() => {});

    const shared = parseDestinationFromUrl();
    if (shared) {
      clearDestinationShareParams();
      setPlaceDetail({
        label: shared.label,
        placeName: shared.label,
        locationTag: shared.label,
        lat: shared.lat,
        lon: shared.lon,
        resultKind: 'other',
      });
      setPlaceFavSaved(false);
      setFollowingGps(false);
      setScreen('place-detail');
    }
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
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const applyPosition = (p: GeolocationPosition) => {
      const newLat = p.coords.latitude;
      const newLon = p.coords.longitude;
      if (!isAcceptableGps(newLat, newLon)) return;
      const t = tripRef.current;
      const pts = t?.route.legs.flatMap((leg) => leg.points ?? []);
      const origin = t?.origin ?? pts?.[0];
      const navigating = screenRef.current === 'navigating';
      if (t && !navigating && !isGpsNearRoute(newLat, newLon, pts, origin)) return;
      setGpsState('active');
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
    };

    const startWatch = () => {
      if (cancelled || watchIdRef.current !== null) return;
      watchIdRef.current = watchPosition(applyPosition, (err) => {
        if (isGpsPermissionDenied(err)) {
          setGpsState('denied');
          setError('Ative a permissão de localização nas configurações do navegador.');
        }
      });
    };

    const acquireGps = (attempt = 0) => {
      getCurrentPosition()
        .then((pos) => {
          if (cancelled) return;
          applyPosition(pos);
          startWatch();
        })
        .catch(() => {
          if (cancelled) return;
          if (attempt < 2) {
            retryTimer = window.setTimeout(() => acquireGps(attempt + 1), 2_500);
            return;
          }
          setGpsState('denied');
          setError('Não foi possível obter localização. Verifique se o GPS está ativo.');
        });
    };

    acquireGps();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
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
      const tripParams = {
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
      };
      const result = await planTrip(tripParams);
      setTrip({
        ...result,
        roadAlerts: mergeRoadAlerts(result.roadAlerts, userReportsAsRoadAlerts()),
      });
      setLiveFuel(result.fuelAlert);
      setRoutePreviewMinimized(false);
      setPreviewFitToken((t) => t + 1);
      setScreen('route-preview');

      const pts = result.route.legs.flatMap((leg) => leg.points ?? []);
      if (pts.length >= 2) {
        const alertPts =
          result.route.totalDistanceKm > 70
            ? sliceRouteWindow(pts, origin.lat, origin.lon, 8, 95)
            : pts;
        void fetchRoadAlerts(alertPts).then((roadAlerts) => {
          if (!roadAlerts.length) return;
          setTrip((prev) =>
            prev ? { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, roadAlerts) } : prev
          );
        }).catch(() => { /* alertas carregam em segundo plano */ });

        void fetchCommunityReportsAlongRoute(alertPts).then((reports) => {
          if (!reports.length) return;
          setTrip((prev) =>
            prev ? { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, reports) } : prev
          );
        }).catch(() => { /* comunidade opcional */ });

        void import('./lib/poisDirect').then(({ fetchFuelPoisAlongRoute }) =>
          fetchFuelPoisAlongRoute(pts, origin.lat, origin.lon, 8, 50).then((pois) => {
            if (!pois.length) return;
            setTrip((prev) => {
              if (!prev) return prev;
              const existing = prev.pois?.filter((p) => p.category !== 'fuel') ?? [];
              return { ...prev, pois: [...existing, ...pois] };
            });
          })
        ).catch(() => { /* postos carregam em segundo plano */ });
      }

      void enrichTripFromApi(tripParams, result).then((enriched) => {
        setTrip((prev) => {
          if (!prev || prev.destination.address !== enriched.destination.address) return prev;
          return {
            ...enriched,
            pois: prev.pois?.length ? prev.pois : enriched.pois,
            roadAlerts: mergeRoadAlerts(
              prev.roadAlerts?.length ? prev.roadAlerts : enriched.roadAlerts,
              userReportsAsRoadAlerts()
            ),
          };
        });
      }).catch(() => { /* alternativas/pedágios em segundo plano */ });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes('AbortError') || msg.includes('demorou demais')
          ? 'A requisição demorou demais. Tente novamente.'
          : msg.includes('fetch failed') || msg.includes('Failed to fetch')
            ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
            : msg
      );
    } finally {
      setLoading(false);
    }
  }, [resolveOrigin, waypoints, vehicle]);

  const handleSearchPick = (dest: SelectedDestination) => {
    setHomeRecents(loadRecentSearches().slice(0, 3));
    setPlaceDetail({
      ...dest,
      address: dest.address,
      resultKind: dest.resultKind,
    });
    setPlaceFavSaved(false);
    setFollowingGps(false);
    setScreen('place-detail');
  };

  const handlePlaceRoutes = () => {
    if (!placeDetail) return;
    const dest = placeDetail;
    setPlaceDetail(null);
    setPlaceOverlay(false);
    planRoute(dest);
  };

  const openPlaceFromPoi = (poi: { name: string; lat: number; lon: number; address?: string; category?: string }) => {
    setPlaceDetail({
      label: poi.name,
      placeName: poi.name,
      address: poi.address,
      locationTag: poi.address || poi.name,
      lat: poi.lat,
      lon: poi.lon,
      resultKind: 'poi',
    });
    setPlaceFavSaved(false);
    setFollowingGps(false);
    if (screen === 'search' || screen === 'home' || screen === 'place-detail') {
      setPlaceOverlay(false);
      setScreen('place-detail');
    } else {
      setPlaceOverlay(true);
    }
  };

  const openSavedTab = () => {
    setConsultTab('saved');
    setConsultOpen(true);
  };

  const goToSavedPlace = (place: SavedPlace) => {
    setConsultOpen(false);
    planRoute(savedPlaceToDestination(place));
  };

  const requireCoords = (d: SelectedDestination): d is SelectedDestination & { lat: number; lon: number } =>
    d.lat != null && d.lon != null && Number.isFinite(d.lat) && Number.isFinite(d.lon);

  const handleQuickHome = () => {
    if (savedPlaces.home) goToSavedPlace(savedPlaces.home);
    else openSavedTab();
  };

  const handleQuickWork = () => {
    if (savedPlaces.work) goToSavedPlace(savedPlaces.work);
    else openSavedTab();
  };

  const handleUserReport = (type: ReportType) => {
    const report = addUserReport(type, position.lat, position.lon);
    setTrip((prev) =>
      prev ? { ...prev, roadAlerts: mergeRoadAlerts(prev.roadAlerts, [report]) } : prev
    );
    setReportOpen(false);
    const msg = `${ALERT_TYPE_META[type].label} reportado — obrigado!`;
    setReportToast(msg);
    if ((alertSounds.navGuidance || alertSounds.voice) && !alertSounds.muted) {
      speakNavigation(ALERT_TYPE_META[type].speak, alertSounds);
    }
    window.setTimeout(() => setReportToast(null), 2200);

    void submitCommunityReport({
      type,
      lat: position.lat,
      lon: position.lon,
      label: report.label,
    }).then((remote) => {
      if (!remote) return;
      setTrip((prev) =>
        prev
          ? {
              ...prev,
              roadAlerts: mergeRoadAlerts(prev.roadAlerts, [
                {
                  id: remote.id,
                  type: remote.type,
                  lat: remote.lat,
                  lon: remote.lon,
                  label: remote.confirms > 1 ? `${remote.label} · ${remote.confirms}x` : remote.label,
                },
              ]),
            }
          : prev
      );
    });
  };

  useEffect(() => {
    if (screen === 'home') setHomeRecents(loadRecentSearches().slice(0, 3));
  }, [screen]);

  const handleRouteChoice = (mode: RouteMode) => {
    if (mode === 'navigate') {
      unlockAlertAudio();
      setArrived(false);
      setFollowingGps(true);
      setRouteOverview(false);
      setRoutePreviewMinimized(false);
      // Token novo força câmera colada no GPS (não fica na visão macro da prévia).
      setNavigationStartToken((t) => t + 1);
      setRecenterToken((t) => t + 1);
      setScreen('navigating');
      return;
    }
    // "Sair depois": guarda a rota, mostra no mapa e volta à home com barra "Ir agora".
    setRoutePreviewMinimized(true);
    setFollowingGps(false);
    setRouteOverview(true);
    setRouteOverviewToken((t) => t + 1);
    setPreviewFitToken((t) => t + 1);
    setScreen('home');
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

  const goHome = useCallback(() => {
    setArrived(false);
    setScreen('home');
    setTrip(null);
    setSelectedDest({ label: '' });
    setPlaceDetail(null);
    setPlaceOverlay(false);
    setFollowingGps(true);
    setRouteOverview(false);
    setRoutePreviewMinimized(false);
  }, []);

  /** Encerrar de verdade: limpa a viagem (não volta à prévia com countdown que reinicia). */
  const stopNavigation = useCallback(() => {
    goHome();
  }, [goHome]);

  const endNavigation = useCallback(() => {
    if (window.confirm('Encerrar a navegação?')) {
      goHome();
    }
  }, [goHome]);

  const handleRecenter = () => {
    setRouteOverview(false);
    setFollowingGps(true);
    setRecenterToken((t) => t + 1);
    setNavigationStartToken((t) => t + 1);
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
    // Home com rota salva ("Sair depois"): mantém linha da rota no mapa.
    if (screen === 'home' && trip) return 'preview';
    return 'idle';
  }, [screen, trip]);

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
    const all = trip.route.legs.flatMap((leg) => leg.points ?? []);
    return all.length >= 2 ? all : undefined;
  }, [trip]);

  useRoadAlertsLoader({
    active: screen === 'navigating' || (screen === 'route-preview' && routePreviewMinimized),
    position,
    routePoints,
    navigationStartToken,
    onAlerts: setTrip,
  });

  useFuelPoisLoader({
    active: screen === 'navigating' || screen === 'route-preview' || (screen === 'home' && !!trip),
    position,
    routePoints,
    navigationStartToken,
    onPois: setTrip,
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

  const liveTraffic = useMemo(() => {
    if (screen !== 'navigating' || !trip?.route || !navRemainder) return null;
    const fraction =
      trip.route.totalDistanceKm > 0
        ? navRemainder.distanceRemainingKm / trip.route.totalDistanceKm
        : 1;
    const freeFlowMin = Math.max(1, Math.round(trip.route.totalDurationMinutes * fraction));
    return liveTrafficFromPace(navRemainder.distanceRemainingKm, freeFlowMin, speedMps);
  }, [screen, trip, navRemainder, speedMps]);

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
  const nextInstruction = getNextInstruction(
    trip?.route.instructions,
    position.lat,
    position.lon,
    routePoints
  );
  const thenInstruction = getThenInstruction(
    trip?.route.instructions,
    nextInstruction,
    position.lat,
    position.lon,
    routePoints
  );

  const instructionStreetFallback = (() => {
    const msg = nextInstruction?.message?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
    const m =
      msg.match(/\bpor\s+(.+)$/i) ||
      msg.match(/\bem\s+(.+)$/i) ||
      msg.match(/\bna\s+(.+)$/i);
    return m?.[1]?.replace(/\.$/, '').trim() || null;
  })();

  const currentStreet = useCurrentStreet(
    screen === 'navigating' && !arrived,
    position.lat,
    position.lon,
    instructionStreetFallback
  );

  const nextRoadAlert =
    screen === 'navigating' && trip && !arrived
      ? findNextAlertAhead(trip.roadAlerts, position, routePoints, 500)
      : null;

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

  useNavVoiceGuidance({
    active: screen === 'navigating' && !arrived && !recalculating,
    enabled: alertSounds.navGuidance && !alertSounds.muted,
    instruction: nextInstruction,
    userLat: position.lat,
    userLon: position.lon,
    navigationStartToken,
  });

  return (
    <div className={`app app-waze screen-${screen} theme-${theme}`} data-theme={theme}>
      <div className="map-container">
        <MapView
          key={`map-${theme}`}
          mapTheme={theme}
          userPosition={position}
          userHeading={heading}
          userSpeedMps={speedMps}
          routePoints={routePoints}
          routeOrigin={trip?.origin ?? (routePoints?.[0] ? { lat: routePoints[0].lat, lon: routePoints[0].lon } : undefined)}
          destination={
            trip?.destination ??
            (screen === 'place-detail' && placeDetail?.lat != null && placeDetail.lon != null
              ? { lat: placeDetail.lat, lon: placeDetail.lon }
              : undefined)
          }
          roadAlerts={trip?.roadAlerts}
          fuelPois={trip?.pois}
          nextManeuver={screen === 'navigating' ? nextInstruction : null}
          mode={mapMode}
          layoutKey={screen}
          navigationStartToken={navigationStartToken}
          onFollowChange={setFollowingGps}
          followingGps={followingGps}
          routeOverviewActive={routeOverview}
          routeOverviewToken={routeOverviewToken}
          previewFitToken={previewFitToken}
          recenterToken={recenterToken}
          routeAlternatives={mapAlternatives}
          selectedRouteId={trip?.selectedRouteId}
          onFuelPoiClick={openPlaceFromPoi}
        />

        {screen === 'home' && !trip && (
          <>
            <button type="button" className="home-menu-btn icon-btn" onClick={() => { setConsultOpen(true); setConsultTab('vehicle'); }} aria-label="Menu">
              ☰
            </button>
            <InstallPrompt />
            <div className="home-sheet">
              <button type="button" className="home-search-bar" onClick={() => setScreen('search')}>
                <span className="home-search-icon">🔍</span>
                <span className="home-search-label">Para onde?</span>
              </button>
              <div className="home-quick-row">
                <button type="button" className="home-quick-btn" onClick={handleQuickHome}>
                  <span aria-hidden>🏠</span>
                  {savedPlaces.home ? 'Casa' : 'Definir casa'}
                </button>
                <button type="button" className="home-quick-btn" onClick={handleQuickWork}>
                  <span aria-hidden>💼</span>
                  {savedPlaces.work ? 'Trabalho' : 'Definir trabalho'}
                </button>
                <button type="button" className="home-quick-btn" onClick={openSavedTab}>
                  <span aria-hidden>📍</span>
                  Salvos
                </button>
              </div>
              {homeRecents.length > 0 && (
                <div className="home-recents">
                  <h3>Recentes</h3>
                  {homeRecents.map((r, i) => (
                    <button
                      key={`hr-${r.id}-${i}`}
                      type="button"
                      className="home-recent-row"
                      onClick={() => {
                        handleSearchPick({
                          label: r.label,
                          lat: r.lat,
                          lon: r.lon,
                          placeName: r.placeName,
                          locationTag: r.locationTag || r.address,
                          address: r.address,
                          resultKind: r.resultKind,
                          city: r.city,
                          stateCode: r.stateCode,
                        });
                      }}
                    >
                      <span className="home-recent-icon" aria-hidden>🕒</span>
                      <span className="home-recent-text">
                        <strong>{r.placeName || r.label}</strong>
                        <em>{r.locationTag || r.address || r.city}</em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {screen === 'home' && trip && (
          <div className="route-later-bar">
            <button
              type="button"
              className="route-later-info"
              onClick={() => {
                setRoutePreviewMinimized(false);
                setRouteOverview(false);
                setScreen('route-preview');
                setPreviewFitToken((t) => t + 1);
              }}
            >
                <strong>{selectedDest.locationTag ?? selectedDest.label ?? trip.destination.locationTag}</strong>
              <span>
                {trip.route.totalDistanceKm.toFixed(0)} km · toque para ver a rota
              </span>
            </button>
            <button type="button" className="primary route-later-go" onClick={() => handleRouteChoice('navigate')}>
              Ir agora
            </button>
          </div>
        )}

        {screen === 'navigating' && trip && (
          <NavInstructionBanner
            instruction={arrived ? null : nextInstruction}
            thenInstruction={arrived || recalculating ? null : thenInstruction}
            userLat={position.lat}
            userLon={position.lon}
            destinationLabel={trip.destination.locationTag ?? trip.destination.address}
            recalculating={recalculating}
            arrived={arrived}
          />
        )}

        {screen === 'navigating' && trip && !routeOverview && (
          <div className="nav-side-fabs">
            <button
              type="button"
              className="nav-side-fab"
              aria-label="Música"
              onClick={() => openMusicApp('spotify')}
            >
              ♪
            </button>
            <button
              type="button"
              className={`nav-side-fab${alertSounds.muted ? ' nav-side-fab-muted' : ''}`}
              aria-label={alertSounds.muted ? 'Ativar som' : 'Silenciar'}
              onClick={() => {
                const next = { ...alertSounds, muted: !alertSounds.muted };
                setAlertSounds(next);
                saveAlertSoundSettings(next);
                if (next.muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                }
              }}
            >
              {alertSounds.muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              className="nav-side-fab"
              aria-label="Opções de áudio"
              onClick={() => setAudioSheetOpen(true)}
            >
              ⋯
            </button>
          </div>
        )}

        {screen === 'navigating' && trip && !routeOverview && (
          <div className="nav-street-row">
            <NavSpeedHud speedKmh={speedKmh} limitKmh={speedLimitKmh} fromOsm={speedLimitFromOsm} />
            {currentStreet && (
              <div className="nav-current-street" title={currentStreet}>
                {currentStreet}
              </div>
            )}
          </div>
        )}

        {screen === 'navigating' && trip && !routeOverview && nextRoadAlert && (
          <NavAlertBanner
            alert={nextRoadAlert.alert}
            distanceMeters={nextRoadAlert.distanceMeters}
          />
        )}

        {screen === 'navigating' && trip && !arrived && (
          <button
            type="button"
            className="nav-report-fab"
            onClick={() => setReportOpen(true)}
            aria-label="Reportar alerta"
          >
            ＋
          </button>
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
            trafficHint={liveTraffic?.label ?? null}
            trafficLevel={liveTraffic?.level ?? null}
          />
        )}

        {screen === 'navigating' && trip && arrived && (
          <ArrivalSheet
            destinationLabel={trip.destination.locationTag ?? trip.destination.address}
            onEnd={stopNavigation}
            onContinue={() => setArrived(false)}
          />
        )}

        <div
          className={`gps-status gps-status-${gpsState}`}
          title={
            gpsState === 'active'
              ? 'Localização ativa'
              : gpsState === 'searching'
                ? 'Obtendo sua posição…'
                : 'Permita o acesso à localização'
          }
        >
          <span className={`gps-dot ${gpsState === 'active' ? '' : gpsState === 'searching' ? 'pending' : 'inactive'}`} />
          {gpsLabel}
        </div>
      </div>

      {loading && <div className="loading-overlay">Calculando rota…</div>}

      {screen === 'search' && (
        <SearchScreen
          userLat={position.lat}
          userLon={position.lon}
          originLabel={originLabel}
          onBack={() => setScreen('home')}
          onPick={handleSearchPick}
        />
      )}

      {(screen === 'place-detail' || placeOverlay) && placeDetail && (
        <PlaceDetailSheet
          place={placeDetail}
          userLat={position.lat}
          userLon={position.lon}
          onBack={() => {
            setPlaceDetail(null);
            setPlaceOverlay(false);
            if (screen === 'place-detail') setScreen('search');
          }}
          onRoutes={handlePlaceRoutes}
          onSaveFavorite={() => {
            if (placeDetail.lat == null || placeDetail.lon == null) return;
            setSavedPlaces(
              addFavorite({
                label: placeDetail.label,
                placeName: placeDetail.placeName,
                city: placeDetail.city,
                stateCode: placeDetail.stateCode,
                locationTag: placeDetail.locationTag || placeDetail.address,
                lat: placeDetail.lat,
                lon: placeDetail.lon,
              })
            );
            setPlaceFavSaved(true);
          }}
          favoriteSaved={placeFavSaved}
          shareHint={shareHint}
          onShare={() => {
            if (placeDetail.lat == null || placeDetail.lon == null) return;
            void shareDestination({
              lat: placeDetail.lat,
              lon: placeDetail.lon,
              label: placeDetail.placeName || placeDetail.label,
            }).then((result) => {
              if (result === 'shared') setShareHint('Compartilhado');
              else if (result === 'copied') setShareHint('Link copiado');
              else setShareHint('Não foi possível compartilhar');
              window.setTimeout(() => setShareHint(null), 2200);
            });
          }}
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
          homePlace={savedPlaces.home}
          workPlace={savedPlaces.work}
          favorites={savedPlaces.favorites}
          onSetHome={(d) => {
            if (!requireCoords(d)) return;
            setSavedPlaces(setHomePlace(d));
          }}
          onSetWork={(d) => {
            if (!requireCoords(d)) return;
            setSavedPlaces(setWorkPlace(d));
          }}
          onClearHome={() => setSavedPlaces(clearHomePlace())}
          onClearWork={() => setSavedPlaces(clearWorkPlace())}
          onAddFavorite={(d) => {
            if (!requireCoords(d)) return;
            setSavedPlaces(addFavorite(d));
          }}
          onRemoveFavorite={(id) => setSavedPlaces(removeFavorite(id))}
          onGoToSaved={goToSavedPlace}
          onUseGpsAsHome={() => {
            if (!gpsActive) return;
            setSavedPlaces(
              setHomePlace({
                label: 'Casa',
                placeName: 'Casa',
                locationTag: 'Posição atual',
                lat: position.lat,
                lon: position.lon,
              })
            );
          }}
          onUseGpsAsWork={() => {
            if (!gpsActive) return;
            setSavedPlaces(
              setWorkPlace({
                label: 'Trabalho',
                placeName: 'Trabalho',
                locationTag: 'Posição atual',
                lat: position.lat,
                lon: position.lon,
              })
            );
          }}
          onOpenTerms={() => setLegalDoc('terms')}
          onOpenPrivacy={() => setLegalDoc('privacy')}
          onSelectPoi={(poi) => {
            setConsultOpen(false);
            openPlaceFromPoi(poi);
          }}
        />
      )}

      {audioSheetOpen && (
        <NavAudioSheet
          settings={alertSounds}
          onChange={setAlertSounds}
          onSave={() => saveAlertSoundSettings(alertSounds)}
          onClose={() => setAudioSheetOpen(false)}
        />
      )}

      {reportOpen && (
        <ReportSheet onClose={() => setReportOpen(false)} onReport={handleUserReport} />
      )}

      {legalDoc && (
        <LegalDocSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
      )}

      {!legalAccepted && (
        <LegalConsentModal
          onAccept={() => {
            saveLegalConsent();
            setLegalAccepted(true);
          }}
          onOpenTerms={() => setLegalDoc('terms')}
          onOpenPrivacy={() => setLegalDoc('privacy')}
        />
      )}

      {reportToast && <div className="toast-ok">{reportToast}</div>}

      {error && screen === 'home' && (
        <div className="toast-error">{error}</div>
      )}
    </div>
  );
}
