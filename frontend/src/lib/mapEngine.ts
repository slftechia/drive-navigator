/**
 * Adapter MapLibre + OpenFreeMap — API compatível com o surface do Azure Maps usado em MapView.
 */
import maplibregl, { Map as MapLibreMap, Marker, LngLatBoundsLike, PaddingOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type Position = [number, number];

let loadPromise: Promise<AtlasNamespace> | null = null;

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export interface AtlasNamespace {
  Map: typeof AtlasMap;
  source: { DataSource: typeof AtlasDataSource };
  data: {
    Feature: typeof AtlasFeature;
    LineString: typeof AtlasLineString;
    Point: typeof AtlasPoint;
    BoundingBox: { fromPositions(positions: Position[]): LngLatBoundsLike };
    Position: Position;
  };
  layer: {
    LineLayer: typeof AtlasLineLayer;
    BubbleLayer: typeof AtlasBubbleLayer;
  };
  HtmlMarker: typeof AtlasHtmlMarker;
  AuthenticationType: { subscriptionKey: string };
}

declare global {
  interface Window {
    __driveNavAtlas?: AtlasNamespace;
  }
}

class AtlasFeature {
  geometry: AtlasLineString | AtlasPoint;
  properties?: Record<string, unknown>;

  constructor(geometry: AtlasLineString | AtlasPoint, properties?: Record<string, unknown>) {
    this.geometry = geometry;
    this.properties = properties;
  }
}

class AtlasLineString {
  coordinates: Position[];
  type = 'LineString' as const;

  constructor(coordinates: Position[]) {
    this.coordinates = coordinates;
  }
}

class AtlasPoint {
  coordinates: Position;
  type = 'Point' as const;

  constructor(coordinates: Position) {
    this.coordinates = coordinates;
  }
}

class AtlasDataSource {
  readonly id = `ds-${Math.random().toString(36).slice(2, 10)}`;
  private features: GeoJSON.Feature[] = [];
  private map: MapLibreMap | null = null;

  bind(map: MapLibreMap) {
    this.map = map;
    map.addSource(this.id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  private sync() {
    if (!this.map) return;
    const source = this.map.getSource(this.id) as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: this.features });
  }

  clear() {
    this.features = [];
    this.sync();
  }

  add(feature: AtlasFeature) {
    const geom = feature.geometry;
    if (geom instanceof AtlasLineString) {
      this.features.push({
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: { type: 'LineString', coordinates: geom.coordinates },
      });
    } else if (geom instanceof AtlasPoint) {
      this.features.push({
        type: 'Feature',
        properties: feature.properties ?? {},
        geometry: { type: 'Point', coordinates: geom.coordinates },
      });
    }
    this.sync();
  }
}

class AtlasLineLayer {
  constructor(
    private readonly ds: AtlasDataSource,
    readonly id: string,
    private readonly options: { strokeColor?: string; strokeWidth?: number }
  ) {}

  bind(map: MapLibreMap) {
    map.addLayer({
      id: this.id,
      type: 'line',
      source: this.ds.id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': this.options.strokeColor ?? '#0ea5e9',
        'line-width': this.options.strokeWidth ?? 6,
      },
    });
  }
}

class AtlasBubbleLayer {
  constructor(
    private readonly ds: AtlasDataSource,
    readonly id: string,
    private readonly options: { radius?: number; color?: string; strokeColor?: string; strokeWidth?: number }
  ) {}

  bind(map: MapLibreMap) {
    map.addLayer({
      id: this.id,
      type: 'circle',
      source: this.ds.id,
      paint: {
        'circle-radius': this.options.radius ?? 8,
        'circle-color': this.options.color ?? '#1d4ed8',
        'circle-stroke-color': this.options.strokeColor ?? '#fff',
        'circle-stroke-width': this.options.strokeWidth ?? 2,
      },
    });
  }
}

class AtlasHtmlMarker {
  private marker: Marker | null = null;
  position: Position;
  htmlContent: string;
  anchor: string;
  zIndex?: number;

  constructor(opts: { position: Position; htmlContent: string; anchor?: string; zIndex?: number }) {
    this.position = opts.position;
    this.htmlContent = opts.htmlContent;
    this.anchor = opts.anchor ?? 'center';
    this.zIndex = opts.zIndex;
  }

  attach(map: MapLibreMap) {
    const el = document.createElement('div');
    el.innerHTML = this.htmlContent;
    if (this.zIndex != null) el.style.zIndex = String(this.zIndex);
    this.marker = new Marker({ element: el, anchor: this.anchor as maplibregl.Anchor })
      .setLngLat(this.position)
      .addTo(map);
  }

  detach() {
    this.marker?.remove();
    this.marker = null;
  }
}

type CameraTransition = { duration?: number; type?: 'jump' | 'ease' };
type CameraOptions = {
  center?: Position;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  bounds?: LngLatBoundsLike;
  padding?: PaddingOptions | number;
  maxZoom?: number;
  minZoom?: number;
};

class AtlasMap {
  private map: MapLibreMap;
  private markerRegistry = new Set<AtlasHtmlMarker>();
  readonly sources = {
    add: (ds: AtlasDataSource) => ds.bind(this.map),
  };
  readonly layers = {
    add: (layers: AtlasLineLayer[] | AtlasLineLayer | AtlasBubbleLayer) => {
      const list = Array.isArray(layers) ? layers : [layers];
      for (const layer of list) {
        layer.bind(this.map);
      }
    },
  };
  readonly markers = {
    add: (marker: AtlasHtmlMarker) => {
      marker.attach(this.map);
      this.markerRegistry.add(marker);
    },
    remove: (marker: AtlasHtmlMarker) => {
      marker.detach();
      this.markerRegistry.delete(marker);
    },
  };
  readonly events = {
    add: (event: string, handler: (...args: unknown[]) => void) => {
      const mapEvent = event === 'ready' ? 'load' : event;
      if (mapEvent === 'load' && this.map.loaded()) {
        queueMicrotask(() => handler());
        return;
      }
      this.map.on(mapEvent as keyof maplibregl.MapEventType, handler as maplibregl.MapEventHandler);
    },
  };

  constructor(
    container: HTMLElement,
    options: {
      authOptions?: { authType?: string; subscriptionKey?: string };
      center?: Position;
      zoom?: number;
      minZoom?: number;
      style?: string;
      language?: string;
      showFeedbackLink?: boolean;
      bearing?: number;
      pitch?: number;
      dragRotateInteraction?: boolean;
      touchRotate?: boolean;
      scrollZoomInteraction?: boolean;
      touchZoomRotateInteraction?: boolean;
      dblClickZoomInteraction?: boolean;
    }
  ) {
    this.map = new MapLibreMap({
      container,
      style: MAP_STYLE,
      center: options.center ?? [-48.548, -27.595],
      zoom: options.zoom ?? 12,
      minZoom: options.minZoom ?? 4,
      maxPitch: 60,
      bearing: options.bearing ?? 0,
      pitch: options.pitch ?? 0,
      attributionControl: { compact: true },
    });

    if (options.dragRotateInteraction === false) this.map.dragRotate.disable();
    if (options.touchRotate === false) this.map.touchZoomRotate.disableRotation();
    if (options.scrollZoomInteraction === false) this.map.scrollZoom.disable();
    if (options.dblClickZoomInteraction === false) this.map.doubleClickZoom.disable();
    if (this.map.touchPitch?.enable) this.map.touchPitch.enable();
  }

  getCamera() {
    const c = this.map.getCenter();
    return {
      center: [c.lng, c.lat] as Position,
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  setCamera(options: CameraOptions, transition?: CameraTransition) {
    if (!this.map.isStyleLoaded()) {
      this.map.once('load', () => this.setCamera(options, transition));
      return;
    }

    const duration = transition?.type === 'jump' || transition?.duration === 0 ? 0 : transition?.duration ?? 0;

    if (options.minZoom != null) this.map.setMinZoom(options.minZoom);
    if (options.maxZoom != null) this.map.setMaxZoom(options.maxZoom);

    if (options.bounds) {
      const padding =
        typeof options.padding === 'number'
          ? options.padding
          : {
              top: options.padding?.top ?? 32,
              bottom: options.padding?.bottom ?? 32,
              left: options.padding?.left ?? 32,
              right: options.padding?.right ?? 32,
            };
      this.map.fitBounds(options.bounds, {
        padding,
        maxZoom: options.maxZoom,
        duration,
        bearing: options.bearing ?? 0,
        pitch: options.pitch ?? 0,
      });
      return;
    }

    const padding =
      options.padding != null
        ? typeof options.padding === 'number'
          ? { top: options.padding, bottom: options.padding, left: options.padding, right: options.padding }
          : options.padding
        : undefined;

    if (padding) this.map.setPadding(padding);

    const move: maplibregl.CameraOptions = {};
    if (options.center) move.center = options.center;
    if (options.zoom != null && Number.isFinite(options.zoom)) move.zoom = options.zoom;
    if (options.bearing != null && Number.isFinite(options.bearing)) move.bearing = options.bearing;
    if (options.pitch != null && Number.isFinite(options.pitch)) move.pitch = options.pitch;
    if (padding) move.padding = padding;

    if (duration > 0) this.map.easeTo({ ...move, duration });
    else this.map.jumpTo(move);
  }

  applyNavigationCamera(
    center: Position,
    zoom: number,
    bearing: number,
    pitch: number,
    padding: PaddingOptions,
    animate = false
  ) {
    if (!this.map.isStyleLoaded()) {
      this.map.once('load', () =>
        this.applyNavigationCamera(center, zoom, bearing, pitch, padding, animate)
      );
      return;
    }
    this.map.setPadding(padding);
    const cam: maplibregl.CameraOptions = { center, zoom, bearing, pitch, padding };
    if (animate) this.map.easeTo({ ...cam, duration: 420 });
    else this.map.jumpTo(cam);
  }

  setUserInteraction(opts: {
    dragRotateInteraction?: boolean;
    touchRotate?: boolean;
    scrollZoomInteraction?: boolean;
    touchZoomRotateInteraction?: boolean;
    dblClickZoomInteraction?: boolean;
  }) {
    if (opts.dragRotateInteraction === false) this.map.dragRotate.disable();
    else this.map.dragRotate.enable();
    if (opts.touchRotate === false) this.map.touchZoomRotate.disableRotation();
    if (opts.scrollZoomInteraction === false) this.map.scrollZoom.disable();
    else this.map.scrollZoom.enable();
    if (opts.dblClickZoomInteraction === false) this.map.doubleClickZoom.disable();
    else this.map.doubleClickZoom.enable();
  }

  resize() {
    this.map.resize();
  }

  dispose() {
    for (const marker of this.markerRegistry) marker.detach();
    this.markerRegistry.clear();
    this.map.remove();
  }
}

function buildAtlasNamespace(): AtlasNamespace {
  return {
    Map: AtlasMap,
    source: { DataSource: AtlasDataSource },
    data: {
      Feature: AtlasFeature,
      LineString: AtlasLineString,
      Point: AtlasPoint,
      BoundingBox: {
        fromPositions(positions: Position[]): LngLatBoundsLike {
          const lngs = positions.map((p) => p[0]);
          const lats = positions.map((p) => p[1]);
          return [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ];
        },
      },
      Position: [] as unknown as Position,
    },
    layer: {
      LineLayer: AtlasLineLayer,
      BubbleLayer: AtlasBubbleLayer,
    },
    HtmlMarker: AtlasHtmlMarker,
    AuthenticationType: { subscriptionKey: 'none' },
  };
}

/** Carrega o motor de mapas gratuito (MapLibre + OSM). Mantém nome legado para MapView. */
export function loadAzureMaps(): Promise<AtlasNamespace> {
  if (window.__driveNavAtlas) return Promise.resolve(window.__driveNavAtlas);
  if (loadPromise) return loadPromise;

  loadPromise = Promise.resolve(buildAtlasNamespace()).then((atlas) => {
    window.__driveNavAtlas = atlas;
    return atlas;
  });

  return loadPromise;
}
