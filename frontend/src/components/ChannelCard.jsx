import React, { useState } from 'react';
import { Heart, Play, Layers, Activity } from 'lucide-react';

export default function ChannelCard({
  channel,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) {
  const [imgError, setImgError] = useState(false);
  const logoSrc = imgError ? channel.fallback_logo : channel.logo;

  const prob = channel.probability ?? 82;
  const signalsCount =
    channel.signals_count ||
    channel.streams?.length ||
    1 + (channel.backup_streams?.length || 0);

  const probBadgeStyle =
    prob >= 80
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : prob >= 60
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-rose-500/15 text-rose-300 border-rose-500/30';

  const probDotStyle =
    prob >= 80 ? 'bg-emerald-400' : prob >= 60 ? 'bg-amber-400' : 'bg-rose-400';

  return (
    <div
      onClick={() => onSelect(channel)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(channel);
        }
      }}
      className={`group relative rounded-2xl p-3.5 cursor-pointer select-none transition-all duration-300 hover:scale-[1.03] hover:border-cyan-500/50 backdrop-blur-xl ${
        isActive
          ? 'ring-2 ring-cyan-400 bg-cyan-950/20 border border-cyan-400/50 shadow-lg shadow-cyan-950/30'
          : 'bg-[#13151F]/80 border border-white/10 hover:bg-[#181B28]/90 shadow-md'
      }`}
    >
      {/* Top Row: Live Status / Probability + Signals Count + Favorite Button */}
      <div className="flex items-center justify-between gap-1 mb-2.5">
        {isActive ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40">
            {/* Animated Audio Waves Icon */}
            <div className="flex items-end gap-0.5 h-3 w-3.5">
              <span className="w-1 bg-cyan-400 rounded-full animate-eq1" />
              <span className="w-1 bg-cyan-300 rounded-full animate-eq2" />
              <span className="w-1 bg-violet-400 rounded-full animate-eq3" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-300">
              Sonando
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-mono font-bold text-white/35">
              #{channel.number || '•'}
            </span>
            <span
              title={`Probabilidad de funcionamiento: ${prob}% (${channel.probability_label || 'Alta'})`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${probBadgeStyle}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${probDotStyle}`} />
              {prob}%
            </span>
            {signalsCount > 1 && (
              <span
                title={`${signalsCount} señales agrupadas disponibles para este canal`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/25 text-[10px] font-bold text-cyan-300"
              >
                <Layers className="w-2.5 h-2.5" />
                {signalsCount}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(channel.id);
          }}
          title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
            isFavorite
              ? 'bg-rose-500/20 text-rose-400'
              : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/15 opacity-80 group-hover:opacity-100'
          }`}
        >
          <Heart
            className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`}
          />
        </button>
      </div>

      {/* Logo Container with soft dark background */}
      <div className="relative h-24 w-full rounded-2xl bg-[#090A0F]/90 border border-white/5 flex items-center justify-center p-3 mb-3 overflow-hidden">
        <img
          src={logoSrc}
          alt={channel.name}
          loading="lazy"
          onError={() => setImgError(true)}
          className="max-h-full max-w-full object-contain rounded-xl transition-transform duration-300 group-hover:scale-105"
        />

        {/* Quality & Signal Preview Pill on Bottom-Right of Logo */}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[9px] font-bold text-white/75">
          <span>{channel.quality?.toUpperCase() || 'HD'}</span>
          {signalsCount > 1 && (
            <>
              <span className="text-white/30">•</span>
              <span className="text-cyan-300">{signalsCount} señales</span>
            </>
          )}
        </div>

        {/* Subtle Play Hover Badge */}
        {!isActive && (
          <div className="absolute inset-0 bg-gradient-to-t from-violet-950/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1.5 p-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
              <Play className="w-4 h-4 ml-0.5 fill-current" />
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/80 border border-white/15 text-[10px] font-semibold text-emerald-300">
              <Activity className="w-3 h-3" />
              Fiabilidad {prob}% ({channel.probability_label || 'Alta'})
            </span>
          </div>
        )}
      </div>

      {/* Channel Name (truncated to 1 line), Country & Category Badge */}
      <div className="space-y-1.5">
        <h3
          title={channel.name}
          className={`text-sm font-bold truncate transition-colors ${
            isActive ? 'text-cyan-300' : 'text-white group-hover:text-cyan-200'
          }`}
        >
          {channel.name}
        </h3>

        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-violet-500/15 text-violet-300 border border-violet-500/20 truncate">
            {channel.category}
          </span>

          <span
            title={`${channel.country} (${channel.region})`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-white/60 border border-white/5 truncate max-w-[110px]"
          >
            <span>{channel.flag || '🌐'}</span>
            <span className="truncate">{channel.country || 'Int.'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
