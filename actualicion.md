# Actualización de Requerimientos para "Exe.tv" - Enfoque Prioritario TV Colombia (TDT)

Necesito actualizar el motor del Backend (FastAPI) y la interfaz del Frontend (React) de **Exe.tv** para dar prioridad absoluta a los canales nacionales y regionales de Colombia (Caracol, RCN, Canal 1, Señal Colombia, Telecaribe, etc.), combinando múltiples fuentes y añadiendo un Proxy de Cabeceras para evitar bloqueos de CORS/Referer.

## 1. Nuevas Fuentes de Datos M3U en el Backend (`m3u_parser.py`)
El sistema debe descargar y fusionar (sin duplicar canales) las siguientes fuentes al iniciar:
1. **Fuente Prioritaria 1 (Colombia Oficial iptv-org):** 
   `https://iptv-org.github.io/iptv/countries/co.m3u`
2. **Fuente Prioritaria 2 (Streams crudos de Colombia):** 
   `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/co.m3u`
3. **Fuente Secundaria (Canales Internacionales en Español):** 
   `https://iptv-org.github.io/iptv/languages/spa.m3u`
4. **Diccionario Local de Canales Fijos (`custom_colombia.json`):**
   - Crea un archivo JSON local editable donde yo pueda agregar o sobreescribir manualmente canales VIP (como Caracol TV HD, RCN HD, Win Sports, Canal 1, Telecaribe) con sus respectivos `name`, `logo`, `category: "Colombia TDT"`, `stream_url`, `headers` (opcional, ej. `Referer` y `User-Agent`) y un campo `embed_url` (por si prefiero usar el iframe oficial del canal cuando el `.m3u8` tenga token dinámico).

## 2. Regla de Categorización para Colombia
- Todos los canales provenientes de `co.m3u` o que tengan en su `tvg-id` la terminación `.co` (ej. `CaracolTV.co`, `RCN.co`, `Telecaribe.co`, `SenalColombia.co`, `Canal1.co`, `Citytv.co`) deben asignarse o etiquetarse dentro de una categoría especial prioritaria llamada **"🇨🇴 TV Colombia"**, además de mantener su categoría temática (Noticias, Deportes, etc.).
- Al abrir **Exe.tv**, la categoría seleccionada por defecto debe ser **"🇨🇴 TV Colombia"**, y en los primeros lugares de la grilla deben aparecer: Caracol, RCN, Canal 1, Señal Colombia, Citytv y Telecaribe.

## 3. Proxy Inteligente para Evitar Bloqueos en Caracol / RCN (`/api/proxy-stream`)
Muchos canales colombianos (como las señales de Mediastream/Akamai de Caracol y RCN) bloquean la reproducción si la petición viene de `localhost` o de otro dominio por falta de cabeceras `Referer` o `Origin`.
- Crea un endpoint en FastAPI `/api/proxy?url={encoded_url}` usando `httpx.AsyncClient`.
- Este endpoint debe reenviar la petición inyectando cabeceras limpias (`User-Agent` de navegador moderno y `Referer` dinámico según el dominio del canal) y devolver la respuesta con `Access-Control-Allow-Origin: *`.
- Si un archivo `.m3u8` pasa por el proxy, reescribe las rutas relativas de los segmentos `.ts` o sub-listas `.m3u8` para que también pasen por el proxy si es necesario, o permite alternar en el Frontend un botón **"Modo Proxy / Señal Alterna"** si el reproductor detecta error de red en `hls.js`.

## 4. Soporte Híbrido en el Reproductor (`VideoPlayer.jsx`)
- Si el objeto del canal tiene un `stream_url` (`.m3u8`), reprodúcelo con nuestro reproductor personalizado `hls.js` de bordes redondeados (`rounded-3xl`).
- Si el canal falla en `hls.js` o tiene configurado un `embed_url` de respaldo (por ejemplo, el reproductor web oficial en vivo de Caracol o RCN), muestra un botón redondeado en la barra del reproductor que diga **"Cambiar a Señal Oficial Web"** que cargue el stream de respaldo dentro del mismo marco `rounded-3xl` sin sacar al usuario de Exe.tv.

Entrega el código actualizado de `m3u_parser.py`, `custom_colombia.json`, el endpoint de proxy en `main.py` y el ajuste híbrido en `VideoPlayer.jsx`.