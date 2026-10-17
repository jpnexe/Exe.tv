# Rol y Objetivo Principal
Actúa como un Arquitecto de Software Senior y Diseñador UI/UX experto en plataformas de streaming. Tu misión es construir **"Exe.tv"**, una aplicación web de televisión en vivo (IPTV) de acceso libre e inmediato (sin login ni registro). El usuario entra a la página y automáticamente puede reproducir canales en vivo organizados por categorías, alimentándose en tiempo real de repositorios públicos actualizados de IPTV (`iptv-org`).

---

# 1. Stack Tecnológico Requerido
- **Frontend:** React (con Vite), Tailwind CSS, Lucide React (iconos), `hls.js` (para decodificación de streams `.m3u8`).
- **Backend (Motor de Sincronización y Caché):** Python con FastAPI y `httpx` (asíncrono). 
  - *Propósito del Backend:* Descargar, filtrar, categorizar y guardar en caché las listas `.m3u` remotas para no saturar el navegador del cliente parseando decenas de miles de líneas en cada visita.

---

# 2. Fuentes de Datos Auto-Actualizables (Repositorios IPTV)
El backend debe alimentarse automáticamente al iniciar (y actualizar su caché cada 6 horas) desde las listas oficiales de `iptv-org` alojadas en GitHub Pages:
1. **Fuente Principal (Canales en Español / Latinoamérica / España):** 
   `https://iptv-org.github.io/iptv/languages/spa.m3u`
2. **Fuente Secundaria (Índice por Categorías Globales - Deportes, Cine, Música, Noticias):**
   `https://iptv-org.github.io/iptv/index.category.m3u` (Opcional vía parámetro en la API o combinada, priorizando idioma español).

---

# 3. Flujo Lógico del Aplicativo (End-to-End)

### Paso A: Inicialización y Parseo Inteligente en el Backend
1. Cuando arranca el servidor FastAPI, descarga asíncronamente la lista `.m3u` con `httpx`.
2. **Algoritmo del Parser M3U (`m3u_parser.py`):**
   - Lee línea por línea buscando la directiva `#EXTINF:`.
   - Extrae mediante expresiones regulares (Regex):
     - `tvg-id`: Identificador del canal.
     - `tvg-logo`: URL del logotipo del canal. Si está vacío, asignar un placeholder elegante generado dinámicamente con las iniciales del canal.
     - `group-title`: Categoría original (ej. "News", "Sports", "Movies", "Entertainment", "Music", "Kids").
     - `name`: Nombre limpio del canal (texto después de la última coma `,`).
   - Lee la siguiente línea válida que empiece con `http://` o `https://` y termine o contenga `.m3u8` como `stream_url`.
   - **Filtro de Calidad y Seguridad Web:** Descartar enlaces que no sean `https://` (para evitar errores de *Mixed Content* en el navegador) o flujos rotos evidentes.
   - **Normalización y Traducción de Categorías:** Traducir los `group-title` en inglés a categorías limpias en español:
     - `News` -> `Noticias`
     - `Sports` -> `Deportes`
     - `Movies` / `Cinema` -> `Películas`
     - `Music` -> `Música`
     - `Kids` / `Animation` -> `Infantil`
     - `Entertainment` / `General` -> `Entretenimiento`
     - `Documentary` / `Education` -> `Cultura`
     - Otros / Sin categoría -> `Variedades`

### Paso B: Endpoints de la API (FastAPI)
- `GET /api/channels`: Devuelve el catálogo procesado, la lista de categorías únicas con el conteo de canales por categoría, y soporte opcional de filtrado (`?category=Deportes&search=espn`).
- `GET /api/refresh`: Fuerza la recarga de la lista desde el repositorio de GitHub y limpia la caché.

### Paso C: Experiencia de Usuario en el Frontend (Sin Login)
1. **Carga Inicial Instantánea:** Al abrir **Exe.tv**, el usuario entra directo al Dashboard. Se muestra un *Skeleton Loader* animado con bordes redondeados mientras carga `/api/channels`.
2. **Auto-Reproducción Inteligente:** Al recibir la lista de canales, la aplicación selecciona automáticamente el primer canal destacado (o el último canal visto guardado en `localStorage`) y lo carga en el reproductor principal (en `muted` inicialmente si el navegador bloquea el autoplay con sonido, mostrando un botón flotante elegante de "Activar Sonido").
3. **Cambio de Canal Fluido:** Al hacer clic en cualquier tarjeta de canal:
   - El reproductor destruye la instancia previa de `Hls()`, engancha la nueva `stream_url`, muestra un spinner suave sobre el video hasta el evento `MANIFEST_PARSED` y reproduce.
   - Si el stream falla (error de red o CORS del servidor de origen del canal), `hls.js` captura el evento `Hls.Events.ERROR` (`fatal: true`) y muestra una pantalla amigable dentro del reproductor: *"Señal no disponible en este momento"* con un botón para **"Saltar al siguiente canal"** automáticamente.

---

# 4. Diseño UI/UX y Sistema Visual ("Exe.tv Modern Bento UI")
El diseño debe verse ultra moderno, inspirado en **Apple TV+ / YouTube TV / Bento Grids**:
- **Paleta de Colores:**
  - Fondo general: Gris carbón / Azul noche profundo (`bg-[#090A0F]`).
  - Contenedores y paneles: Efecto cristal (`bg-[#13151F]/80 backdrop-blur-xl border border-white/10`).
  - Acento Primario: Violeta Eléctrico a Cian (`from-violet-600 to-cyan-500`).
- **Bordes Redondeados (Regla Estricta de Diseño):**
  - Todos los contenedores principales, el marco del reproductor de video y el menú lateral deben usar bordes generosamente redondeados (`rounded-3xl` o `rounded-2xl`).
  - Las tarjetas de los canales, botones, píldoras de categorías y barra de búsqueda deben usar `rounded-2xl` o `rounded-full`. Nada de esquinas cuadradas.
- **Distribución de Pantalla (Layout):**
  1. **Header Flotante (`rounded-2xl`):** Logo moderno de **Exe.tv** con un punto rojo/cian brillante, buscador central tipo píldora (`rounded-full`) con búsqueda instantánea, contador de canales en vivo disponibles y botón para alternar "Modo Teatro".
  2. **Sidebar / Barra de Categorías:** En escritorio a la izquierda (y en móvil como carrusel horizontal deslizable) con píldoras redondeadas (`rounded-2xl`), icono representativo de Lucide para cada categoría (`Tv`, `Trophy` para Deportes, `Film` para Películas, `Newspaper` para Noticias, `Music` para Música, `Star` para Favoritos) y el número de canales al lado.
  3. **Zona Central Superior - El Reproductor (`VideoPlayer.jsx`):**
     - Contenedor `aspect-video` con `rounded-3xl`, sombra difuminada (`shadow-2xl shadow-violet-950/20`) y borde sutil (`border border-white/10`).
     - Barra inferior de información del canal actual: Logo grande redondeado, título del canal, insignia `EN VIVO` con animación `animate-pulse`, categoría y botón de corazón/estrella para agregar a Favoritos (guardado en `localStorage`).
  4. **Zona Central Inferior - Grilla de Canales:**
     - Grid responsivo (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4`).
     - Cada tarjeta de canal (`ChannelCard.jsx`) debe tener `rounded-2xl`, transición suave al pasar el mouse (`hover:scale-[1.03] hover:border-cyan-500/50 transition-all duration-300`), contenedor del logo con fondo oscuro suave, nombre del canal truncado a una línea y badge de su categoría.
     - El canal que se está reproduciendo actualmente debe resaltar con un borde brillante (`ring-2 ring-cyan-400 bg-cyan-950/20`) y un icono de ondas de audio animadas.

---

# 5. Entregables de Código Requeridos
No uses pseudocódigo ni dejes fragmentos incompletos (`// TODO`). Entrega el código completo y funcional dividido claramente en:
1. **Backend (`/backend`):**
   - `requirements.txt` (`fastapi`, `uvicorn`, `httpx`).
   - `m3u_parser.py` (Lógica completa de descarga desde `iptv-org`, parseo con Regex, limpieza y traducción de categorías).
   - `main.py` (Servidor FastAPI con CORS habilitado, caché en memoria y endpoints `/api/channels` y `/api/refresh`).
2. **Frontend (`/frontend`):**
   - Configuración de Tailwind y dependencias (`package.json` con `hls.js`, `lucide-react`).
   - `src/components/VideoPlayer.jsx` (Integración completa de `hls.js`, controles personalizados redondeados, manejo automático de errores de stream y botón de "Siguiente canal").
   - `src/components/Sidebar.jsx` y `src/components/ChannelCard.jsx`.
   - `src/App.jsx` (Estado global, filtrado por categorías, buscador en tiempo real, gestión de favoritos en `localStorage` y layout completo).
3. **Guía de Ejecución:** Comandos exactos para levantar el backend y el frontend en desarrollo.