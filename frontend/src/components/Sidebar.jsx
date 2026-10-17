import React, { useState } from 'react';
import {
  Tv,
  Trophy,
  Film,
  Newspaper,
  Music,
  Star,
  Sparkles,
  Compass,
  Clapperboard,
  Layers,
  BookOpen,
  HeartHandshake,
  Coffee,
  Globe,
  MapPin,
  Search,
  RotateCcw,
  Radio,
} from 'lucide-react';

const COLOMBIA_CATEGORY = '🇨🇴 TV Colombia';

const CATEGORY_ICONS = {
  [COLOMBIA_CATEGORY]: Radio,
  Todos: Tv,
  Favoritos: Star,
  Deportes: Trophy,
  Películas: Film,
  Series: Clapperboard,
  Noticias: Newspaper,
  Música: Music,
  Infantil: Sparkles,
  Entretenimiento: Tv,
  Documentales: BookOpen,
  Cultura: Compass,
  'Estilo de Vida': Coffee,
  Religión: HeartHandshake,
  Variedades: Layers,
};

export default function Sidebar({
  categories = [],
  countries = [],
  regions = [],
  selectedCategory,
  selectedCountry,
  selectedRegion,
  onSelectCategory,
  onSelectCountry,
  onSelectRegion,
  onResetFilters,
  favoritesCount = 0,
}) {
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'countries' | 'regions'
  const [countryFilter, setCountryFilter] = useState('');

  const colombiaEntry = categories.find((c) => c.name === COLOMBIA_CATEGORY) || {
    name: COLOMBIA_CATEGORY,
    count: 0,
  };
  const totalEntry = categories.find((c) => c.name === 'Todos') || {
    name: 'Todos',
    count: 0,
  };
  const baseCategories = categories.filter(
    (c) => c.name !== 'Todos' && c.name !== COLOMBIA_CATEGORY
  );

  const categoryItems = [
    colombiaEntry,
    totalEntry,
    { name: 'Favoritos', count: favoritesCount },
    ...baseCategories,
  ];

  const filteredCountries = countries.filter((c) => {
    if (!countryFilter.trim()) return true;
    return c.name.toLowerCase().includes(countryFilter.toLowerCase().trim());
  });

  const hasActiveFilters =
    selectedCategory !== COLOMBIA_CATEGORY ||
    selectedCountry !== 'Todos' ||
    selectedRegion !== 'Todas';

  return (
    <aside className="w-full lg:w-72 xl:w-80 shrink-0">
      <div className="bg-[#13151F]/85 backdrop-blur-xl border border-white/10 rounded-3xl p-3.5 sm:p-4 lg:sticky lg:top-24 shadow-xl space-y-3">
        {/* Top Filter Dimension Switcher (Géneros | Países | Regiones) */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#090A0F]/90 border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'categories'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Categorías</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('countries')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'countries'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Países</span>
            {selectedCountry !== 'Todos' && (
              <span className="w-2 h-2 rounded-full bg-cyan-300" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('regions')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'regions'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Región</span>
            {selectedRegion !== 'Todas' && (
              <span className="w-2 h-2 rounded-full bg-cyan-300" />
            )}
          </button>
        </div>

        {/* Active Filter Summary & Reset */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-xs">
            <div className="truncate text-cyan-200 font-medium">
              {[
                selectedCategory,
                selectedCountry !== 'Todos' ? selectedCountry : null,
                selectedRegion !== 'Todas' ? selectedRegion : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </div>
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold shrink-0 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Colombia TDT</span>
            </button>
          </div>
        )}

        {/* TAB 1: CATEGORIES (🇨🇴 TV Colombia priority + Todos + Favoritos + Thematic) */}
        {activeTab === 'categories' && (
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-230px)] no-scrollbar pb-1 lg:pb-0">
            {categoryItems.map((cat) => {
              const IconComponent = CATEGORY_ICONS[cat.name] || Tv;
              const isActive = selectedCategory === cat.name;
              const isFav = cat.name === 'Favoritos';
              const isCol = cat.name === COLOMBIA_CATEGORY;

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => onSelectCategory(cat.name)}
                  className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-950/50'
                      : isCol
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-400/30'
                      : 'bg-white/[0.03] hover:bg-white/[0.08] text-white/75 hover:text-white border border-transparent hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : isCol
                          ? 'bg-amber-400/20 text-amber-300'
                          : isFav
                          ? 'bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25'
                          : 'bg-white/5 text-cyan-400 group-hover:bg-white/10'
                      }`}
                    >
                      <IconComponent
                        className={`w-3.5 h-3.5 ${
                          isFav && (isActive || favoritesCount > 0) ? 'fill-current' : ''
                        }`}
                      />
                    </div>
                    <span>{cat.name}</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                      isActive
                        ? 'bg-black/30 text-white'
                        : isCol
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'bg-white/5 text-white/50 group-hover:text-white/80'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* TAB 2: COUNTRIES */}
        {activeTab === 'countries' && (
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                placeholder="Filtrar país..."
                className="w-full pl-9 pr-3 py-2 rounded-2xl bg-[#090A0F]/90 border border-white/10 focus:border-cyan-400/60 text-xs text-white placeholder-white/40 focus:outline-none"
              />
            </div>

            <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-280px)] no-scrollbar pb-1 lg:pb-0">
              {filteredCountries.map((country) => {
                const isActive = selectedCountry === country.name;
                return (
                  <button
                    key={country.name}
                    type="button"
                    onClick={() => onSelectCountry(country.name)}
                    className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                      isActive
                        ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-950/50'
                        : 'bg-white/[0.03] hover:bg-white/[0.08] text-white/75 hover:text-white border border-transparent hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-base leading-none">
                        {country.flag || '🌐'}
                      </span>
                      <span className="truncate">{country.name}</span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                        isActive
                          ? 'bg-black/30 text-white'
                          : 'bg-white/5 text-white/50 group-hover:text-white/80'
                      }`}
                    >
                      {country.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {/* TAB 3: REGIONS */}
        {activeTab === 'regions' && (
          <nav className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-230px)] no-scrollbar pb-1 lg:pb-0">
            {regions.map((reg) => {
              const isActive = selectedRegion === reg.name;
              return (
                <button
                  key={reg.name}
                  type="button"
                  onClick={() => onSelectRegion(reg.name)}
                  className={`group flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 shrink-0 ${
                    isActive
                      ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-950/50'
                      : 'bg-white/[0.03] hover:bg-white/[0.08] text-white/75 hover:text-white border border-transparent hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                        isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-cyan-400'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate">{reg.name}</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-colors ${
                      isActive
                        ? 'bg-black/30 text-white'
                        : 'bg-white/5 text-white/50 group-hover:text-white/80'
                    }`}
                  >
                    {reg.count}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </aside>
  );
}
