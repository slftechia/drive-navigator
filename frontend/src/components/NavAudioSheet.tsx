import { useEffect, useState } from 'react';
import type { AlertSoundSettings } from '../lib/alertSounds';
import { testVoicePersona } from '../lib/alertSounds';
import { ALL_ALERT_TYPES, ALERT_TYPE_META, type RoadAlertType } from '../lib/alertTypes';
import { VOICE_PERSONAS } from '../lib/voicePersonas';
import { openMusicApp, type MusicAppId } from '../lib/musicApps';

interface NavAudioSheetProps {
  settings: AlertSoundSettings;
  onChange: (s: AlertSoundSettings) => void;
  onSave: () => void;
  onClose: () => void;
}

const MUSIC: Array<{ id: MusicAppId; label: string }> = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'youtube', label: 'YouTube Music' },
  { id: 'deezer', label: 'Deezer' },
];

/** Painel rápido de áudio na navegação (estilo Waze). */
export default function NavAudioSheet({ settings, onChange, onSave, onClose }: NavAudioSheetProps) {
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    // Pré-carrega vozes do sistema (Android/iOS/desktop).
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const setType = (type: RoadAlertType, on: boolean) => {
    onChange({
      ...settings,
      types: { ...settings.types, [type]: on },
    });
  };

  return (
    <div className="consult-overlay" onClick={onClose}>
      <div className="nav-audio-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Áudio e voz">
        <div className="consult-handle" />
        <div className="consult-header">
          <h2>Áudio e voz</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="nav-audio-body">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(e) => onChange({ ...settings, muted: !e.target.checked })}
            />
            <span>Som ligado</span>
          </label>

          <h3 className="nav-audio-section">Vozes</h3>
          <div className="voice-persona-list">
            {VOICE_PERSONAS.map((p) => {
              const active = settings.personaId === p.id;
              return (
                <div key={p.id} className={`voice-persona-row${active ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="voice-persona-pick"
                    disabled={settings.muted}
                    onClick={() => onChange({ ...settings, personaId: p.id })}
                  >
                    <strong>{p.name}</strong>
                    <em>{p.gender === 'female' ? 'Feminina' : 'Masculina'}</em>
                  </button>
                  <button
                    type="button"
                    className="ghost voice-persona-test"
                    disabled={settings.muted}
                    onClick={() => {
                      onChange({ ...settings, personaId: p.id, muted: false });
                      setTestingId(p.id);
                      testVoicePersona(p.id);
                      window.setTimeout(() => setTestingId(null), 2500);
                    }}
                  >
                    {testingId === p.id ? '…' : 'Testar'}
                  </button>
                </div>
              );
            })}
          </div>

          <label className="nav-audio-rate">
            Velocidade da voz
            <input
              type="range"
              min={0.85}
              max={1.25}
              step={0.05}
              value={settings.voiceRate}
              disabled={settings.muted}
              onChange={(e) => onChange({ ...settings, voiceRate: Number(e.target.value) })}
            />
          </label>

          <h3 className="nav-audio-section">Falar</h3>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.navGuidance}
              disabled={settings.muted}
              onChange={(e) => onChange({ ...settings, navGuidance: e.target.checked })}
            />
            <span>Manobras (navegação)</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.voice}
              disabled={settings.muted || !settings.master}
              onChange={(e) => onChange({ ...settings, voice: e.target.checked })}
            />
            <span>Alertas por voz</span>
          </label>

          <h3 className="nav-audio-section">Alertas (comunidade)</h3>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.master}
              disabled={settings.muted}
              onChange={(e) => onChange({ ...settings, master: e.target.checked })}
            />
            <span>Todos os alertas sonoros</span>
          </label>
          {ALL_ALERT_TYPES.map((t) => (
            <label key={t} className="toggle-row">
              <input
                type="checkbox"
                checked={settings.types?.[t] ?? true}
                disabled={settings.muted || !settings.master}
                onChange={(e) => setType(t, e.target.checked)}
              />
              <span>
                {ALERT_TYPE_META[t].icon} {ALERT_TYPE_META[t].label}
              </span>
            </label>
          ))}

          <h3 className="nav-audio-section">Música</h3>
          <div className="nav-audio-music-row">
            {MUSIC.map((m) => (
              <button
                key={m.id}
                type="button"
                className="ghost nav-audio-music-btn"
                onClick={() => openMusicApp(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="primary"
            style={{ width: '100%', marginTop: '0.85rem' }}
            onClick={() => {
              onSave();
              onClose();
            }}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
