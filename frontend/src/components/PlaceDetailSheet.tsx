import { haversineKm, formatDistanceKm } from '../utils/geo';
import type { SelectedDestination } from './DestinationInput';

export interface PlaceDetail extends SelectedDestination {
  address?: string;
  resultKind?: 'admin' | 'street' | 'poi' | 'other';
}

interface PlaceDetailSheetProps {
  place: PlaceDetail;
  userLat: number;
  userLon: number;
  onBack: () => void;
  onRoutes: () => void;
  onSaveFavorite?: () => void;
  favoriteSaved?: boolean;
  onShare?: () => void;
  shareHint?: string | null;
}

function kindLabel(kind?: PlaceDetail['resultKind']): string {
  if (kind === 'poi') return 'Local';
  if (kind === 'street') return 'Endereço';
  if (kind === 'admin') return 'Cidade / região';
  return 'Destino';
}

function kindEmoji(kind?: PlaceDetail['resultKind']): string {
  if (kind === 'poi') return '📍';
  if (kind === 'street') return '🛣️';
  if (kind === 'admin') return '🏙️';
  return '📌';
}

/** Ficha do lugar antes de calcular a rota (estilo Waze). */
export default function PlaceDetailSheet({
  place,
  userLat,
  userLon,
  onBack,
  onRoutes,
  onSaveFavorite,
  favoriteSaved = false,
  onShare,
  shareHint = null,
}: PlaceDetailSheetProps) {
  const title = place.placeName || place.locationTag || place.label;
  const subtitle =
    place.address ||
    place.locationTag ||
    [place.city, place.stateCode].filter(Boolean).join(' · ') ||
    place.label;
  const hasCoords = place.lat != null && place.lon != null;
  const dist =
    hasCoords && Number.isFinite(place.lat) && Number.isFinite(place.lon)
      ? formatDistanceKm(haversineKm(userLat, userLon, place.lat!, place.lon!))
      : null;

  return (
    <div className="place-detail-sheet">
      <div className="place-detail-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Voltar">
          ←
        </button>
        <span className="place-detail-kind">{kindLabel(place.resultKind)}</span>
        {onShare && hasCoords && (
          <button type="button" className="place-detail-share" onClick={onShare}>
            Compartilhar
          </button>
        )}
      </div>

      <div className="place-detail-hero">
        <span className="place-detail-emoji" aria-hidden>
          {kindEmoji(place.resultKind)}
        </span>
        <div className="place-detail-copy">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {dist && <em>{dist} de você</em>}
          {shareHint && <em className="place-share-hint">{shareHint}</em>}
        </div>
      </div>

      <div className="place-detail-actions">
        {onSaveFavorite && (
          <button
            type="button"
            className="place-detail-btn-fav"
            onClick={onSaveFavorite}
            disabled={favoriteSaved}
          >
            {favoriteSaved ? 'Salvo ✓' : '★ Favorito'}
          </button>
        )}
        <button type="button" className="place-detail-btn-go" onClick={onRoutes} disabled={!hasCoords}>
          Rotas
        </button>
      </div>
    </div>
  );
}
