import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  SkipBack,
  Heart,
  AlertTriangle,
  RefreshCw,
  Radio,
  PictureInPicture2,
  Tv,
  ShieldCheck,
  Globe,
  ExternalLink,
  Layers,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { buildApiUrl } from '../config.js';

function buildProxiedStreamUrl(rawUrl, headers = {}) {
  if (!rawUrl) return '';
  const params = new URLSearchParams();
  params.set('url', rawUrl);
  if (headers?.Referer) params.set('referer', headers.Referer);
  if (headers?.['User-Agent']) params.set('ua', headers['User-Agent']);
  return buildApiUrl(`/api/proxy?${params.toString()}`);
}

export default function VideoPlayer({
  channel,
  onNextChannel,
  onPrevChannel,
  isFavorite,
  onToggleFavorite,
}) {
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const hlsRef = useRef(null);
  const touchTimerRef = useRef(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [autoplayMutedPrompt, setAutoplayMutedPrompt] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [levels, setLevels] = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [logoError, setLogoError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Mobile/Tablet touch overlay controls visibility
  const [showTouchControls, setShowTouchControls] = useState(true);
  const [showSignalsPanel, setShowSignalsPanel] = useState(true);

  // Live Edge ("En Directo") synchronization states
  const [isLiveSynced, setIsLiveSynced] = useState(true);
  const [behindSeconds, setBehindSeconds] = useState(0);
  const [liveSyncToast, setLiveSyncToast] = useState(false);

  // Hybrid playback states: Proxy toggle, Backup mirror index, and Web Embed mode
  const [useProxyMode, setUseProxyMode] = useState(false);
  const [streamIndex, setStreamIndex] = useState(0);
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const autoFallbackTriedRef = useRef(false);

  // Real-time Signal Health & Probability Probe states
  const [probeMap, setProbeMap] = useState({});
  const [isProbing, setIsProbing] = useState(false);

  // Structured list of all grouped signals for this channel
  const groupedSignals = useMemo(() => {
    if (!channel) return [];
    if (Array.isArray(channel.streams) && channel.streams.length > 0) {
      return channel.streams;
    }
    const rawList = [channel.stream_url, ...(channel.backup_streams || [])].filter(Boolean);
    const uniqueUrls = Array.from(new Set(rawList));
    return uniqueUrls.map((url, idx) => ({
      id: `${channel.id}_sig_${idx + 1}`,
      label: idx === 0 ? 'Señal 1 (Principal)' : `Señal ${idx + 1}`,
      url,
      quality: channel.quality || 'HD',
      use_proxy: Boolean(channel.use_proxy || url.startsWith('http://')),
      headers: channel.headers || {},
      probability: channel.probability ?? 82,
      protocol: url.startsWith('https://') ? 'HTTPS' : 'HTTP',
    }));
  }, [channel]);

  const candidateStreams = useMemo(
    () => groupedSignals.map((s) => s.url),
    [groupedSignals]
  );

  // Probe all grouped signals in the background to show real-time status & probability
  const runSignalProbe = useCallback(async (signalsToProbe) => {
    if (!signalsToProbe || signalsToProbe.length === 0) return;
    setIsProbing(true);
    try {
      const resp = await fetch(buildApiUrl('/api/probe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streams: signalsToProbe.map((s) => ({
            url: s.url,
            label: s.label,
            headers: s.headers || {},
          })),
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const map = {};
      (data.results || []).forEach((r) => {
        map[r.url] = r;
      });
      setProbeMap(map);
    } catch {
      // Ignore network error during background probe
    } finally {
      setIsProbing(false);
    }
  }, []);

  // Reset hybrid state, live edge state, and trigger real-time signal probe when switching channels
  useEffect(() => {
    setLogoError(false);
    setStreamIndex(0);
    setIsEmbedMode(false);
    setIsLiveSynced(true);
    setBehindSeconds(0);
    setProbeMap({});
    autoFallbackTriedRef.current = false;
    const firstSignal = groupedSignals[0];
    const rawPrimary = firstSignal?.url || channel?.stream_url || '';
    // Prefer direct browser playback first for https:// streams so the viewer's own IP (e.g. Colombia) is used first;
    // only force proxy immediately for http:// streams to avoid Mixed-Content blocks.
    const shouldStartWithProxy = rawPrimary.startsWith('http://');
    setUseProxyMode(shouldStartWithProxy);
    if (groupedSignals.length > 0) {
      runSignalProbe(groupedSignals);
    }
  }, [channel?.id]);

  const activeSignalObj = groupedSignals[streamIndex] || groupedSignals[0] || null;
  const activeRawUrl = activeSignalObj?.url || channel?.stream_url || '';

  const effectiveStreamUrl = useMemo(() => {
    if (!activeRawUrl) return '';
    const sigHeaders = activeSignalObj?.headers || channel?.headers || {};
    if (useProxyMode || activeRawUrl.startsWith('http://')) {
      return buildProxiedStreamUrl(activeRawUrl, sigHeaders);
    }
    return activeRawUrl;
  }, [activeRawUrl, activeSignalObj, useProxyMode, channel?.headers]);

  // Seeks the video and HLS buffer directly to the real-time live edge ("En Directo")
  const jumpToLiveEdge = useCallback((showFeedback = false) => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video) return;

    try {
      let jumped = false;

      if (hls) {
        const syncPos = hls.liveSyncPosition;
        if (typeof syncPos === 'number' && Number.isFinite(syncPos) && syncPos > 0) {
          video.currentTime = syncPos;
          jumped = true;
        }
      }

      if (!jumped && video.seekable && video.seekable.length > 0) {
        const end = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(end) && end > 0) {
          video.currentTime = Math.max(0, end - 0.4);
          jumped = true;
        }
      }

      // If user clicked "En Directo" manually and stream buffer is stale, reload live edge from server
      if (showFeedback && hls) {
        hls.startLoad(-1);
        if (!jumped && video.seekable && video.seekable.length > 0) {
          const end = video.seekable.end(video.seekable.length - 1);
          if (Number.isFinite(end) && end > 0) {
            video.currentTime = Math.max(0, end - 0.3);
          }
        }
      }

      if (video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } catch {
      // Ignore seek errors on unbuffered streams
    }

    setIsLiveSynced(true);
    setBehindSeconds(0);

    if (showFeedback) {
      setLiveSyncToast(true);
      setTimeout(() => setLiveSyncToast(false), 2200);
    }
  }, []);

  const attemptPlay = useCallback(
    async (videoEl) => {
      if (!videoEl) return;
      try {
        videoEl.muted = isMuted;
        await videoEl.play();
        setIsPlaying(true);
        setAutoplayMutedPrompt(false);
        jumpToLiveEdge(false);
      } catch {
        try {
          videoEl.muted = true;
          setIsMuted(true);
          setAutoplayMutedPrompt(true);
          await videoEl.play();
          setIsPlaying(true);
          jumpToLiveEdge(false);
        } catch {
          setIsPlaying(false);
        }
      }
    },
    [isMuted, jumpToLiveEdge]
  );

  // Monitor how close playback is to the live edge
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    if (!video || video.paused) return;

    let liveEdge = null;
    if (hls && typeof hls.liveSyncPosition === 'number' && Number.isFinite(hls.liveSyncPosition)) {
      liveEdge = hls.liveSyncPosition;
    } else if (video.seekable && video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      if (Number.isFinite(end)) liveEdge = end;
    }

    if (liveEdge !== null && liveEdge > 0) {
      const lag = Math.max(0, Math.round(liveEdge - video.currentTime));
      setBehindSeconds(lag);
      setIsLiveSynced(lag <= 6);
    } else {
      setIsLiveSynced(true);
      setBehindSeconds(0);
    }
  }, []);

  const handleAutomaticStreamRecovery = useCallback(() => {
    if (!useProxyMode && !autoFallbackTriedRef.current) {
      autoFallbackTriedRef.current = true;
      setUseProxyMode(true);
      return true;
    }
    if (streamIndex + 1 < candidateStreams.length) {
      autoFallbackTriedRef.current = false;
      setUseProxyMode(true);
      setStreamIndex((idx) => idx + 1);
      return true;
    }
    return false;
  }, [useProxyMode, streamIndex, candidateStreams.length]);

  const initStream = useCallback(() => {
    if (isEmbedMode) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsLoading(false);
      setHasError(false);
      return;
    }

    const video = videoRef.current;
    if (!video || !effectiveStreamUrl) return;

    setIsLoading(true);
    setHasError(false);
    setErrorDetail('');
    setLevels([]);
    setCurrentLevel(-1);
    setIsLiveSynced(true);
    setBehindSeconds(0);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startPosition: -1, // Always start at the live edge on channel change
        liveSyncDurationCount: 2, // Keep latency minimal (2 segments from live edge)
        liveMaxLatencyDurationCount: 4, // Automatically catch up if latency exceeds 4 segments
        maxLiveSyncPlaybackRate: 1.15, // Smoothly speed up if slightly behind
        backBufferLength: 30,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 15000,
      });

      hlsRef.current = hls;
      hls.loadSource(effectiveStreamUrl);
      hls.attachMedia(video);

      let initialLiveSeekDone = false;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setIsLoading(false);
        setHasError(false);
        if (data?.levels && data.levels.length > 1) {
          setLevels(data.levels);
        }
        attemptPlay(video);
      });

      hls.on(Hls.Events.LEVEL_LOADED, () => {
        // Ensure first playback after channel switch snaps to the live edge
        if (!initialLiveSeekDone) {
          initialLiveSeekDone = true;
          jumpToLiveEdge(false);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.destroy();
              if (!handleAutomaticStreamRecovery()) {
                setErrorDetail(
                  'Restricción de origen o señal temporalmente fuera del aire. Prueba activar el Modo Proxy o cambiar a la Señal Oficial Web.'
                );
                setIsLoading(false);
                setHasError(true);
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              if (!handleAutomaticStreamRecovery()) {
                setErrorDetail('Formato de transmisión no compatible o fuera del aire.');
                setIsLoading(false);
                setHasError(true);
              }
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = effectiveStreamUrl;
      const onLoadedMetadata = () => {
        setIsLoading(false);
        setHasError(false);
        attemptPlay(video);
      };
      const onNativeError = () => {
        if (!handleAutomaticStreamRecovery()) {
          setIsLoading(false);
          setHasError(true);
          setErrorDetail('No se pudo cargar la transmisión en vivo.');
        }
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      video.addEventListener('error', onNativeError, { once: true });
    } else {
      setIsLoading(false);
      setHasError(true);
      setErrorDetail('Tu navegador no soporta reproducción de streams HLS (.m3u8).');
    }
  }, [effectiveStreamUrl, isEmbedMode, attemptPlay, jumpToLiveEdge, handleAutomaticStreamRecovery]);

  useEffect(() => {
    initStream();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel?.id, effectiveStreamUrl, isEmbedMode, retryCount]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, []);

  const scheduleControlsHide = useCallback(() => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      setShowTouchControls(false);
    }, 3500);
  }, []);

  useEffect(() => {
    setShowTouchControls(true);
    scheduleControlsHide();
  }, [channel?.id, scheduleControlsHide]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || hasError || isEmbedMode) return;
    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        jumpToLiveEdge(false);
        scheduleControlsHide();
      }).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
      setIsLiveSynced(false);
      setShowTouchControls(true);
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    }
  };

  // On touch screens, tapping the video toggles the overlay controls; on desktop mouse click toggles play/pause
  const handleVideoSurfaceClick = (e) => {
    const isTouchDevice =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
      e.stopPropagation();
      setShowTouchControls((prev) => {
        const next = !prev;
        if (next) scheduleControlsHide();
        return next;
      });
    } else {
      togglePlay();
    }
  };

  const handleUnmutePrompt = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = volume || 0.85;
    setIsMuted(false);
    setAutoplayMutedPrompt(false);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted) {
      setAutoplayMutedPrompt(false);
      if (volume === 0) {
        setVolume(0.75);
        video.volume = 0.75;
      }
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    const video = videoRef.current;
    if (video) {
      video.volume = val;
      video.muted = val === 0;
    }
    setIsMuted(val === 0);
    if (val > 0) setAutoplayMutedPrompt(false);
  };

  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    const video = videoRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (video && video.webkitEnterFullscreen) {
        // Fallback nativo para Safari en iPhone (iOS)
        video.webkitEnterFullscreen();
      }
    } catch {
      if (video && video.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
        } catch {
          // Ignore
        }
      }
    }
  };

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video || isEmbedMode) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch {
      // Ignore if PiP is not supported
    }
  };

  const handleQualityChange = (levelIndex) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
  };

  const handleCycleSignal = () => {
    setIsEmbedMode(false);
    if (candidateStreams.length > 1) {
      const nextIdx = (streamIndex + 1) % candidateStreams.length;
      setStreamIndex(nextIdx);
      setUseProxyMode(true);
    } else {
      setUseProxyMode((p) => !p);
    }
    setRetryCount((c) => c + 1);
  };

  if (!channel) return null;

  const displayLogo = logoError ? channel.fallback_logo : channel.logo;

  return (
    <div className="space-y-4">
      {/* Main Video Frame (rounded-3xl) */}
      <div
        ref={playerContainerRef}
        className="relative w-full aspect-video rounded-3xl overflow-hidden bg-[#06070B] shadow-2xl shadow-violet-950/20 border border-white/10 group select-none"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/15 via-transparent to-cyan-500/15 pointer-events-none" />

        {isEmbedMode && channel.embed_url ? (
          /* Official Web Signal Mode inside the same rounded-3xl frame */
          <div className="relative w-full h-full bg-black flex flex-col">
            <iframe
              src={channel.embed_url}
              title={`Señal Oficial Web - ${channel.name}`}
              className="w-full flex-1 border-0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="bg-[#13151F]/95 border-t border-white/10 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-white/70 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                Reproduciendo señal oficial de <strong>{channel.name}</strong>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={channel.embed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-cyan-300 font-semibold transition-colors"
                >
                  <span>Abrir reproductor oficial externo</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setIsEmbedMode(false)}
                  className="px-3 py-1 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-bold transition-colors"
                >
                  Volver a Stream HLS
                </button>
              </div>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            onClick={handleVideoSurfaceClick}
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false);
              setIsLiveSynced(false);
            }}
            onTimeUpdate={handleTimeUpdate}
            playsInline
            className="w-full h-full object-contain bg-black cursor-pointer"
          />
        )}

        {/* Top Floating Status Bar inside video */}
        {!isEmbedMode && (
          <div
            className={`absolute top-2.5 sm:top-4 left-2.5 sm:left-4 right-2.5 sm:right-4 flex items-center justify-between gap-2 z-20 transition-opacity duration-300 pointer-events-none ${
              showTouchControls ? 'opacity-100' : 'opacity-0'
            } sm:opacity-0 sm:group-hover:opacity-100`}
          >
            <button
              type="button"
              onClick={() => jumpToLiveEdge(true)}
              title="Haz clic para sincronizar la señal en directo"
              className="pointer-events-auto flex items-center gap-2 bg-[#090A0F]/85 hover:bg-[#13151F] backdrop-blur-xl border border-white/15 px-3 py-1.5 rounded-full transition-transform hover:scale-105 min-w-0"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isLiveSynced ? 'bg-red-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isLiveSynced ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                />
              </span>
              <span className="text-[11px] sm:text-xs font-bold tracking-wider uppercase text-white whitespace-nowrap">
                {isLiveSynced
                  ? 'EN DIRECTO'
                  : `ATRASADO (-${behindSeconds}s)`}
              </span>
              <span className="hidden xs:inline text-white/30">•</span>
              <span className="hidden xs:inline text-xs font-medium text-cyan-400 truncate max-w-[140px] sm:max-w-xs">
                {channel.flag} {channel.name}
              </span>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {useProxyMode && (
                <span className="bg-emerald-500/20 backdrop-blur-xl border border-emerald-400/30 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span className="hidden sm:inline">Proxy Activo</span>
                </span>
              )}
              {candidateStreams.length > 1 && (
                <span className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-400/30 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold text-cyan-300">
                  Señal {streamIndex + 1}/{candidateStreams.length}
                </span>
              )}
              <span className="bg-[#090A0F]/85 backdrop-blur-xl border border-white/10 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold text-violet-300">
                {channel.quality?.toUpperCase() || 'HD'}
              </span>
            </div>
          </div>
        )}

        {/* Toast confirmation when user clicks "En Directo" */}
        {liveSyncToast && !hasError && !isEmbedMode && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/90 text-black font-extrabold text-xs shadow-xl backdrop-blur-md">
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>¡Señal sincronizada en directo!</span>
          </div>
        )}

        {/* Unmute Floating CTA */}
        {autoplayMutedPrompt && !hasError && !isLoading && !isEmbedMode && (
          <button
            type="button"
            onClick={handleUnmutePrompt}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 text-white font-semibold text-sm shadow-xl shadow-violet-950/50 hover:scale-105 active:scale-95 transition-all duration-300 border border-white/20 animate-bounce"
          >
            <Volume2 className="w-4 h-4" />
            <span>Activar Sonido</span>
          </button>
        )}

        {/* Smooth Loading Spinner Overlay until MANIFEST_PARSED */}
        {isLoading && !hasError && !isEmbedMode && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090A0F]/75 backdrop-blur-md">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-violet-500/20 border-t-cyan-400 animate-spin" />
              <Tv className="w-6 h-6 text-violet-400 absolute animate-pulse" />
            </div>
            <p className="mt-4 text-sm font-medium text-white/90">
              Sintonizando en directo <span className="text-cyan-400 font-semibold">{channel.name}</span>...
            </p>
            <p className="text-xs text-white/50 mt-1">
              {useProxyMode
                ? 'Conectando mediante Proxy de Cabeceras (Anti-CORS)...'
                : 'Sincronizando último segmento HLS en tiempo real'}
            </p>
          </div>
        )}

        {/* Friendly Error Screen */}
        {hasError && !isEmbedMode && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-[#090A0F]/95 backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/20 to-violet-600/20 border border-rose-500/30 flex items-center justify-center mb-4 shadow-lg">
              <AlertTriangle className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1.5">
              Señal no disponible en este momento
            </h3>
            <p className="text-xs sm:text-sm text-white/60 max-w-md mb-6">
              {errorDetail || 'La transmisión de este canal presenta intermitencias o restricciones de origen.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {channel.embed_url && (
                <button
                  type="button"
                  onClick={() => setIsEmbedMode(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs sm:text-sm shadow-lg transition-all hover:scale-105"
                >
                  <Globe className="w-4 h-4" />
                  <span>Cambiar a Señal Oficial Web</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCycleSignal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-bold text-xs sm:text-sm transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Probar Modo Proxy / Señal Alterna</span>
              </button>

              <button
                type="button"
                onClick={onNextChannel}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-cyan-500/20 hover:scale-105 transition-all"
              >
                <SkipForward className="w-4 h-4" />
                <span>Saltar al siguiente canal</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Custom Rounded Controls Overlay */}
        {!isEmbedMode && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 p-2.5 sm:p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${
              showTouchControls
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'
            } sm:opacity-0 sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto`}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3 bg-[#13151F]/85 backdrop-blur-xl border border-white/10 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl">
              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  title={isPlaying ? 'Pausar' : 'Reproducir'}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-md hover:scale-105 active:scale-95 transition-transform shrink-0"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={onPrevChannel}
                  title="Canal anterior"
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onNextChannel}
                  title="Siguiente canal"
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
                >
                  <SkipForward className="w-4 h-4" />
                </button>

                {/* Dedicated "EN DIRECTO" Live Edge Sync Button inside player bar */}
                <button
                  type="button"
                  onClick={() => jumpToLiveEdge(true)}
                  title="Actualizar señal a En Directo (tiempo real)"
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-extrabold transition-all hover:scale-105 active:scale-95 whitespace-nowrap ${
                    isLiveSynced
                      ? 'bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300'
                      : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30 animate-pulse'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isLiveSynced ? 'bg-rose-500 animate-ping' : 'bg-black'
                    }`}
                  />
                  <span>
                    {isLiveSynced
                      ? 'EN DIRECTO'
                      : `DIRECTO (-${behindSeconds}s)`}
                  </span>
                </button>

                <div className="flex items-center gap-2 pl-0.5 sm:pl-1">
                  <button
                    type="button"
                    onClick={toggleMute}
                    title={isMuted ? 'Activar sonido' : 'Silenciar'}
                    className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-cyan-400" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="hidden md:block w-20 accent-cyan-400 cursor-pointer h-1.5 bg-white/20 rounded-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                {levels.length > 1 && (
                  <select
                    value={currentLevel}
                    onChange={(e) => handleQualityChange(Number(e.target.value))}
                    className="bg-white/10 border border-white/10 text-[11px] sm:text-xs font-medium text-white rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    <option value={-1} className="bg-[#13151F]">
                      Auto ({channel.quality || 'HD'})
                    </option>
                    {levels.map((lvl, idx) => (
                      <option key={idx} value={idx} className="bg-[#13151F]">
                        {lvl.height ? `${lvl.height}p` : `Nivel ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={togglePiP}
                  title="Picture in Picture"
                  className="hidden sm:flex w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 items-center justify-center text-white/80 hover:text-white transition-colors"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/80 hover:text-white transition-colors shrink-0"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Channel Info Bar + Hybrid Controls */}
      <div className="bg-[#13151F]/85 backdrop-blur-xl border border-white/10 rounded-3xl p-3.5 sm:p-5 flex flex-wrap items-center justify-between gap-3.5 sm:gap-4 shadow-xl">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-[#090A0F] border border-white/10 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-inner">
            <img
              src={displayLogo}
              alt={channel.name}
              onError={() => setLogoError(true)}
              className="w-full h-full object-contain rounded-xl"
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-base sm:text-xl font-extrabold text-white truncate">
                {channel.name}
              </h2>
              <button
                type="button"
                onClick={() => jumpToLiveEdge(true)}
                title="Sincronizar transmisión a En Directo"
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider border transition-all hover:scale-105 ${
                  isLiveSynced
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
                    : 'bg-amber-500 text-black border-amber-400'
                }`}
              >
                <Radio className="w-3 h-3" />
                <span>
                  {isLiveSynced ? 'EN DIRECTO' : `IR A DIRECTO (-${behindSeconds}s)`}
                </span>
              </button>
              {channel.is_colombia && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30">
                  🇨🇴 Colombia TDT
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600/25 to-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-medium">
                {channel.category}
              </span>
              <span>•</span>
              <span>
                {channel.flag} {channel.country}
              </span>
              <span>•</span>
              <span className="font-mono text-white/50">
                {channel.quality?.toUpperCase() || 'HD'}
              </span>
            </div>
          </div>
        </div>

        {/* Hybrid Playback Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
          {/* Dedicated "En Directo" Sync Button in the Action Bar */}
          {!isEmbedMode && (
            <button
              type="button"
              onClick={() => jumpToLiveEdge(true)}
              title="Adelantar al último segundo de la señal en directo"
              className={`flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl font-bold text-xs border transition-all duration-200 ${
                isLiveSynced
                  ? 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/35 text-rose-300'
                  : 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-black shadow-lg shadow-amber-500/25 animate-pulse'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>
                {isLiveSynced
                  ? 'En Directo'
                  : `Sincronizar (-${behindSeconds}s)`}
              </span>
            </button>
          )}

          {/* Toggle Proxy / Alternate Signal Button */}
          <button
            type="button"
            onClick={handleCycleSignal}
            title="Alternar Modo Proxy Anti-CORS o cambiar de servidor espejo (.m3u8)"
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl font-bold text-xs border transition-all duration-200 ${
              useProxyMode
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/75 hover:text-white'
            }`}
          >
            {candidateStreams.length > 1 ? (
              <>
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  Señal ({streamIndex + 1}/{candidateStreams.length})
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{useProxyMode ? 'Proxy: ON' : 'Modo Proxy'}</span>
              </>
            )}
          </button>

          {/* Official Web Signal (embed_url) Button when available */}
          {channel.embed_url && (
            <button
              type="button"
              onClick={() => setIsEmbedMode((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl font-bold text-xs border transition-all duration-200 ${
                isEmbedMode
                  ? 'bg-amber-500 text-black border-amber-400 shadow-lg shadow-amber-500/20'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/30 text-amber-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>
                {isEmbedMode ? 'Señal Oficial' : 'Señal Oficial Web'}
              </span>
            </button>
          )}

          {/* Favorite Button */}
          <button
            type="button"
            onClick={() => onToggleFavorite(channel.id)}
            className={`flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl font-semibold text-xs border transition-all duration-300 ${
              isFavorite
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white'
            }`}
          >
            <Heart
              className={`w-4 h-4 ${
                isFavorite ? 'fill-rose-500 text-rose-500 scale-110' : ''
              }`}
            />
            <span className="hidden sm:inline">{isFavorite ? 'Favorito' : 'Guardar'}</span>
          </button>

          {/* Next Channel Button */}
          <button
            type="button"
            onClick={onNextChannel}
            className="flex items-center gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-semibold text-xs shadow-lg shadow-violet-950/40 hover:scale-[1.02] active:scale-95 transition-all ml-auto sm:ml-0"
          >
            <span>Siguiente</span>
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grouped Signals & Live Working Probability Preview Panel */}
      <div className="bg-[#13151F]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-3.5 sm:px-5 sm:py-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-white">
                  Señales Agrupadas y Vista Previa de Estado
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Probabilidad: {channel.probability ?? 85}% ({channel.probability_label || 'Alta'})
                </span>
              </div>
              <p className="text-[11px] text-white/50 truncate">
                {groupedSignals.length > 1
                  ? `${groupedSignals.length} señales de ${channel.name} unificadas. Elige la de mejor estado.`
                  : `Estado en vivo y latencia de la señal de ${channel.name}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => runSignalProbe(groupedSignals)}
              disabled={isProbing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-cyan-300 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
              <span>{isProbing ? 'Verificando...' : 'Comprobar estado'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSignalsPanel((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-white/70"
            >
              <span>{showSignalsPanel ? 'Ocultar' : `Ver (${groupedSignals.length})`}</span>
              {showSignalsPanel ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {showSignalsPanel && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
          {groupedSignals.map((sig, idx) => {
            const isSelected = !isEmbedMode && streamIndex === idx;
            const probe = probeMap[sig.url];
            const probValue = probe ? probe.probability : sig.probability ?? 80;
            const status = probe?.status; // 'online' | 'slow' | 'restricted' | 'offline'

            const statusBadge = !probe ? (
              isProbing ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300">
                  <Clock className="w-3 h-3 animate-spin" />
                  Verificando...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                  Est. {probValue}%
                </span>
              )
            ) : status === 'online' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400">
                <CheckCircle2 className="w-3 h-3" />
                {probValue}% • {probe.latency_ms}ms
              </span>
            ) : status === 'slow' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-300">
                <Clock className="w-3 h-3" />
                {probValue}% • Lenta ({probe.latency_ms}ms)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-400">
                <XCircle className="w-3 h-3" />
                {probe.status_text || 'Sin señal'} ({probValue}%)
              </span>
            );

            return (
              <button
                key={sig.id || idx}
                type="button"
                onClick={() => {
                  setIsEmbedMode(false);
                  setStreamIndex(idx);
                  setUseProxyMode(Boolean(sig.use_proxy || sig.url.startsWith('http://')));
                  setRetryCount((c) => c + 1);
                }}
                className={`flex items-center justify-between gap-2.5 p-2.5 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? 'bg-cyan-950/35 border-cyan-400 ring-1 ring-cyan-400/50 shadow-md'
                    : 'bg-[#090A0F]/70 hover:bg-white/[0.06] border-white/10'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        !probe
                          ? probValue >= 80
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                          : status === 'online'
                          ? 'bg-emerald-400 animate-pulse'
                          : status === 'slow'
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span
                      className={`text-xs font-bold truncate ${
                        isSelected ? 'text-cyan-300' : 'text-white'
                      }`}
                    >
                      {sig.label || `Señal ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/45">
                    <span className="px-1.5 py-0.2 rounded bg-white/5 text-white/70 font-mono">
                      {sig.quality || 'HD'}
                    </span>
                    <span>•</span>
                    <span>{sig.protocol || 'HLS'}</span>
                    {sig.use_proxy && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-300/90">Proxy</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {statusBadge}
                  <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 ml-auto">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        probValue >= 80
                          ? 'bg-emerald-400'
                          : probValue >= 60
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(8, Math.min(100, probValue))}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}

          {channel.embed_url && (
            <button
              type="button"
              onClick={() => setIsEmbedMode(true)}
              className={`flex items-center justify-between gap-2.5 p-2.5 rounded-2xl border text-left transition-all ${
                isEmbedMode
                  ? 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-400/50 shadow-md'
                  : 'bg-[#090A0F]/70 hover:bg-white/[0.06] border-amber-500/25'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-amber-300 truncate">
                    Señal Oficial Web (Respaldo)
                  </span>
                </div>
                <div className="text-[10px] text-white/50 mt-1">
                  Reproductor embebido oficial del canal
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-300">
                  <Globe className="w-3 h-3" />
                  99% Oficial
                </span>
                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 ml-auto">
                  <div className="h-full w-full bg-amber-400 rounded-full" />
                </div>
              </div>
            </button>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
