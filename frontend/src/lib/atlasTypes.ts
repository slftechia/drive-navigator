import type { AtlasNamespace } from './mapEngine';

export type MapInstance = InstanceType<AtlasNamespace['Map']>;
export type DataSourceInstance = InstanceType<AtlasNamespace['source']['DataSource']>;
export type HtmlMarkerInstance = InstanceType<AtlasNamespace['HtmlMarker']>;
export type MapPosition = [number, number];
