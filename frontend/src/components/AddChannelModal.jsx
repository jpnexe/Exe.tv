import React, { useState } from 'react';
import { X, PlusCircle, Link2, Tv, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { buildApiUrl } from '../config.js';

const CATEGORIES = [
  'Deportes',
  'Noticias',
  'Películas',
  'Series',
  'Música',
  'Infantil',
  'Entretenimiento',
  'Documentales',
  'Cultura',
  'Estilo de Vida',
  'Religión',
  'Variedades',
];

const COUNTRIES = [
  { code: 'AR', name: 'Argentina 🇦🇷' },
  { code: 'MX', name: 'México 🇲🇽' },
  { code: 'ES', name: 'España 🇪🇸' },
  { code: 'CO', name: 'Colombia 🇨🇴' },
  { code: 'CL', name: 'Chile 🇨🇱' },
  { code: 'PE', name: 'Perú 🇵🇪' },
  { code: 'VE', name: 'Venezuela 🇻🇪' },
  { code: 'EC', name: 'Ecuador 🇪🇨' },
  { code: 'DO', name: 'Rep. Dominicana 🇩🇴' },
  { code: 'UY', name: 'Uruguay 🇺🇾' },
  { code: 'PY', name: 'Paraguay 🇵🇾' },
  { code: 'BO', name: 'Bolivia 🇧🇴' },
  { code: 'CR', name: 'Costa Rica 🇨🇷' },
  { code: 'PA', name: 'Panamá 🇵🇦' },
  { code: 'PR', name: 'Puerto Rico 🇵🇷' },
  { code: 'US', name: 'Estados Unidos 🇺🇸' },
  { code: 'INT', name: 'Internacional 🌐' },
];

const PRESET_PLAYLISTS = [
  {
    title: 'Deportes Mundiales (iptv-org)',
    url: 'https://iptv-org.github.io/iptv/categories/sports.m3u',
    category: 'Deportes',
  },
  {
    title: 'Cine y Películas Mundiales',
    url: 'https://iptv-org.github.io/iptv/categories/movies.m3u',
    category: 'Películas',
  },
  {
    title: 'Música y Conciertos 24/7',
    url: 'https://iptv-org.github.io/iptv/categories/music.m3u',
    category: 'Música',
  },
  {
    title: 'Animación e Infantil Global',
    url: 'https://iptv-org.github.io/iptv/categories/animation.m3u',
    category: 'Infantil',
  },
];

export default function AddChannelModal({ isOpen, onClose, onSuccess }) {
  const [tab, setTab] = useState('single'); // 'single' | 'playlist'
  const [name, setName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [category, setCategory] = useState('Deportes');
  const [countryCode, setCountryCode] = useState('AR');
  const [logo, setLogo] = useState('');

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  if (!isOpen) return null;

  const handleAddSingle = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(buildApiUrl('/api/custom/channel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          stream_url: streamUrl,
          category,
          country_code: countryCode,
          logo: logo || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al agregar canal');

      setFeedback({
        type: 'success',
        message: `¡Canal "${data.channel.name}" agregado! Ahora tienes ${data.total} canales.`,
      });
      setName('');
      setStreamUrl('');
      setLogo('');
      if (onSuccess) onSuccess(data.channel);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportPlaylist = async (e, customUrl = null, forcedCat = null) => {
    if (e) e.preventDefault();
    const targetUrl = customUrl || playlistUrl;
    if (!targetUrl.trim()) return;

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(buildApiUrl('/api/custom/playlist'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_url: targetUrl,
          default_category: forcedCat,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al importar lista M3U');

      setFeedback({
        type: 'success',
        message: `¡Se importaron ${data.added} canales nuevos! Total disponible: ${data.total} canales.`,
      });
      setPlaylistUrl('');
      if (onSuccess) onSuccess(null);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg bg-[#13151F] border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center text-white">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">
                Agregar Canales a Exe.tv
              </h3>
              <p className="text-xs text-white/50">
                Añade un canal directo (.m3u8) o importa una lista completa (.m3u)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#090A0F] border border-white/10">
          <button
            type="button"
            onClick={() => {
              setTab('single');
              setFeedback(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              tab === 'single'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Canal Individual (.m3u8)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('playlist');
              setFeedback(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              tab === 'playlist'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>Importar Lista (.m3u)</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold ${
              feedback.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {tab === 'single' ? (
          <form onSubmit={handleAddSingle} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">
                Nombre del Canal *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Deportes HD En Vivo"
                className="w-full px-4 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-cyan-400 text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">
                URL del Stream (.m3u8) *
              </label>
              <input
                type="url"
                required
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder="https://servidor.com/live/playlist.m3u8"
                className="w-full px-4 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-cyan-400 text-sm text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">
                  Categoría
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 text-sm text-white focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">
                  País
                </label>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 text-sm text-white focus:outline-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">
                URL del Logo (Opcional)
              </label>
              <input
                type="url"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full px-4 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-cyan-400 text-sm text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Agregando canal...' : 'Guardar y Sintonizar Canal'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <form onSubmit={(e) => handleImportPlaylist(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">
                  URL de Lista Remota (.m3u / .m3u8)
                </label>
                <input
                  type="url"
                  required
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://iptv-org.github.io/iptv/categories/sports.m3u"
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-cyan-400 text-sm text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Descargando y procesando...' : 'Importar Lista M3U'}
              </button>
            </form>

            {/* 1-Click Official Expansion Packs */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <p className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Paquetes Oficiales con 1 Clic:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_PLAYLISTS.map((pack) => (
                  <button
                    key={pack.url}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleImportPlaylist(null, pack.url, pack.category)}
                    className="text-left p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-xs"
                  >
                    <div className="font-bold text-white truncate">{pack.title}</div>
                    <div className="text-[10px] text-cyan-400 mt-0.5">
                      + Importar a {pack.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

