import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  geocodeAddress,
  calculateRouteAlternatives,
  searchPoisAlongRoute,
  searchAddressSuggestions,
  computeFuelAlert,
  computeScheduledStops,
  searchRoadAlertsAlongRoute,
  searchRoadAlertsNearPoint,
  querySpeedLimitAt,
  searchNearbyPois,
  DEFAULT_POI_CATEGORIES,
  PoiCategory,
} from './lib/maps';

export function createApp() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'drive-navigator-api', version: '0.2.0', stack: 'render+firebase+osm' });
  });

  app.get('/maps/config', (_req: Request, res: Response) => {
    res.json({ provider: 'openstreetmap', key: '' });
  });

  app.get('/geocode', async (req: Request, res: Response) => {
    const query = req.query.q as string | undefined;
    if (!query) {
      res.status(400).json({ error: 'Parâmetro q (endereço) é obrigatório' });
      return;
    }

    try {
      const result = await geocodeAddress(query);
      if (!result) {
        res.status(404).json({ error: 'Endereço não encontrado' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('Geocode error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/search/suggestions', async (req: Request, res: Response) => {
    const query = req.query.q as string | undefined;
    if (!query) {
      res.json({ suggestions: [] });
      return;
    }

    const lat = req.query.lat ? Number(req.query.lat) : undefined;
    const lon = req.query.lon ? Number(req.query.lon) : undefined;

    try {
      const suggestions = await searchAddressSuggestions(query, { lat, lon });
      res.json({ suggestions });
    } catch (err) {
      console.error('Search suggestions error:', err);
      res.json({ suggestions: [] });
    }
  });

  app.post('/trip/plan', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        originLat: number;
        originLon: number;
        destination: string;
        destinationLat?: number;
        destinationLon?: number;
        currentFuelKm: number;
        fuelReserveKm?: number;
        stopIntervalMinutes?: number;
        destinationLocationTag?: string;
        categories?: PoiCategory[];
        waypoints?: Array<{ lat: number; lon: number }>;
      };

      const {
        originLat,
        originLon,
        destination,
        currentFuelKm,
        fuelReserveKm = 50,
        stopIntervalMinutes = 120,
        waypoints = [],
      } = body;

      if (!originLat || !originLon || !destination) {
        res.status(400).json({ error: 'originLat, originLon e destination são obrigatórios' });
        return;
      }

      let destLat = body.destinationLat;
      let destLon = body.destinationLon;

      if (!destLat || !destLon) {
        const geocoded = await geocodeAddress(destination);
        if (!geocoded) {
          res.status(404).json({ error: 'Destino não encontrado' });
          return;
        }
        destLat = geocoded.lat;
        destLon = geocoded.lon;
      }

      const validWaypoints = waypoints.filter((w) => w.lat && w.lon);

      const { alternatives, defaultId } = await calculateRouteAlternatives({
        originLat,
        originLon,
        destLat: destLat!,
        destLon: destLon!,
        waypoints: validWaypoints.length > 0 ? validWaypoints : undefined,
      });

      const selected = alternatives.find((a) => a.id === defaultId) ?? alternatives[0];
      if (!selected) {
        res.status(404).json({ error: 'Nenhuma rota encontrada' });
        return;
      }

      const {
        id: _id,
        kind: _k,
        label: _l,
        hasTolls: _h,
        tollCount: _t,
        tollCostEstimateBrl: _c,
        ...route
      } = selected;

      const fuelAlert = computeFuelAlert(originLat, originLon, currentFuelKm, fuelReserveKm, []);
      const scheduledStops = computeScheduledStops(route.totalDurationMinutes, stopIntervalMinutes);

      res.json({
        origin: { lat: originLat, lon: originLon },
        destination: {
          lat: destLat,
          lon: destLon,
          address: body.destinationLocationTag ?? destination,
          locationTag: body.destinationLocationTag,
        },
        waypoints: validWaypoints,
        route,
        routeAlternatives: alternatives,
        selectedRouteId: selected.id,
        pois: [],
        roadAlerts: [],
        fuelAlert,
        scheduledStops,
      });
    } catch (err) {
      console.error('Plan trip error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/trip/pois', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        routePoints?: Array<{ lat: number; lon: number }>;
        categories?: PoiCategory[];
      };

      const routePoints = body.routePoints ?? [];
      if (routePoints.length < 2) {
        res.json({ pois: [] });
        return;
      }

      const cats = body.categories?.length ? body.categories : DEFAULT_POI_CATEGORIES;
      const pois = await searchPoisAlongRoute(routePoints, cats);
      res.json({ pois });
    } catch (err) {
      console.error('Trip POIs error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/trip/road-alerts', async (req: Request, res: Response) => {
    try {
      const body = req.body as { routePoints?: Array<{ lat: number; lon: number }> };
      const routePoints = body.routePoints ?? [];
      if (routePoints.length < 2) {
        res.json({ roadAlerts: [] });
        return;
      }
      const roadAlerts = await searchRoadAlertsAlongRoute(routePoints);
      res.json({ roadAlerts });
    } catch (err) {
      console.error('Road alerts error:', err);
      res.json({ roadAlerts: [] });
    }
  });

  app.post('/trip/road-alerts-near', async (req: Request, res: Response) => {
    try {
      const body = req.body as { lat?: number; lon?: number; radiusM?: number };
      const lat = body.lat;
      const lon = body.lon;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        res.json({ roadAlerts: [] });
        return;
      }
      const radiusM = body.radiusM ?? 3500;
      const roadAlerts = await searchRoadAlertsNearPoint(lat, lon, radiusM);
      res.json({ roadAlerts });
    } catch (err) {
      console.error('Road alerts near error:', err);
      res.json({ roadAlerts: [] });
    }
  });

  app.post('/trip/speed-limit', async (req: Request, res: Response) => {
    try {
      const body = req.body as { lat?: number; lon?: number };
      const lat = body.lat;
      const lon = body.lon;
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        res.json({ speedLimitKmh: null, source: 'none' });
        return;
      }

      const speedLimitKmh = await querySpeedLimitAt(lat, lon);
      res.json({
        speedLimitKmh,
        source: speedLimitKmh != null ? 'osm' : 'none',
      });
    } catch (err) {
      console.error('Speed limit error:', err);
      res.json({ speedLimitKmh: null, source: 'none' });
    }
  });

  app.post('/fuel/status', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        currentLat: number;
        currentLon: number;
        remainingFuelKm: number;
        fuelReserveKm?: number;
        routePoints?: Array<{ lat: number; lon: number }>;
      };

      const { currentLat, currentLon, remainingFuelKm, fuelReserveKm = 50, routePoints = [] } = body;

      const fuelPois = routePoints.length
        ? await searchPoisAlongRoute(routePoints, ['fuel'])
        : await searchNearbyPois(currentLat, currentLon, 'fuel', 15000);

      const alert = computeFuelAlert(currentLat, currentLon, remainingFuelKm, fuelReserveKm, fuelPois);
      res.json(alert);
    } catch (err) {
      console.error('Fuel status error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  return app;
}

export function createApiApp() {
  const app = createApp();
  const api = express();
  api.use('/api', app);
  return api;
}
