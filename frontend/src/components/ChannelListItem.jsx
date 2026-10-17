import React, { useState } from 'react';
import { Heart, Play, Radio, Globe2, Layers } from 'lucide-react';

export default function ChannelListItem({
  channel,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
  compact = false,
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

  if (compact) {
    // Compact row used inside the Live Side-by-Side Channel List next to the player
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
        className={`group flex items-center justify-between gap-3 p-2.5 rounded-2xl cursor-pointer select-none transition-all duration-200 ${
          isActive
            ? 'ring-2 ring-cyan-400 bg-cyan-950/30 border border-cyan-400/40 shadow-md'
            : 'bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-cyan-500/30'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Channel Number or Equalizer */}
          <div className="w-7 text-center shrink-0">
            {isActive ? (
              <div className="flex items-end justify-center gap-0.5 h-3.5 w-4 mx-auto">
                <span className="w-1 bg-cyan-400 rounded-full animate-eq1" />
                <span className="w-1 bg-cyan-300 rounded-full animate-eq2" />
                <span className="w-1 bg-violet-400 rounded-full animate-eq3" />
              </div>
            ) : (
              <span className="text-[11px] font-mono font-bold text-white/35 group-hover:text-cyan-400 transition-colors">
                #{channel.number || '•'}
              </span>
            )}
          </div>

          {/* Logo */}
          <div className="w-11 h-11 rounded-xl bg-[#090A0F] border border-white/10 p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={logoSrc}
              alt={channel.name}
              loading="lazy"
              onError={() => setImgError(true)}
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          </div>

          {/* Name & Meta */}
          <div className="min-w-0">
            <h4
              className={`text-xs sm:text-sm font-bold truncate ${
                isActive ? 'text-cyan-300' : 'text-white group-hover:text-cyan-200'
              }`}
            >
              {channel.name}
            </h4>
            <div className="flex items-center gap-1.5 text-[10px] text-white/50 truncate mt-0.5">
              <span
                title={`Probabilidad de funcionamiento: ${prob}%`}
                className="inline-flex items-center gap-1 font-bold text-emerald-300"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${probDotStyle}`} />
                {prob}%
              </span>
              {signalsCount > 1 && (
                <>
                  <span>•</span>
                  <span className="text-cyan-300 font-semibold">
                    {signalsCount} señales
                  </span>
                </>
              )}
              <span>•</span>
              <span className="truncate">{channel.category}</span>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(channel.id);
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isFavorite
                ? 'bg-rose-500/20 text-rose-400'
                : 'text-white/30 hover:text-white hover:bg-white/10'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`}
            />
          </button>
        </div>
      </div>
    );
  }

  // Full-width List Row for the Main Catalog List View
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
      className={`group flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-3.5 sm:px-5 rounded-2xl cursor-pointer select-none transition-all duration-200 backdrop-blur-xl ${
        isActive
          ? 'ring-2 ring-cyan-400 bg-cyan-950/25 border border-cyan-400/50 shadow-lg shadow-cyan-950/20'
          : 'bg-[#13151F]/80 hover:bg-[#181B28]/95 border border-white/10 hover:border-cyan-500/40'
      }`}
    >
      {/* Left: Channel Number + Logo + Name */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="w-10 text-center shrink-0">
          {isActive ? (
            <div className="flex items-end justify-center gap-0.5 h-4 w-5 mx-auto">
              <span className="w-1 bg-cyan-400 rounded-full animate-eq1" />
              <span className="w-1 bg-cyan-300 rounded-full animate-eq2" />
              <span className="w-1 bg-violet-400 rounded-full animate-eq3" />
            </div>
          ) : (
            <span className="text-xs font-mono font-bold text-white/40 group-hover:text-cyan-400">
              #{String(channel.number || 1).padStart(3, '0')}
            </span>
          )}
        </div>

        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#090A0F] border border-white/10 p-2 flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src={logoSrc}
            alt={channel.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-300 group-hover:scale-105"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h3
              className={`text-sm sm:text-base font-bold truncate ${
                isActive ? 'text-cyan-300' : 'text-white group-hover:text-cyan-200'
              }`}
            >
              {channel.name}
            </h3>
            {isActive && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                <Radio className="w-3 h-3 animate-pulse" />
                Reproduciendo
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/60">
            <span className="inline-flex items-center gap-1 text-white/80 font-medium">
              <span>{channel.flag || '🌐'}</span>
              <span>{channel.country || 'Internacional'}</span>
            </span>
            <span className="text-white/25">•</span>
            <span className="inline-flex items-center gap-1 text-white/50">
              <Globe2 className="w-3 h-3 text-violet-400" />
              <span>{channel.region || 'Internacional'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Probability Badge, Signals Count, Category Badge, Quality Badge, Favorite & Play Button */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 ml-auto shrink-0">
        <span
          title={`Probabilidad de que funcione: ${prob}% (${channel.probability_label || 'Alta'})`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${probBadgeStyle}`}
        >
          <span className={`w-2 h-2 rounded-full ${probDotStyle}`} />
          <span>{prob}%</span>
          <span className="hidden lg:inline text-[10px] opacity-80">
            ({channel.probability_label || 'Alta'})
          </span>
        </span>

        {signalsCount > 1 && (
          <span
            title={`${signalsCount} señales alternativas consolidadas en este canal`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-xs font-bold text-cyan-300"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{signalsCount} señales</span>
          </span>
        )}

        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/25">
          {channel.category}
        </span>

        <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/75">
          {channel.quality?.toUpperCase() || 'HD'}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(channel.id);
          }}
          title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
            isFavorite
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/15'
          }`}
        >
          <Heart
            className={`w-4 h-4 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`}
          />
        </button>

        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            isActive
              ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
              : 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white opacity-85 group-hover:opacity-100 group-hover:scale-105'
          }`}
        >
          <Play className="w-4 h-4 ml-0.5 fill-current" />
        </div>
      </div>
    </div>
  );
}

