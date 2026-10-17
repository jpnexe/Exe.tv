import asyncio
import json
import re
import urllib.parse
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List
import time

import httpx
from fastapi import FastAPI, Query, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from m3u_parser import (
    fetch_and_parse_playlists,
    parse_m3u_content,
    load_custom_channels,
    save_custom_channels,
    build_placeholder_logo,
    get_initials,
    estimate_stream_probability,
    get_probability_label,
    COUNTRY_INFO,
    COLOMBIA_CATEGORY_LABEL,
)

CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours
DISK_CACHE_FILE = Path(__file__).resolve().parent / "catalog_cache.json"

DEFAULT_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# Domain-specific Referer/Origin map for Colombian & Latin American broadcasters
DOMAIN_REFERER_MAP = {
    "caracol": "https://www.caracoltv.com/",
    "rcn": "https://www.canalrcn.com/",
    "canal1": "https://canal1.com.co/",
    "mdstrm.com": "https://canal1.com.co/",
    "mediastream": "https://www.caracoltv.com/",
    "rtvc": "https://www.rtvcplay.co/",
    "telecaribe": "https://www.telecaribe.co/",
    "teleantioquia": "https://www.teleantioquia.co/",
    "cdnmedia.tv": "https://www.telecaribe.co/",
    "winsports": "https://www.winsports.co/",
    "ntn24": "https://www.ntn24.com/",
}

RE_M3U8_URI_ATTR = re.compile(r'URI="([^"]+)"')

catalog_cache: Dict[str, Any] = {
    "channels": [],
    "categories": [],
    "countries": [],
    "regions": [],
    "total": 0,
    "last_updated": None,
    "include_global": False,
}

cache_lock = asyncio.Lock()


class CustomChannelInput(BaseModel):
    name: str
    stream_url: str
    category: str = "Entretenimiento"
    country_code: str = "CO"
    logo: Optional[str] = None
    quality: str = "HD"
    embed_url: Optional[str] = None


class CustomPlaylistInput(BaseModel):
    playlist_url: str
    default_category: Optional[str] = None
    default_country_code: Optional[str] = None


class SignalProbeItem(BaseModel):
    url: str
    label: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class SignalProbeRequest(BaseModel):
    streams: List[SignalProbeItem]


def load_disk_cache() -> bool:
    """Loads the last saved catalog from disk so startup is instantaneous."""
    if not DISK_CACHE_FILE.exists():
        return False
    try:
        data = json.loads(DISK_CACHE_FILE.read_text(encoding="utf-8"))
        channels = data.get("channels")
        if channels and isinstance(channels, list) and "streams" in channels[0] and "probability" in channels[0]:
            catalog_cache.update(data)
            return True
    except Exception:
        pass
    return False


def save_disk_cache() -> None:
    """Saves the current catalog cache to disk."""
    try:
        DISK_CACHE_FILE.write_text(
            json.dumps(catalog_cache, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass


async def update_catalog_cache(include_global: bool = False) -> Dict[str, Any]:
    """Downloads and parses playlists, updating the in-memory and disk cache."""
    async with cache_lock:
        data = await fetch_and_parse_playlists(include_global=include_global)
        catalog_cache["channels"] = data["channels"]
        catalog_cache["categories"] = data["categories"]
        catalog_cache["countries"] = data["countries"]
        catalog_cache["regions"] = data["regions"]
        catalog_cache["total"] = data["total"]
        catalog_cache["last_updated"] = datetime.now(timezone.utc).isoformat()
        catalog_cache["include_global"] = include_global
        save_disk_cache()
        return catalog_cache


async def initial_and_periodic_refresh():
    """Refreshes cache immediately in the background and then every 6 hours."""
    try:
        await update_catalog_cache(include_global=catalog_cache.get("include_global", False))
        print(f"[Exe.tv] Sincronizados {catalog_cache['total']} canales en vivo (Prioridad TV Colombia).")
    except Exception as exc:
        print(f"[Exe.tv] Aviso en carga inicial: {exc}")

    while True:
        await asyncio.sleep(CACHE_TTL_SECONDS)
        try:
            await update_catalog_cache(include_global=catalog_cache.get("include_global", False))
        except Exception as exc:
            print(f"[Exe.tv] Error updating periodic cache: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if load_disk_cache():
        print(f"[Exe.tv] Cargados {catalog_cache['total']} canales instantáneamente desde caché en disco.")
    refresh_task = asyncio.create_task(initial_and_periodic_refresh())
    yield
    refresh_task.cancel()


app = FastAPI(
    title="Exe.tv IPTV API",
    description="Motor de sincronización, parseo, proxy HLS y caché en tiempo real para Exe.tv",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "total": catalog_cache["total"],
        "ready": len(catalog_cache["channels"]) > 0,
    }


def get_public_base_url(request: Request) -> str:
    """Resolves the external base URL of this backend (works on Render, Railway, HF Spaces, LAN, and localhost)."""
    forwarded_proto = request.headers.get("x-forwarded-proto")
    scheme = forwarded_proto.split(",")[0].strip() if forwarded_proto else request.url.scheme
    forwarded_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    host = forwarded_host.split(",")[0].strip() if forwarded_host else request.url.netloc
    return f"{scheme}://{host}"


def build_proxy_url(
    target_url: str,
    referer: Optional[str] = None,
    ua: Optional[str] = None,
    proxy_base_url: str = "http://127.0.0.1:8085",
) -> str:
    """Builds an absolute /api/proxy URL with encoded target URL and optional headers."""
    params: Dict[str, str] = {"url": target_url}
    if referer:
        params["referer"] = referer
    if ua:
        params["ua"] = ua
    base = proxy_base_url.rstrip("/")
    return f"{base}/api/proxy?{urllib.parse.urlencode(params)}"


def rewrite_m3u8_manifest(
    manifest_text: str,
    base_url: str,
    referer: Optional[str] = None,
    ua: Optional[str] = None,
    proxy_base_url: str = "http://127.0.0.1:8085",
) -> str:
    """
    Rewrites relative and absolute URLs inside an HLS .m3u8 manifest so that
    variant playlists, encryption keys, and .ts/.m4s media segments also pass through /api/proxy.
    """
    rewritten_lines = []

    def replace_uri_attr(match: re.Match) -> str:
        raw_uri = match.group(1)
        resolved = urllib.parse.urljoin(base_url, raw_uri)
        return f'URI="{build_proxy_url(resolved, referer=referer, ua=ua, proxy_base_url=proxy_base_url)}"'

    for raw_line in manifest_text.splitlines():
        line = raw_line.strip()
        if not line:
            rewritten_lines.append("")
            continue

        if line.startswith("#"):
            if 'URI="' in line:
                line = RE_M3U8_URI_ATTR.sub(replace_uri_attr, line)
            rewritten_lines.append(line)
        else:
            resolved_url = urllib.parse.urljoin(base_url, line)
            rewritten_lines.append(
                build_proxy_url(resolved_url, referer=referer, ua=ua, proxy_base_url=proxy_base_url)
            )

    return "\n".join(rewritten_lines)


def infer_upstream_headers(
    target_url: str,
    custom_referer: Optional[str] = None,
    custom_ua: Optional[str] = None,
) -> Dict[str, str]:
    """Constructs clean browser headers (Referer, Origin, User-Agent) for upstream IPTV servers."""
    parsed = urllib.parse.urlparse(target_url)
    origin_base = f"{parsed.scheme}://{parsed.netloc}"
    referer = custom_referer

    if not referer:
        url_low = target_url.lower()
        for keyword, ref_url in DOMAIN_REFERER_MAP.items():
            if keyword in url_low:
                referer = ref_url
                break
        if not referer:
            referer = f"{origin_base}/"

    ref_parsed = urllib.parse.urlparse(referer)
    origin = f"{ref_parsed.scheme}://{ref_parsed.netloc}" if ref_parsed.scheme else origin_base

    headers = {
        "User-Agent": custom_ua or DEFAULT_BROWSER_UA,
        "Accept": "*/*",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
        "Referer": referer,
        "Origin": origin,
        "Connection": "keep-alive",
    }
    return headers


@app.get("/api/proxy")
@app.get("/api/proxy-stream")
async def proxy_stream(
    request: Request,
    url: str = Query(..., description="URL codificada del stream .m3u8 o segmento .ts"),
    referer: Optional[str] = Query(None, description="Cabecera Referer personalizada"),
    ua: Optional[str] = Query(None, description="Cabecera User-Agent personalizada"),
):
    """
    Smart HLS Proxy to bypass CORS, Referer/Origin restrictions, and HTTP Mixed-Content blocks
    for Colombian TDT and international channels.
    """
    target_url = url.strip()
    if not target_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL inválida para el proxy.")

    headers = infer_upstream_headers(target_url, custom_referer=referer, custom_ua=ua)
    proxy_base_url = get_public_base_url(request)

    try:
        async with httpx.AsyncClient(
            headers=headers,
            follow_redirects=True,
            verify=False,
            timeout=15.0,
        ) as client:
            resp = await client.get(target_url)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error conectando al servidor de origen: {str(exc)}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Origen devolvió HTTP {resp.status_code}")

    final_url = str(resp.url)
    content_type = resp.headers.get("content-type", "").lower()
    is_m3u8 = (
        ".m3u8" in final_url.lower()
        or "mpegurl" in content_type
        or resp.content[:7].startswith(b"#EXTM3U")
    )

    cors_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    }

    if is_m3u8:
        text_body = resp.text
        rewritten = rewrite_m3u8_manifest(
            text_body,
            base_url=final_url,
            referer=referer,
            ua=ua,
            proxy_base_url=proxy_base_url,
        )
        return Response(
            content=rewritten,
            media_type="application/vnd.apple.mpegurl",
            headers=cors_headers,
        )

    media_type = resp.headers.get("content-type", "video/mp2t")
    return Response(
        content=resp.content,
        media_type=media_type,
        headers=cors_headers,
    )


@app.get("/api/channels")
async def get_channels(
    category: Optional[str] = Query(None, description="Filtrar por categoría (ej. 🇨🇴 TV Colombia, Deportes, Noticias)"),
    country: Optional[str] = Query(None, description="Filtrar por país (ej. Colombia, Argentina, México)"),
    region: Optional[str] = Query(None, description="Filtrar por región (ej. Sudamérica, Norteamérica, Europa)"),
    search: Optional[str] = Query(None, description="Buscar por nombre, país o categoría (ej. caracol, rcn, espn)"),
    include_global: bool = Query(False, description="Incluir catálogo mundial completo (+9,600 canales)"),
):
    if not catalog_cache["channels"] or (include_global != catalog_cache.get("include_global", False)):
        try:
            await update_catalog_cache(include_global=include_global)
        except Exception as exc:
            if not catalog_cache["channels"]:
                raise HTTPException(status_code=503, detail=f"No se pudo sincronizar la lista IPTV: {str(exc)}")

    channels = catalog_cache["channels"]

    if category and category.strip().lower() not in ("todos", "all", ""):
        cat_norm = category.strip().lower()
        if "colombia" in cat_norm:
            channels = [ch for ch in channels if ch.get("is_colombia") or ch.get("country_code") == "CO"]
        else:
            channels = [ch for ch in channels if ch["category"].lower() == cat_norm]

    if country and country.strip().lower() not in ("todos", "all", ""):
        country_norm = country.strip().lower()
        channels = [
            ch
            for ch in channels
            if ch["country"].lower() == country_norm or ch["country_code"].lower() == country_norm
        ]

    if region and region.strip().lower() not in ("todas", "todos", "all", ""):
        reg_norm = region.strip().lower()
        channels = [ch for ch in channels if ch["region"].lower() == reg_norm]

    if search and search.strip():
        q = search.strip().lower()
        channels = [
            ch
            for ch in channels
            if q in ch["name"].lower()
            or q in ch["category"].lower()
            or q in ch["country"].lower()
            or q in ch["region"].lower()
            or q in ch.get("tvg_id", "").lower()
        ]

    return {
        "channels": channels,
        "categories": catalog_cache["categories"],
        "countries": catalog_cache["countries"],
        "regions": catalog_cache["regions"],
        "total": catalog_cache["total"],
        "filtered_total": len(channels),
        "last_updated": catalog_cache["last_updated"],
        "include_global": catalog_cache["include_global"],
        "default_category": COLOMBIA_CATEGORY_LABEL,
    }


@app.post("/api/custom/channel")
async def add_custom_channel(payload: CustomChannelInput):
    name = payload.name.strip()
    stream_url = payload.stream_url.strip()
    if not name or not stream_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Nombre y URL válida (.m3u8) son obligatorios.")

    iso = payload.country_code.upper() if payload.country_code.upper() in COUNTRY_INFO else "CO"
    country_name, region_name, flag = COUNTRY_INFO[iso]
    placeholder = build_placeholder_logo(name)
    logo = payload.logo.strip() if payload.logo and payload.logo.strip().startswith("https://") else placeholder

    custom_list = load_custom_channels()
    new_ch = {
        "id": f"custom_{len(custom_list) + 1}_{int(datetime.now().timestamp())}",
        "number": 1,
        "tvg_id": f"custom.{iso.lower()}",
        "name": name,
        "logo": logo,
        "fallback_logo": placeholder,
        "initials": get_initials(name),
        "category": payload.category or "Entretenimiento",
        "thematic_category": payload.category or "Entretenimiento",
        "is_colombia": iso == "CO",
        "country_code": iso,
        "country": country_name,
        "flag": flag,
        "region": region_name,
        "original_group": "Custom",
        "quality": payload.quality or "HD",
        "stream_url": stream_url,
        "backup_streams": [],
        "headers": {},
        "use_proxy": stream_url.startswith("http://"),
        "embed_url": payload.embed_url,
        "is_custom": True,
    }
    custom_list.insert(0, new_ch)
    save_custom_channels(custom_list)
    await update_catalog_cache(include_global=catalog_cache.get("include_global", False))
    return {"status": "ok", "channel": new_ch, "total": catalog_cache["total"]}


@app.post("/api/custom/playlist")
async def import_custom_playlist(payload: CustomPlaylistInput):
    url = payload.playlist_url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Ingresa una URL válida de lista .m3u o .m3u8")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            parsed = parse_m3u_content(
                resp.text,
                forced_group=payload.default_category,
                forced_country_code=payload.default_country_code,
                allow_http_via_proxy=True,
            )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"No se pudo descargar o parsear la lista M3U: {str(exc)}")

    if not parsed:
        raise HTTPException(status_code=400, detail="No se encontraron canales .m3u8 válidos en esa lista.")

    custom_list = load_custom_channels()
    existing_urls = {c["stream_url"] for c in custom_list}
    added_count = 0
    for ch in parsed:
        if ch["stream_url"] not in existing_urls:
            existing_urls.add(ch["stream_url"])
            ch["is_custom"] = True
            custom_list.append(ch)
            added_count += 1

    save_custom_channels(custom_list)
    await update_catalog_cache(include_global=catalog_cache.get("include_global", False))
    return {
        "status": "ok",
        "added": added_count,
        "total": catalog_cache["total"],
    }


@app.get("/api/refresh")
async def refresh_channels(
    include_global: bool = Query(False, description="Incluir índice global al refrescar"),
):
    try:
        await update_catalog_cache(include_global=include_global)
        return {
            "status": "ok",
            "message": "Caché actualizada exitosamente desde iptv-org",
            "total": catalog_cache["total"],
            "categories": catalog_cache["categories"],
            "countries": catalog_cache["countries"],
            "regions": catalog_cache["regions"],
            "last_updated": catalog_cache["last_updated"],
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error al refrescar el repositorio IPTV: {str(exc)}")


async def probe_single_stream(item: SignalProbeItem) -> Dict[str, Any]:
    """Tests a single .m3u8 stream URL to verify live availability, latency, and working probability."""
    target_url = item.url.strip()
    custom_ref = item.headers.get("Referer") if item.headers else None
    custom_ua = item.headers.get("User-Agent") if item.headers else None
    headers = infer_upstream_headers(target_url, custom_referer=custom_ref, custom_ua=custom_ua)
    base_prob = estimate_stream_probability(target_url, item.label or "", False)

    start_time = time.perf_counter()
    try:
        async with httpx.AsyncClient(
            headers=headers,
            follow_redirects=True,
            verify=False,
            timeout=4.5,
        ) as client:
            resp = await client.get(target_url)
            latency_ms = int((time.perf_counter() - start_time) * 1000)

            content_type = resp.headers.get("content-type", "").lower()
            sample_text = resp.text[:600] if resp.status_code < 400 else ""
            is_valid_hls = (
                "#EXTM3U" in sample_text
                or "#EXT-X-" in sample_text
                or "mpegurl" in content_type
                or "octet-stream" in content_type
            )

            if resp.status_code == 200 and is_valid_hls:
                if latency_ms < 850:
                    live_prob = min(99, max(base_prob, 95))
                    status = "online"
                    status_text = "En línea (Óptima)"
                elif latency_ms < 2000:
                    live_prob = min(94, max(base_prob, 86))
                    status = "online"
                    status_text = "En línea (Estable)"
                else:
                    live_prob = 76
                    status = "slow"
                    status_text = "Señal lenta"

                return {
                    "url": target_url,
                    "status": status,
                    "status_text": status_text,
                    "http_code": resp.status_code,
                    "latency_ms": latency_ms,
                    "probability": live_prob,
                    "probability_label": get_probability_label(live_prob),
                }

            if resp.status_code in (401, 403):
                return {
                    "url": target_url,
                    "status": "restricted",
                    "status_text": "Geo-restringida / Token",
                    "http_code": resp.status_code,
                    "latency_ms": latency_ms,
                    "probability": 30,
                    "probability_label": "Baja",
                }

            return {
                "url": target_url,
                "status": "offline",
                "status_text": f"Sin señal (HTTP {resp.status_code})",
                "http_code": resp.status_code,
                "latency_ms": latency_ms,
                "probability": 12,
                "probability_label": "Baja",
            }
    except httpx.TimeoutException:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "url": target_url,
            "status": "offline",
            "status_text": "Tiempo agotado",
            "http_code": 0,
            "latency_ms": latency_ms,
            "probability": 15,
            "probability_label": "Baja",
        }
    except Exception:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        return {
            "url": target_url,
            "status": "offline",
            "status_text": "Fuera del aire",
            "http_code": 0,
            "latency_ms": latency_ms,
            "probability": 10,
            "probability_label": "Baja",
        }


@app.post("/api/probe")
async def probe_channel_streams(payload: SignalProbeRequest):
    """Concurrently probes up to 12 signals of a channel to preview live status and working probability."""
    items = payload.streams[:12]
    if not items:
        return {"results": [], "best_url": None, "overall_probability": 0}

    results = await asyncio.gather(*(probe_single_stream(item) for item in items))
    online_Signals = [r for r in results if r["status"] in ("online", "slow")]
    best_signal = max(results, key=lambda r: (r["status"] == "online", r["probability"], -r["latency_ms"]))
    overall_prob = best_signal["probability"] if online_Signals else max(r["probability"] for r in results)

    return {
        "results": results,
        "online_count": len(online_Signals),
        "total_probed": len(results),
        "best_url": best_signal["url"] if online_Signals else None,
        "overall_probability": overall_prob,
    }


# Static Frontend Hosting (Serves React App at root '/' in production)
STATIC_DIR = Path(__file__).resolve().parent / "static"
FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
WEB_ROOT = STATIC_DIR if STATIC_DIR.exists() else (FRONTEND_DIST_DIR if FRONTEND_DIST_DIR.exists() else None)

if WEB_ROOT and WEB_ROOT.exists():
    assets_path = WEB_ROOT / "assets"
    if assets_path.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        target_file = WEB_ROOT / full_path
        if full_path and target_file.is_file():
            return FileResponse(target_file)
        index_file = WEB_ROOT / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend build index.html not found")


