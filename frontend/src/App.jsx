import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  RefreshCw,
  Maximize2,
  Minimize2,
  Radio,
  Tv,
  Globe,
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  MapPin,
  ChevronDown,
  Play,
  PlusCircle,
} from 'lucide-react';
import VideoPlayer from './components/VideoPlayer.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChannelCard from './components/ChannelCard.jsx';
import ChannelListItem from './components/ChannelListItem.jsx';
import AddChannelModal from './components/AddChannelModal.jsx';
import { buildApiUrl } from './config.js';

const STORAGE_FAVORITES_KEY = 'exetv_favorites_v1';
const STORAGE_LAST_CHANNEL_KEY = 'exetv_last_channel_v1';
const STORAGE_VIEW_MODE_KEY = 'exetv_view_mode_v1';
const COLOMBIA_CATEGORY = '🇨🇴 TV Colombia';

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export default function App() {
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [countries, setCountries] = useState([]);
  const [regions, setRegions] = useState([]);

  const [currentChannel, setCurrentChannel] = useState(null);
  // Default category on startup: "🇨🇴 TV Colombia" as required by actualicion.md
  const [selectedCategory, setSelectedCategory] = useState(COLOMBIA_CATEGORY);
  const [selectedCountry, setSelectedCountry] = useState('Todos');
  const [selectedRegion, setSelectedRegion] = useState('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_VIEW_MODE_KEY) || 'grid';
    } catch {
      return 'grid';
    }
  });

  const [visibleCount, setVisibleCount] = useState(60);
  const [guideVisibleCount, setGuideVisibleCount] = useState(40);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [includeGlobal, setIncludeGlobal] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_FAVORITES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      // Ignore storage errors
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_VIEW_MODE_KEY, viewMode);
    } catch {
      // Ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    setVisibleCount(60);
    setGuideVisibleCount(40);
  }, [selectedCategory, selectedCountry, selectedRegion, searchQuery]);

  const selectInitialChannel = useCallback((channelList) => {
    if (!channelList || channelList.length === 0) return;
    try {
      const lastStreamUrl = localStorage.getItem(STORAGE_LAST_CHANNEL_KEY);
      if (lastStreamUrl) {
        const found = channelList.find((c) => c.stream_url === lastStreamUrl);
        if (found) {
          setCurrentChannel(found);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }
    setCurrentChannel(channelList[0]);
  }, []);

  const fetchChannels = useCallback(
    async (useGlobal = false) => {
      setIsLoading(true);
      setErrorMsg('');

      const primaryUrl = buildApiUrl(`/api/channels?include_global=${useGlobal}`);
      const endpoints = Array.from(
        new Set([
          primaryUrl,
          `/api/channels?include_global=${useGlobal}`,
        ])
      );

      for (let attempt = 0; attempt < 4; attempt++) {
        for (const url of endpoints) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              const list = data.channels || [];
              if (list.length > 0 || attempt >= 2) {
                setChannels(list);
                setCategories(data.categories || []);
                setCountries(data.countries || []);
                setRegions(data.regions || []);
                selectInitialChannel(list);
                setIsLoading(false);
                return;
              }
            }
          } catch {
            // Try next endpoint or retry
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      setErrorMsg(
        'No se pudo conectar con el servidor de Exe.tv. Verifica tu conexión o el estado del Backend.'
      );
      setIsLoading(false);
    },
    [selectInitialChannel]
  );

  useEffect(() => {
    fetchChannels(includeGlobal);
  }, [fetchChannels, includeGlobal]);

  const handleRefreshCatalog = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(buildApiUrl(`/api/refresh?include_global=${includeGlobal}`));
      if (res.ok) {
        await fetchChannels(includeGlobal);
      }
    } catch {
      // Keep current channels if refresh fails
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectChannel = useCallback((channel) => {
    if (!channel) return;
    setCurrentChannel(channel);
    try {
      localStorage.setItem(STORAGE_LAST_CHANNEL_KEY, channel.stream_url);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleToggleFavorite = useCallback((channelId) => {
    setFavorites((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  }, []);

  const handleResetFilters = useCallback(() => {
    setSelectedCategory(COLOMBIA_CATEGORY);
    setSelectedCountry('Todos');
    setSelectedRegion('Todas');
    setSearchQuery('');
  }, []);

  const handleSelectCountry = useCallback((countryName) => {
    setSelectedCountry(countryName);
    // If the user explicitly chooses a country other than Colombia while in "🇨🇴 TV Colombia", switch category to "Todos" so they see that country's channels
    if (countryName !== 'Todos' && countryName !== 'Colombia') {
      setSelectedCategory((prev) => (prev === COLOMBIA_CATEGORY ? 'Todos' : prev));
    }
  }, []);

  const handleSelectRegion = useCallback((regionName) => {
    setSelectedRegion(regionName);
    if (regionName !== 'Todas' && regionName !== 'Sudamérica') {
      setSelectedCategory((prev) => (prev === COLOMBIA_CATEGORY ? 'Todos' : prev));
    }
  }, []);

  // Multi-dimensional + Accent-insensitive real-time channel filtering
  const filteredChannels = useMemo(() => {
    const q = normalizeStr(searchQuery);

    return channels.filter((ch) => {
      // 1. Category filter
      if (selectedCategory === 'Favoritos') {
        if (!favorites.includes(ch.id)) return false;
      } else if (selectedCategory === COLOMBIA_CATEGORY) {
        if (!ch.is_colombia && ch.country_code !== 'CO') return false;
      } else if (selectedCategory !== 'Todos') {
        if (normalizeStr(ch.category) !== normalizeStr(selectedCategory)) {
          return false;
        }
      }

      // 2. Country filter
      if (selectedCountry !== 'Todos') {
        if (normalizeStr(ch.country) !== normalizeStr(selectedCountry)) {
          return false;
        }
      }

      // 3. Region filter
      if (selectedRegion !== 'Todas') {
        if (normalizeStr(ch.region) !== normalizeStr(selectedRegion)) {
          return false;
        }
      }

      // 4. Search query filter
      if (!q) return true;

      const haystack = normalizeStr(
        `${ch.name} ${ch.category} ${ch.country || ''} ${ch.region || ''} ${ch.number || ''} ${ch.tvg_id || ''}`
      );
      return haystack.includes(q);
    });
  }, [channels, selectedCategory, selectedCountry, selectedRegion, searchQuery, favorites]);

  const globalSearchMatchesCount = useMemo(() => {
    const q = normalizeStr(searchQuery);
    if (!q) return 0;
    return channels.filter((ch) => {
      const haystack = normalizeStr(
        `${ch.name} ${ch.category} ${ch.country || ''} ${ch.region || ''} ${ch.number || ''}`
      );
      return haystack.includes(q);
    }).length;
  }, [channels, searchQuery]);

  const dynamicCategories = useMemo(() => {
    if (selectedCountry === 'Todos' && selectedRegion === 'Todas' && !searchQuery.trim()) {
      return categories;
    }
    const q = normalizeStr(searchQuery);
    const subset = channels.filter((ch) => {
      if (selectedCountry !== 'Todos' && normalizeStr(ch.country) !== normalizeStr(selectedCountry)) {
        return false;
      }
      if (selectedRegion !== 'Todas' && normalizeStr(ch.region) !== normalizeStr(selectedRegion)) {
        return false;
      }
      if (q) {
        const haystack = normalizeStr(
          `${ch.name} ${ch.category} ${ch.country || ''} ${ch.region || ''} ${ch.number || ''}`
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const counts = { [COLOMBIA_CATEGORY]: 0 };
    for (const ch of subset) {
      counts[ch.category] = (counts[ch.category] || 0) + 1;
      if (ch.is_colombia || ch.country_code === 'CO') {
        counts[COLOMBIA_CATEGORY] = (counts[COLOMBIA_CATEGORY] || 0) + 1;
      }
    }

    return [
      { name: COLOMBIA_CATEGORY, count: counts[COLOMBIA_CATEGORY] || 0 },
      { name: 'Todos', count: subset.length },
      ...categories
        .filter((c) => c.name !== 'Todos' && c.name !== COLOMBIA_CATEGORY)
        .map((c) => ({
          name: c.name,
          count: counts[c.name] || 0,
        })),
    ];
  }, [channels, categories, selectedCountry, selectedRegion, searchQuery]);

  const handleNextChannel = useCallback(() => {
    const pool = filteredChannels.length > 0 ? filteredChannels : channels;
    if (pool.length === 0) return;
    const idx = pool.findIndex((c) => c.id === currentChannel?.id);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % pool.length;
    handleSelectChannel(pool[nextIdx]);
  }, [filteredChannels, channels, currentChannel, handleSelectChannel]);

  const handlePrevChannel = useCallback(() => {
    const pool = filteredChannels.length > 0 ? filteredChannels : channels;
    if (pool.length === 0) return;
    const idx = pool.findIndex((c) => c.id === currentChannel?.id);
    const prevIdx = idx <= 0 ? pool.length - 1 : idx - 1;
    handleSelectChannel(pool[prevIdx]);
  }, [filteredChannels, channels, currentChannel, handleSelectChannel]);

  const visibleCatalogChannels = useMemo(
    () => filteredChannels.slice(0, visibleCount),
    [filteredChannels, visibleCount]
  );

  const visibleGuideChannels = useMemo(
    () => filteredChannels.slice(0, guideVisibleCount),
    [filteredChannels, guideVisibleCount]
  );

  const hasActiveFilterPills =
    selectedCategory !== COLOMBIA_CATEGORY ||
    selectedCountry !== 'Todos' ||
    selectedRegion !== 'Todas' ||
    Boolean(searchQuery.trim());

  return (
    <div className="min-h-screen bg-[#090A0F] text-white selection:bg-violet-600 selection:text-white pb-16">
      {/* Subtle Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/15 rounded-full blur-[130px]" />
        <div className="absolute top-1/4 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-[130px]" />
      </div>

      {/* Floating Header (rounded-2xl) */}
      <header className="sticky top-3 z-40 max-w-[1680px] mx-auto px-3 sm:px-6 pt-2">
        <div className="bg-[#13151F]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xl shadow-black/50">
          {/* Brand Logo */}
          <div
            onClick={handleResetFilters}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-600/30 group-hover:scale-105 transition-transform">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-white via-white to-cyan-300 bg-clip-text text-transparent">
                Exe.tv
              </span>
              <span className="relative flex h-2.5 w-2.5" title="Transmisión en tiempo real">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
              </span>
            </div>
          </div>

          {/* Central Pill Search Bar (rounded-full) */}
          <div className="relative flex-1 max-w-lg min-w-[220px] order-3 md:order-2 w-full md:w-auto">
            <Search className="w-4 h-4 text-cyan-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar canal (ej. Caracol, RCN, Win, ESPN, Argentina, Cine)..."
              className="w-full pl-11 pr-24 py-2.5 rounded-full bg-[#090A0F]/95 border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/25 text-sm text-white placeholder-white/40 focus:outline-none transition-all"
            />
            {searchQuery && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {filteredChannels.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right Utilities */}
          <div className="flex items-center gap-2 order-2 md:order-3">
            {/* Segmented View Toggle: Grid vs List */}
            <div className="flex items-center p-1 rounded-full bg-[#090A0F]/90 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Vista en Cuadrícula"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Cuadrícula</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Vista en Lista"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Lista</span>
              </button>
            </div>

            {/* Live Channel Counter Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-semibold">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-white">{filteredChannels.length}</span>
              <span className="text-white/40">/ {channels.length}</span>
            </div>

            {/* Add Channel / Playlist Modal Button */}
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              title="Agregar canal (.m3u8) o lista (.m3u)"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600/30 to-cyan-500/30 hover:from-violet-600 hover:to-cyan-500 border border-cyan-400/40 text-cyan-200 hover:text-white transition-all shadow"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">+ Agregar Canal</span>
            </button>

            {/* Global Feed Toggle */}
            <button
              type="button"
              onClick={() => setIncludeGlobal((g) => !g)}
              title="Activar el índice mundial completo (+9,800 canales)"
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all ${
                includeGlobal
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">
                {includeGlobal ? 'Mundial (+9,800)' : 'Iberoamérica + Colombia'}
              </span>
            </button>

            {/* Refresh Cache Button */}
            <button
              type="button"
              onClick={handleRefreshCatalog}
              disabled={isRefreshing || isLoading}
              title="Sincronizar lista desde iptv-org"
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`}
              />
            </button>

            {/* Theater Mode Toggle */}
            <button
              type="button"
              onClick={() => setTheaterMode((t) => !t)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                theaterMode
                  ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-950/50'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white'
              }`}
            >
              {theaterMode ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Salir Teatro</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Modo Teatro</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="relative z-10 max-w-[1680px] mx-auto px-3 sm:px-6 mt-5">
        {errorMsg && (
          <div className="mb-6 p-5 rounded-3xl bg-rose-950/40 border border-rose-500/40 text-rose-200 flex items-center justify-between gap-4">
            <p className="text-sm font-medium">{errorMsg}</p>
            <button
              type="button"
              onClick={() => fetchChannels(includeGlobal)}
              className="px-4 py-2 rounded-full bg-rose-500/30 hover:bg-rose-500/50 text-white text-xs font-bold shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Animated Skeleton Loader */}
        {isLoading ? (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-72 xl:w-80 shrink-0">
              <div className="bg-[#13151F]/80 border border-white/10 rounded-3xl p-4 space-y-3 animate-pulse">
                {Array.from({ length: 9 }).map((_, idx) => (
                  <div key={idx} className="h-11 bg-white/5 rounded-2xl" />
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-8 aspect-video rounded-3xl bg-[#13151F]/80 border border-white/10 animate-pulse flex flex-col items-center justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 mb-3" />
                  <div className="h-4 w-48 bg-white/10 rounded-full" />
                </div>
                <div className="xl:col-span-4 h-96 xl:h-auto rounded-3xl bg-[#13151F]/80 border border-white/10 p-4 animate-pulse space-y-3">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="h-14 rounded-2xl bg-white/5" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Sidebar Navigation */}
            {!theaterMode && (
              <Sidebar
                categories={dynamicCategories}
                countries={countries}
                regions={regions}
                selectedCategory={selectedCategory}
                selectedCountry={selectedCountry}
                selectedRegion={selectedRegion}
                onSelectCategory={setSelectedCategory}
                onSelectCountry={handleSelectCountry}
                onSelectRegion={handleSelectRegion}
                onResetFilters={handleResetFilters}
                favoritesCount={favorites.length}
              />
            )}

            {/* Central Workspace */}
            <div className="flex-1 min-w-0 w-full space-y-6">
              {/* Active Filter Banner */}
              {hasActiveFilterPills && (
                <div className="bg-[#13151F]/90 backdrop-blur-xl border border-cyan-500/30 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 mr-1">
                      <Filter className="w-3.5 h-3.5" />
                      Vista actual:
                    </span>

                    <button
                      type="button"
                      onClick={() => setSelectedCategory('Todos')}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-violet-600/30 text-violet-200 border border-violet-500/40 hover:bg-violet-600/50 transition-colors"
                    >
                      <span>Categoría: {selectedCategory}</span>
                      <X className="w-3 h-3" />
                    </button>

                    {selectedCountry !== 'Todos' && (
                      <button
                        type="button"
                        onClick={() => setSelectedCountry('Todos')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-600/30 text-cyan-200 border border-cyan-500/40 hover:bg-cyan-600/50 transition-colors"
                      >
                        <span>País: {selectedCountry}</span>
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {selectedRegion !== 'Todas' && (
                      <button
                        type="button"
                        onClick={() => setSelectedRegion('Todas')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-600/50 transition-colors"
                      >
                        <span>Región: {selectedRegion}</span>
                        <X className="w-3 h-3" />
                      </button>
                    )}

                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/25 text-amber-200 border border-amber-500/40 hover:bg-amber-500/40 transition-colors"
                      >
                        <span>Búsqueda: "{searchQuery}"</span>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {filteredChannels.length > 0 &&
                      !filteredChannels.some((c) => c.id === currentChannel?.id) && (
                        <button
                          type="button"
                          onClick={() => handleSelectChannel(filteredChannels[0])}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow hover:scale-105 transition-transform"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Sintonizar {filteredChannels[0].name}</span>
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategory('Todos');
                        setSelectedCountry('Todos');
                        setSelectedRegion('Todas');
                        setSearchQuery('');
                      }}
                      className="text-xs font-semibold text-white/75 hover:text-white px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
                    >
                      Ver todos ({channels.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Upper Bento Section: Video Player + Live Side-by-Side Channel List */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className={theaterMode ? 'xl:col-span-12' : 'xl:col-span-8'}>
                  {currentChannel && (
                    <VideoPlayer
                      channel={currentChannel}
                      onNextChannel={handleNextChannel}
                      onPrevChannel={handlePrevChannel}
                      isFavorite={favorites.includes(currentChannel.id)}
                      onToggleFavorite={handleToggleFavorite}
                      theaterMode={theaterMode}
                      onToggleTheater={() => setTheaterMode((t) => !t)}
                    />
                  )}
                </div>

                {/* Live Interactive Channel List Panel right next to the Player */}
                {!theaterMode && (
                  <div className="xl:col-span-4 bg-[#13151F]/85 backdrop-blur-xl border border-white/10 rounded-3xl p-4 flex flex-col h-[520px] xl:h-[560px] shadow-xl">
                    <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-white/10 shrink-0">
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-white flex items-center gap-2 truncate">
                          <List className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span className="truncate">
                            Lista en Vivo ({filteredChannels.length})
                          </span>
                        </h3>
                        <p className="text-[11px] text-white/50 truncate mt-0.5">
                          {[
                            selectedCategory,
                            selectedCountry !== 'Todos' ? selectedCountry : null,
                            selectedRegion !== 'Todas' ? selectedRegion : null,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCategory((prev) =>
                            prev === COLOMBIA_CATEGORY ? 'Todos' : COLOMBIA_CATEGORY
                          )
                        }
                        className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/30 shrink-0 transition-colors"
                      >
                        {selectedCategory === COLOMBIA_CATEGORY
                          ? `Ver Todos (${channels.length})`
                          : COLOMBIA_CATEGORY}
                      </button>
                    </div>

                    {/* Scrollable Compact Channel List */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                      {filteredChannels.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3">
                          <p className="text-xs font-semibold text-white/70">
                            No hay canales en esta combinación de filtros.
                          </p>
                          {searchQuery.trim() && globalSearchMatchesCount > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategory('Todos');
                                setSelectedCountry('Todos');
                                setSelectedRegion('Todas');
                              }}
                              className="px-4 py-2 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-bold text-white shadow"
                            >
                              Ver {globalSearchMatchesCount} resultados en Todos los canales
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategory('Todos');
                              setSelectedCountry('Todos');
                              setSelectedRegion('Todas');
                              setSearchQuery('');
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"
                          >
                            Ver Todos los Canales ({channels.length})
                          </button>
                        </div>
                      ) : (
                        <>
                          {visibleGuideChannels.map((ch) => (
                            <ChannelListItem
                              key={ch.id}
                              channel={ch}
                              isActive={currentChannel?.id === ch.id}
                              isFavorite={favorites.includes(ch.id)}
                              onSelect={handleSelectChannel}
                              onToggleFavorite={handleToggleFavorite}
                              compact={true}
                            />
                          ))}

                          {filteredChannels.length > guideVisibleCount && (
                            <button
                              type="button"
                              onClick={() => setGuideVisibleCount((c) => c + 50)}
                              className="w-full py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-cyan-300 transition-colors"
                            >
                              Mostrar más ({filteredChannels.length - guideVisibleCount} restantes)
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Horizontal Filter Bar for Country & Region */}
              <div className="bg-[#13151F]/75 backdrop-blur-xl border border-white/10 rounded-3xl p-4 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white/50 pr-1 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    País:
                  </span>
                  {countries.slice(0, 14).map((country) => {
                    const active = selectedCountry === country.name;
                    return (
                      <button
                        key={country.name}
                        type="button"
                        onClick={() => handleSelectCountry(country.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                          active
                            ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow'
                            : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'
                        }`}
                      >
                        <span>{country.flag}</span>
                        <span>{country.name}</span>
                        <span className="text-[10px] opacity-60">({country.count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 border-t border-white/5">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white/50 pr-1 shrink-0">
                    <Globe className="w-3.5 h-3.5 text-violet-400" />
                    Región:
                  </span>
                  {regions.map((reg) => {
                    const active = selectedRegion === reg.name;
                    return (
                      <button
                        key={reg.name}
                        type="button"
                        onClick={() => handleSelectRegion(reg.name)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                          active
                            ? 'bg-violet-600 text-white shadow'
                            : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/5'
                        }`}
                      >
                        <span>{reg.name}</span>
                        <span className="text-[10px] opacity-60">({reg.count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lower Section: Full Channel Explorer (Grid View OR List View) */}
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#13151F]/80 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      {[
                        selectedCategory === 'Todos'
                          ? 'Todos los Canales en Vivo'
                          : selectedCategory,
                        selectedCountry !== 'Todos' ? `en ${selectedCountry}` : null,
                        selectedRegion !== 'Todas' ? `(${selectedRegion})` : null,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 text-white/70 border border-white/10">
                      Mostrando {visibleCatalogChannels.length} de {filteredChannels.length} canales
                    </span>

                    <div className="flex items-center p-1 rounded-full bg-[#090A0F] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-full transition-colors ${
                          viewMode === 'grid'
                            ? 'bg-cyan-500 text-black'
                            : 'text-white/50 hover:text-white'
                        }`}
                        title="Ver en Cuadrícula"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-full transition-colors ${
                          viewMode === 'list'
                            ? 'bg-cyan-500 text-black'
                            : 'text-white/50 hover:text-white'
                        }`}
                        title="Ver en Lista"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {filteredChannels.length === 0 ? (
                  <div className="bg-[#13151F]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-12 text-center space-y-4">
                    <p className="text-base font-bold text-white">
                      No se encontraron canales en "{selectedCategory}" con ese criterio
                    </p>
                    <p className="text-xs text-white/50 max-w-md mx-auto">
                      {selectedCategory === 'Favoritos'
                        ? 'Aún no has agregado canales a tus Favoritos. Haz clic en el icono de corazón en cualquier canal para guardarlo aquí.'
                        : 'Puedes buscar en el catálogo completo de todos los países haciendo clic en el botón de abajo.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      {searchQuery.trim() && globalSearchMatchesCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory('Todos');
                            setSelectedCountry('Todos');
                            setSelectedRegion('Todas');
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-violet-600 to-cyan-500 text-xs font-bold text-white shadow-lg"
                        >
                          Ver {globalSearchMatchesCount} resultados para "{searchQuery}" en Todos los países
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('Todos');
                          setSelectedCountry('Todos');
                          setSelectedRegion('Todas');
                          setSearchQuery('');
                        }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white"
                      >
                        Ver Todos los Canales ({channels.length})
                      </button>
                    </div>
                  </div>
                ) : viewMode === 'list' ? (
                  <div className="space-y-2.5">
                    {visibleCatalogChannels.map((channel) => (
                      <ChannelListItem
                        key={channel.id}
                        channel={channel}
                        isActive={currentChannel?.id === channel.id}
                        isFavorite={favorites.includes(channel.id)}
                        onSelect={handleSelectChannel}
                        onToggleFavorite={handleToggleFavorite}
                        compact={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {visibleCatalogChannels.map((channel) => (
                      <ChannelCard
                        key={channel.id}
                        channel={channel}
                        isActive={currentChannel?.id === channel.id}
                        isFavorite={favorites.includes(channel.id)}
                        onSelect={handleSelectChannel}
                        onToggleFavorite={handleToggleFavorite}
                      />
                    ))}
                  </div>
                )}

                {filteredChannels.length > visibleCount && (
                  <div className="pt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((c) => c + 80)}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#13151F] hover:bg-[#1b1e2e] border border-cyan-500/30 text-sm font-bold text-cyan-300 shadow-lg transition-all hover:scale-105"
                    >
                      <ChevronDown className="w-4 h-4" />
                      <span>
                        Cargar más canales ({filteredChannels.length - visibleCount} restantes)
                      </span>
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      <AddChannelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={async (addedChannel) => {
          await fetchChannels(includeGlobal);
          if (addedChannel) {
            handleSelectChannel(addedChannel);
          }
        }}
      />
    </div>
  );
}
