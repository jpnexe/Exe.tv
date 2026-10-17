import asyncio
import json
import re
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx

COLOMBIA_OFFICIAL_M3U_URL = "https://iptv-org.github.io/iptv/countries/co.m3u"
COLOMBIA_RAW_STREAMS_M3U_URL = "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/co.m3u"
PRIMARY_M3U_URL = "https://iptv-org.github.io/iptv/languages/spa.m3u"
FREETV_M3U_URL = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
GLOBAL_INDEX_M3U_URL = "https://iptv-org.github.io/iptv/index.m3u"

IBERO_COUNTRY_URLS = {
    "AR": "https://iptv-org.github.io/iptv/countries/ar.m3u",
    "MX": "https://iptv-org.github.io/iptv/countries/mx.m3u",
    "ES": "https://iptv-org.github.io/iptv/countries/es.m3u",
    "CL": "https://iptv-org.github.io/iptv/countries/cl.m3u",
    "PE": "https://iptv-org.github.io/iptv/countries/pe.m3u",
    "VE": "https://iptv-org.github.io/iptv/countries/ve.m3u",
    "EC": "https://iptv-org.github.io/iptv/countries/ec.m3u",
    "DO": "https://iptv-org.github.io/iptv/countries/do.m3u",
    "UY": "https://iptv-org.github.io/iptv/countries/uy.m3u",
    "PY": "https://iptv-org.github.io/iptv/countries/py.m3u",
    "BO": "https://iptv-org.github.io/iptv/countries/bo.m3u",
    "CR": "https://iptv-org.github.io/iptv/countries/cr.m3u",
    "PA": "https://iptv-org.github.io/iptv/countries/pa.m3u",
    "PR": "https://iptv-org.github.io/iptv/countries/pr.m3u",
    "GT": "https://iptv-org.github.io/iptv/countries/gt.m3u",
    "HN": "https://iptv-org.github.io/iptv/countries/hn.m3u",
    "SV": "https://iptv-org.github.io/iptv/countries/sv.m3u",
    "NI": "https://iptv-org.github.io/iptv/countries/ni.m3u",
    "CU": "https://iptv-org.github.io/iptv/countries/cu.m3u",
    "BR": "https://iptv-org.github.io/iptv/countries/br.m3u",
}

CUSTOM_CHANNELS_FILE = Path(__file__).resolve().parent / "custom_channels.json"
CUSTOM_COLOMBIA_FILE = Path(__file__).resolve().parent / "custom_colombia.json"

COLOMBIA_CATEGORY_LABEL = "🇨🇴 TV Colombia"

RE_TVG_ID = re.compile(r'tvg-id="([^"]*)"', re.IGNORECASE)
RE_TVG_LOGO = re.compile(r'tvg-logo="([^"]*)"', re.IGNORECASE)
RE_GROUP_TITLE = re.compile(r'group-title="([^"]*)"', re.IGNORECASE)
RE_COUNTRY_FROM_TVG = re.compile(r"\.([a-z]{2})(?:@|$)", re.IGNORECASE)
RE_IPV4_HOST = re.compile(r"^https?://\d{1,3}(?:\.\d{1,3}){3}")

HIGH_RELIABILITY_DOMAINS = (
    "rtvc.gov.co",
    "cdnmedia.tv",
    "wurl.tv",
    "bitred.cl",
    "boldmss.com",
    "onnethn.com",
    "akamaized.net",
    "cloudfront.net",
    "fastly.net",
    "pluto.tv",
    "uplynk.com",
    "brightcove",
    "streamlock.net",
    "gestec-video.com",
    "desdeparaguay.net",
)

CATEGORY_TRANSLATIONS = {
    "sports": "Deportes",
    "sport": "Deportes",
    "auto": "Deportes",
    "outdoor": "Deportes",
    "news": "Noticias",
    "weather": "Noticias",
    "business": "Noticias",
    "legislative": "Noticias",
    "movies": "Películas",
    "cinema": "Películas",
    "series": "Series",
    "music": "Música",
    "kids": "Infantil",
    "animation": "Infantil",
    "family": "Infantil",
    "documentary": "Documentales",
    "science": "Documentales",
    "history": "Documentales",
    "education": "Cultura",
    "culture": "Cultura",
    "classic": "Cultura",
    "religious": "Religión",
    "lifestyle": "Estilo de Vida",
    "cooking": "Estilo de Vida",
    "travel": "Estilo de Vida",
    "shop": "Estilo de Vida",
    "entertainment": "Entretenimiento",
    "comedy": "Entretenimiento",
    "general": "Entretenimiento",
}

CATEGORY_ORDER = [
    COLOMBIA_CATEGORY_LABEL,
    "Deportes",
    "Noticias",
    "Películas",
    "Series",
    "Música",
    "Infantil",
    "Entretenimiento",
    "Documentales",
    "Cultura",
    "Estilo de Vida",
    "Religión",
    "Variedades",
]

COUNTRY_INFO: Dict[str, tuple[str, str, str]] = {
    "CO": ("Colombia", "Sudamérica", "🇨🇴"),
    "AR": ("Argentina", "Sudamérica", "🇦🇷"),
    "BO": ("Bolivia", "Sudamérica", "🇧🇴"),
    "BR": ("Brasil", "Sudamérica", "🇧🇷"),
    "CL": ("Chile", "Sudamérica", "🇨🇱"),
    "EC": ("Ecuador", "Sudamérica", "🇪🇨"),
    "PY": ("Paraguay", "Sudamérica", "🇵🇾"),
    "PE": ("Perú", "Sudamérica", "🇵🇪"),
    "UY": ("Uruguay", "Sudamérica", "🇺🇾"),
    "VE": ("Venezuela", "Sudamérica", "🇻🇪"),
    "MX": ("México", "Norteamérica", "🇲🇽"),
    "US": ("Estados Unidos", "Norteamérica", "🇺🇸"),
    "CA": ("Canadá", "Norteamérica", "🇨🇦"),
    "CR": ("Costa Rica", "Centroamérica y Caribe", "🇨🇷"),
    "CU": ("Cuba", "Centroamérica y Caribe", "🇨🇺"),
    "DO": ("Rep. Dominicana", "Centroamérica y Caribe", "🇩🇴"),
    "SV": ("El Salvador", "Centroamérica y Caribe", "🇸🇻"),
    "GT": ("Guatemala", "Centroamérica y Caribe", "🇬🇹"),
    "HN": ("Honduras", "Centroamérica y Caribe", "🇭🇳"),
    "NI": ("Nicaragua", "Centroamérica y Caribe", "🇳🇮"),
    "PA": ("Panamá", "Centroamérica y Caribe", "🇵🇦"),
    "PR": ("Puerto Rico", "Centroamérica y Caribe", "🇵🇷"),
    "ES": ("España", "Europa", "🇪🇸"),
    "AD": ("Andorra", "Europa", "🇦🇩"),
    "PT": ("Portugal", "Europa", "🇵🇹"),
    "FR": ("Francia", "Europa", "🇫🇷"),
    "DE": ("Alemania", "Europa", "🇩🇪"),
    "IT": ("Italia", "Europa", "🇮🇹"),
    "GB": ("Reino Unido", "Europa", "🇬🇧"),
    "UK": ("Reino Unido", "Europa", "🇬🇧"),
    "NL": ("Países Bajos", "Europa", "🇳🇱"),
    "CH": ("Suiza", "Europa", "🇨🇭"),
    "BE": ("Bélgica", "Europa", "🇧🇪"),
    "AT": ("Austria", "Europa", "🇦🇹"),
    "SE": ("Suecia", "Europa", "🇸🇪"),
    "NO": ("Noruega", "Europa", "🇳🇴"),
    "DK": ("Dinamarca", "Europa", "🇩🇰"),
    "FI": ("Finlandia", "Europa", "🇫🇮"),
    "PL": ("Polonia", "Europa", "🇵🇱"),
    "RO": ("Rumania", "Europa", "🇷🇴"),
    "GR": ("Grecia", "Europa", "🇬🇷"),
    "TR": ("Turquía", "Europa", "🇹🇷"),
    "RU": ("Rusia", "Europa", "🇷🇺"),
    "JP": ("Japón", "Internacional", "🇯🇵"),
    "KR": ("Corea del Sur", "Internacional", "🇰🇷"),
    "CN": ("China", "Internacional", "🇨🇳"),
    "IN": ("India", "Internacional", "🇮🇳"),
    "AU": ("Australia", "Internacional", "🇦🇺"),
    "GQ": ("Guinea Ecuatorial", "Internacional", "🇬🇶"),
    "INT": ("Internacional", "Internacional", "🌐"),
}

GROUP_COUNTRY_MAP = {
    "argentina": "AR",
    "bolivia": "BO",
    "brazil": "BR",
    "chile": "CL",
    "colombia": "CO",
    "costa rica": "CR",
    "cuba": "CU",
    "dominican republic": "DO",
    "ecuador": "EC",
    "el salvador": "SV",
    "guatemala": "GT",
    "honduras": "HN",
    "mexico": "MX",
    "nicaragua": "NI",
    "panama": "PA",
    "paraguay": "PY",
    "peru": "PE",
    "puerto rico": "PR",
    "spain": "ES",
    "uruguay": "UY",
    "venezuela": "VE",
    "usa": "US",
    "united states": "US",
    "canada": "CA",
    "uk": "GB",
    "united kingdom": "GB",
    "france": "FR",
    "germany": "DE",
    "italy": "IT",
    "portugal": "PT",
    "andorra": "AD",
}

REGION_ORDER = [
    "Sudamérica",
    "Norteamérica",
    "Centroamérica y Caribe",
    "Europa",
    "Internacional",
]


def get_initials(name: str) -> str:
    """Extracts 1 to 3 uppercase initials from the channel name."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", name).strip()
    words = [w for w in cleaned.split() if w]
    if not words:
        return "TV"
    if len(words) == 1:
        return words[0][:3].upper()
    return "".join(w[0] for w in words[:3]).upper()


def build_placeholder_logo(name: str) -> str:
    """Generates an inline SVG data URI placeholder with channel initials and modern gradient."""
    initials = get_initials(name)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">'
        f'<defs>'
        f'<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
        f'<stop offset="0%" stop-color="#7c3aed"/>'
        f'<stop offset="100%" stop-color="#06b6d4"/>'
        f'</linearGradient>'
        f'</defs>'
        f'<rect width="160" height="160" rx="36" fill="url(#g)"/>'
        f'<text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" '
        f'fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" '
        f'font-weight="800" font-size="52" letter-spacing="2">{initials}</text>'
        f'</svg>'
    )
    return f"data:image/svg+xml;utf8,{urllib.parse.quote(svg)}"


def estimate_stream_probability(
    stream_url: str,
    raw_name: str = "",
    is_vip: bool = False,
) -> int:
    """
    Calculates an estimated reliability / probability score (40% to 98%)
    based on protocol (HTTPS vs HTTP), CDN reputation, IP host vs domain, and tags.
    """
    url_low = stream_url.lower()
    raw_low = raw_name.lower()

    if is_vip:
        base = 94
    elif any(cdn in url_low for cdn in HIGH_RELIABILITY_DOMAINS):
        base = 93
    elif url_low.startswith("https://") and not RE_IPV4_HOST.search(url_low):
        base = 86
    elif url_low.startswith("https://"):
        base = 76
    elif url_low.startswith("http://") and ":55000/" in url_low:
        base = 82
    elif url_low.startswith("http://"):
        base = 64
    else:
        base = 55

    if "geo-blocked" in raw_low:
        base -= 12
    if "not 24/7" in raw_low:
        base -= 6

    return max(35, min(98, base))


def get_probability_label(prob: int) -> str:
    if prob >= 85:
        return "Alta"
    if prob >= 65:
        return "Media"
    return "Baja"


def extract_country_and_region(
    tvg_id: str,
    channel_name: str,
    stream_url: str,
    forced_country_code: Optional[str] = None,
    raw_group: str = "",
) -> tuple[str, str, str, str]:
    if forced_country_code and forced_country_code.upper() in COUNTRY_INFO:
        iso = forced_country_code.upper()
        c_name, region, flag = COUNTRY_INFO[iso]
        return iso, c_name, region, flag

    if tvg_id:
        match = RE_COUNTRY_FROM_TVG.search(tvg_id)
        if match:
            code = match.group(1).upper()
            if code in COUNTRY_INFO:
                c_name, region, flag = COUNTRY_INFO[code]
                return code, c_name, region, flag

    if raw_group:
        grp_low = raw_group.strip().lower()
        if grp_low in GROUP_COUNTRY_MAP:
            iso = GROUP_COUNTRY_MAP[grp_low]
            c_name, region, flag = COUNTRY_INFO[iso]
            return iso, c_name, region, flag

    text = f"{channel_name} {stream_url}".lower()
    heuristics = [
        (["colombia", ".co/", "caracol", "rcn", "bogota", "medellin", "antioquia", "cali", "telecaribe", "telepacifico", "citytv", "senal colombia", "señal colombia"], "CO"),
        (["argentina", ".com.ar", ".ar/", "buenos aires", "cordoba", "mendoza", "rosario", "salta", "tucuman"], "AR"),
        (["mexico", "méxico", ".mx", "azteca", "televisa", "jalisco", "monterrey", "chiapas", "oaxaca"], "MX"),
        (["españa", "espana", "rtve", "antena 3", "telecinco", "andalucia", "catalunya", "galicia", "madrid", ".es/"], "ES"),
        (["chile", ".cl/", "santiago", "valparaiso", "biobio"], "CL"),
        (["peru", "perú", ".pe/", "lima", "arequipa", "panamericana"], "PE"),
        (["venezuela", ".ve/", "caracas", "globovision", "venevision"], "VE"),
        (["ecuador", ".ec/", "quito", "guayaquil"], "EC"),
        (["dominicana", ".do/", "santo domingo", "telemicro"], "DO"),
        (["paraguay", ".py/", "asuncion"], "PY"),
        (["uruguay", ".uy/", "montevideo"], "UY"),
        (["bolivia", ".bo/", "la paz", "santa cruz"], "BO"),
        (["costa rica", ".cr/", "teletica", "repretel"], "CR"),
        (["panama", "panamá", ".pa/"], "PA"),
        (["puerto rico", ".pr/"], "PR"),
        (["guatemala", ".gt/"], "GT"),
        (["honduras", ".hn/", "tegucigalpa"], "HN"),
        (["salvador", ".sv/"], "SV"),
        (["nicaragua", ".ni/"], "NI"),
        (["cuba", ".cu/", "habana"], "CU"),
        (["brasil", "brazil", ".br/", "globo", "sbt", "recordtv", "band"], "BR"),
        (["miami", "telemundo", "univision", "estados unidos"], "US"),
    ]
    for keywords, iso in heuristics:
        if any(k in text for k in keywords):
            c_name, region, flag = COUNTRY_INFO[iso]
            return iso, c_name, region, flag

    c_name, region, flag = COUNTRY_INFO["INT"]
    return "INT", c_name, region, flag


def translate_category(raw_group: str, channel_name: str = "") -> str:
    name_lower = channel_name.lower()

    if any(k in name_lower for k in ["sport", "deporte", "futbol", "fútbol", "espn", "fox sports", "tyc", "gol ", "win ", "tudn", "afizzionados", "bein", "motor", "nba", "ufc", "dazn", "directv sports", "ovacion", "campeon", "estadio", "liga", "racing", "boca", "river", "real madrid", "barça", "betis", "sevilla fc", "tdn", "teledeporte"]):
        return "Deportes"
    if any(k in name_lower for k in ["noticias", "news", "24h", "24 horas", "ntn24", "telesur", "cnn", "dw ", "rt ", "france 24", "euronews", "adn 40", "milenio", "c5n", "tn ", "ln+", "crónica", "cronica", "foro tv", "canal n", "informativo", "bloomberg", "cnbc", "sky news", "al jazeera", "bbc news", "cablenoticias", "citytv"]):
        return "Noticias"
    if any(k in name_lower for k in ["cine", "movie", "film", "película", "pelicula", "golden", "de película", "tcm", "amc", "paramount", "warner", "fx", "space", "cinemax", "star channel", "cinecanal", "multipremier", "cinelatino", "dhe", "europa europa", "somos", "rakuten", "pluto tv cine", "runtime"]):
        return "Películas"
    if any(k in name_lower for k in ["series", "novela", "tlnovelas", "pasiones", "distrito comedia", "comedy central", "sony", "axn", "universal", "syfy", "atreseries"]):
        return "Series"
    if any(k in name_lower for k in ["music", "música", "musica", "mtv", "vh1", "telehit", "htv", "bandamax", "quiero música", "ritmoson", "radiola", "melodía", "tropical", "urbano", "salsa", "cumbia", "vallenato", "reggaeton", "rock", "pop", "k-pop", "concierto", "radio", "vevo", "trace", "stingray"]):
        return "Música"
    if any(k in name_lower for k in ["kids", "infantil", "cartoon", "nick", "disney", "discovery kids", "boing", "clan", "pakapaka", "baby", "junior", "toon", "anime", "animax", "bitme", "peque", "niños", "pocoyo", "plim plim"]):
        return "Infantil"
    if any(k in name_lower for k in ["docu", "history", "nat geo", "national geographic", "discovery", "animal planet", "odisea", "ciencia", "historia", "natura", "curiosity", "love nature", "smithsonian"]):
        return "Documentales"

    if raw_group:
        parts = re.split(r"[;,/]", raw_group.lower())
        for part in parts:
            part_clean = part.strip()
            if part_clean in CATEGORY_TRANSLATIONS and part_clean != "general":
                return CATEGORY_TRANSLATIONS[part_clean]
            for key, val in CATEGORY_TRANSLATIONS.items():
                if key != "general" and key in part_clean:
                    return val

        for part in parts:
            part_clean = part.strip()
            if part_clean in ("general", "entertainment") or part_clean in GROUP_COUNTRY_MAP:
                return "Entretenimiento"

    if any(k in name_lower for k in ["cultura", "encuentro", "unam", "educa", "arte", "universidad", "tv publica", "tv pública", "congreso", "senado", "diputados", "justicia", "señal colombia", "senal colombia", "canal capital", "canal institucional"]):
        return "Cultura"
    if any(k in name_lower for k in ["relig", "católic", "catolic", "cristian", " dios", "fe ", "ewtn", "enlace", "bethel", "nuevo tiempo", "3abn", "iglesia", "biblia", "evangelio", "esperanza", "cristovision", "cristovisión"]):
        return "Religión"
    if any(k in name_lower for k in ["cocina", "gourmet", "viaje", "travel", "hogar", "hola tv", "mas chic", "más chic", "glitz", "moda", "fashion"]):
        return "Estilo de Vida"

    if raw_group and raw_group.strip().lower() not in ("undefined", ""):
        return "Entretenimiento"

    return "Variedades"


def clean_channel_name(raw_name: str) -> str:
    """Cleans resolution tags like (1080p) or [Geo-blocked] while preserving the core channel title."""
    name = re.sub(r"\[[^\]]*\]", "", raw_name)
    name = re.sub(r"\(\d{3,4}p\)", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name).strip()
    return name or raw_name.strip()


def canonical_channel_key(name: str, tvg_id: str, country_code: str) -> str:
    """
    Produces a canonical grouping key so multiple streams of the same channel
    (e.g. 'Caracol TV', 'Caracol TV HD', 'CaracolTV.co@SD', 'CaracolTV.co@HD')
    are consolidated into one unified channel with multiple backup signals.
    """
    base_tvg = tvg_id.split("@")[0].strip().lower() if tvg_id else ""
    if base_tvg and not base_tvg.startswith("ch-") and not base_tvg.startswith("custom."):
        # Normalize known aliases in Colombia
        if base_tvg in ("citytvbogota.co", "citytv.co"):
            return "co::citytv.co"
        if base_tvg in ("caracoltv.co", "caracolhd2.co"):
            return "co::caracoltv.co"
        if base_tvg in ("canalrcn.co", "rcn.co"):
            return "co::canalrcn.co"
        return f"{country_code.lower()}::{base_tvg}"

    # Fallback by normalized name (stripping trailing "hd", "sd", "tv" noise)
    norm_name = (
        name.lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )
    norm_name = re.sub(r"\b(hd|sd|fhd|4k|en vivo)\b", "", norm_name)
    norm_name = re.sub(r"[^a-z0-9]", "", norm_name)
    return f"{country_code.lower()}::name::{norm_name or name.lower()}"


def extract_resolution(raw_name: str) -> Optional[str]:
    match = re.search(r"\((\d{3,4}p)\)", raw_name, re.IGNORECASE)
    if match:
        return match.group(1).lower()
    return None


def compute_colombia_priority(name: str, tvg_id: str) -> int:
    key = f"{name} {tvg_id}".lower()
    if "caracol tv" in key or "caracoltv.co" in key:
        return 1
    if "canal rcn" in key or "rcn.co" in key:
        return 2
    if "canal 1" in key or "canal1.co" in key:
        return 3
    if "señal colombia" in key or "senal colombia" in key or "senalcolombia.co" in key:
        return 4
    if "citytv" in key:
        return 5
    if "telecaribe" in key:
        return 6
    if "teleantioquia" in key:
        return 7
    if "canal capital" in key or "canalcapital.co" in key:
        return 8
    if "ntn24" in key:
        return 9
    if "win sports" in key or "winsports" in key:
        return 10
    if "telepacifico" in key or "telepacífico" in key:
        return 11
    if "rcn" in key or "caracol" in key:
        return 12
    return 50


def parse_m3u_content(
    content: str,
    forced_group: Optional[str] = None,
    forced_country_code: Optional[str] = None,
    allow_http_via_proxy: bool = False,
    limit: Optional[int] = None,
    seen_urls: Optional[set] = None,
    start_index: int = 0,
) -> List[Dict[str, Any]]:
    lines = content.splitlines()
    channels: List[Dict[str, Any]] = []
    if seen_urls is None:
        seen_urls = set()

    current_info: Optional[Dict[str, Any]] = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("#EXTINF:"):
            tvg_id_match = RE_TVG_ID.search(line)
            tvg_logo_match = RE_TVG_LOGO.search(line)
            group_title_match = RE_GROUP_TITLE.search(line)

            tvg_id = tvg_id_match.group(1).strip() if tvg_id_match else ""
            tvg_logo = tvg_logo_match.group(1).strip() if tvg_logo_match else ""
            group_title = (
                group_title_match.group(1).strip()
                if group_title_match and group_title_match.group(1).strip()
                else (forced_group or "")
            )

            comma_idx = line.rfind(",")
            raw_name = line[comma_idx + 1 :].strip() if comma_idx != -1 else "Canal En Vivo"

            clean_name = clean_channel_name(raw_name)
            quality = extract_resolution(raw_name)
            thematic_category = translate_category(group_title, clean_name)
            placeholder_logo = build_placeholder_logo(clean_name)

            current_info = {
                "tvg_id": tvg_id or f"ch-{start_index + len(channels) + 1}",
                "name": clean_name,
                "raw_name": raw_name,
                "logo": tvg_logo if tvg_logo.startswith("https://") else placeholder_logo,
                "fallback_logo": placeholder_logo,
                "initials": get_initials(clean_name),
                "category": thematic_category,
                "original_group": group_title or "General",
                "quality": quality or "HD",
                "headers": {},
            }

        elif line.startswith("#EXTVLCOPT:") and current_info is not None:
            opt = line[len("#EXTVLCOPT:") :].strip()
            if opt.lower().startswith("http-user-agent="):
                current_info["headers"]["User-Agent"] = opt.split("=", 1)[1].strip()
            elif opt.lower().startswith(("http-referrer=", "http-referer=")):
                current_info["headers"]["Referer"] = opt.split("=", 1)[1].strip()

        elif not line.startswith("#") and current_info is not None:
            is_https_m3u8 = line.startswith("https://") and ".m3u8" in line.lower()
            is_http_m3u8 = allow_http_via_proxy and line.startswith("http://") and ".m3u8" in line.lower()

            if is_https_m3u8 or is_http_m3u8:
                if line not in seen_urls:
                    seen_urls.add(line)
                    idx = start_index + len(channels) + 1
                    country_code, country_name, region_name, flag = extract_country_and_region(
                        current_info["tvg_id"],
                        current_info["name"],
                        line,
                        forced_country_code=forced_country_code,
                        raw_group=current_info["original_group"],
                    )
                    is_colombia = (
                        country_code == "CO"
                        or ".co" in current_info["tvg_id"].lower()
                        or forced_country_code == "CO"
                    )
                    if is_colombia:
                        country_code, country_name, region_name, flag = (
                            "CO",
                            "Colombia",
                            "Sudamérica",
                            "🇨🇴",
                        )

                    needs_proxy = bool(is_http_m3u8 or current_info["headers"])
                    prob = estimate_stream_probability(line, current_info["raw_name"], is_vip=False)
                    channel_id = f"{current_info['tvg_id']}_{idx}"
                    channels.append(
                        {
                            "id": channel_id,
                            "number": idx,
                            "tvg_id": current_info["tvg_id"],
                            "name": current_info["name"],
                            "logo": current_info["logo"],
                            "fallback_logo": current_info["fallback_logo"],
                            "initials": current_info["initials"],
                            "category": current_info["category"],
                            "thematic_category": current_info["category"],
                            "is_colombia": is_colombia,
                            "colombia_priority": compute_colombia_priority(
                                current_info["name"], current_info["tvg_id"]
                            )
                            if is_colombia
                            else 999,
                            "country_code": country_code,
                            "country": country_name,
                            "flag": flag,
                            "region": region_name,
                            "original_group": current_info["original_group"],
                            "quality": current_info["quality"],
                            "stream_url": line,
                            "backup_streams": [],
                            "headers": current_info["headers"],
                            "use_proxy": needs_proxy,
                            "embed_url": None,
                            "probability": prob,
                            "probability_label": get_probability_label(prob),
                        }
                    )
                    if limit and len(channels) >= limit:
                        break
            current_info = None

    return channels


def consolidate_duplicate_channels(raw_channels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Consolidates multiple entries of the same channel (e.g., 12 'Caracol TV' streams)
    into a single unified channel entry containing a sorted 'streams' list with
    individual signal probabilities and an overall working probability score.
    """
    grouped: Dict[str, Dict[str, Any]] = {}
    ordered_keys: List[str] = []

    for ch in raw_channels:
        key = canonical_channel_key(ch["name"], ch.get("tvg_id", ""), ch.get("country_code", "INT"))

        # Build stream descriptor(s) for this entry
        entry_streams = []
        primary_url = ch.get("stream_url", "")
        if primary_url:
            prob = ch.get("probability") or estimate_stream_probability(
                primary_url, ch["name"], is_vip=bool(ch.get("is_vip_colombia"))
            )
            entry_streams.append(
                {
                    "url": primary_url,
                    "quality": ch.get("quality", "HD"),
                    "use_proxy": bool(ch.get("use_proxy") or primary_url.startswith("http://")),
                    "headers": ch.get("headers") or {},
                    "probability": prob,
                    "protocol": "HTTPS" if primary_url.startswith("https://") else "Proxy TDT",
                }
            )

        for b_url in ch.get("backup_streams") or []:
            if b_url:
                b_prob = estimate_stream_probability(b_url, ch["name"], is_vip=False)
                entry_streams.append(
                    {
                        "url": b_url,
                        "quality": ch.get("quality", "HD"),
                        "use_proxy": bool(b_url.startswith("http://") or ch.get("headers")),
                        "headers": ch.get("headers") or {},
                        "probability": b_prob,
                        "protocol": "HTTPS" if b_url.startswith("https://") else "Proxy TDT",
                    }
                )

        if key not in grouped:
            ordered_keys.append(key)
            ch_copy = dict(ch)
            ch_copy["_stream_map"] = {s["url"]: s for s in entry_streams}
            grouped[key] = ch_copy
        else:
            existing = grouped[key]
            # Upgrade logo if existing has a data:image placeholder and new one has an https:// logo
            if existing["logo"].startswith("data:image") and ch["logo"].startswith("https://"):
                existing["logo"] = ch["logo"]
            # Preserve embed_url if available
            if not existing.get("embed_url") and ch.get("embed_url"):
                existing["embed_url"] = ch["embed_url"]
            # Merge headers if existing had none
            if not existing.get("headers") and ch.get("headers"):
                existing["headers"] = ch["headers"]
            # Add all unique stream URLs into existing channel's _stream_map
            for s in entry_streams:
                if s["url"] not in existing["_stream_map"]:
                    existing["_stream_map"][s["url"]] = s

    consolidated: List[Dict[str, Any]] = []
    for key in ordered_keys:
        item = grouped[key]
        stream_list = list(item.pop("_stream_map").values())

        # Sort streams so highest probability (and HTTPS) comes first, while keeping VIP primary stream #1
        if not item.get("is_vip_colombia"):
            stream_list.sort(key=lambda s: (-s["probability"], 0 if s["protocol"] == "HTTPS" else 1))

        # Assign human-friendly labels to each signal
        for idx, s in enumerate(stream_list, start=1):
            s["id"] = f"sig-{idx}"
            s["label"] = f"Señal {idx} ({s['protocol']} • {s['quality'].upper()})"

        if stream_list:
            best_stream = stream_list[0]
            item["stream_url"] = best_stream["url"]
            item["use_proxy"] = best_stream["use_proxy"]
            item["headers"] = best_stream["headers"] or item.get("headers", {})
            item["backup_streams"] = [s["url"] for s in stream_list[1:]]
            # Overall probability increases when backup mirrors or official web signal exist
            max_prob = max(s["probability"] for s in stream_list)
            redundancy_bonus = min(6, (len(stream_list) - 1) * 2) + (2 if item.get("embed_url") else 0)
            overall_prob = min(99, max_prob + redundancy_bonus)
        else:
            overall_prob = 50

        item["streams"] = stream_list
        item["signals_count"] = len(stream_list)
        item["probability"] = overall_prob
        item["probability_label"] = get_probability_label(overall_prob)
        consolidated.append(item)

    return consolidated


def load_custom_colombia_channels() -> List[Dict[str, Any]]:
    if not CUSTOM_COLOMBIA_FILE.exists():
        return []
    try:
        raw_list = json.loads(CUSTOM_COLOMBIA_FILE.read_text(encoding="utf-8"))
        processed: List[Dict[str, Any]] = []
        for idx, item in enumerate(raw_list, start=1):
            name = item.get("name", "Canal Colombia")
            placeholder = build_placeholder_logo(name)
            logo = item.get("logo") or placeholder
            thematic = item.get("thematic_category") or translate_category(item.get("category", ""), name)
            stream_url = item.get("stream_url", "")
            prob = estimate_stream_probability(stream_url, name, is_vip=True)
            processed.append(
                {
                    "id": f"vip_co_{item.get('tvg_id', idx)}_{idx}",
                    "number": idx,
                    "tvg_id": item.get("tvg_id", f"co.vip.{idx}"),
                    "name": name,
                    "logo": logo if logo.startswith("https://") else placeholder,
                    "fallback_logo": placeholder,
                    "initials": get_initials(name),
                    "category": thematic,
                    "thematic_category": thematic,
                    "sub_category": item.get("category", "Colombia TDT"),
                    "is_colombia": True,
                    "is_vip_colombia": True,
                    "colombia_priority": item.get("priority", idx),
                    "country_code": "CO",
                    "country": "Colombia",
                    "flag": "🇨🇴",
                    "region": "Sudamérica",
                    "original_group": item.get("category", "Colombia TDT"),
                    "quality": item.get("quality", "1080p"),
                    "stream_url": stream_url,
                    "backup_streams": item.get("backup_streams", []),
                    "headers": item.get("headers", {}),
                    "use_proxy": bool(
                        item.get("use_proxy", False) or str(stream_url).startswith("http://")
                    ),
                    "embed_url": item.get("embed_url"),
                    "probability": prob,
                    "probability_label": get_probability_label(prob),
                }
            )
        return processed
    except Exception as exc:
        print(f"[Exe.tv] Warning reading custom_colombia.json: {exc}")
        return []


def load_custom_channels() -> List[Dict[str, Any]]:
    if not CUSTOM_CHANNELS_FILE.exists():
        return []
    try:
        return json.loads(CUSTOM_CHANNELS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_custom_channels(channels: List[Dict[str, Any]]) -> None:
    CUSTOM_CHANNELS_FILE.write_text(
        json.dumps(channels, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def summarize_catalog(all_channels: List[Dict[str, Any]]) -> Dict[str, Any]:
    cat_counts: Dict[str, int] = {cat: 0 for cat in CATEGORY_ORDER}
    country_counts: Dict[str, Dict[str, Any]] = {}
    region_counts: Dict[str, int] = {reg: 0 for reg in REGION_ORDER}

    for idx, ch in enumerate(all_channels, start=1):
        ch["number"] = idx
        cat = ch["category"]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

        if ch.get("is_colombia") or ch.get("country_code") == "CO":
            ch["is_colombia"] = True
            cat_counts[COLOMBIA_CATEGORY_LABEL] = cat_counts.get(COLOMBIA_CATEGORY_LABEL, 0) + 1

        c_name = ch["country"]
        if c_name not in country_counts:
            country_counts[c_name] = {
                "name": c_name,
                "code": ch["country_code"],
                "flag": ch["flag"],
                "region": ch["region"],
                "count": 0,
            }
        country_counts[c_name]["count"] += 1

        reg = ch["region"]
        region_counts[reg] = region_counts.get(reg, 0) + 1

    categories_summary = [
        {"name": COLOMBIA_CATEGORY_LABEL, "count": cat_counts.get(COLOMBIA_CATEGORY_LABEL, 0)},
        {"name": "Todos", "count": len(all_channels)},
    ] + [
        {"name": cat, "count": count}
        for cat, count in cat_counts.items()
        if cat != COLOMBIA_CATEGORY_LABEL and count > 0
    ]

    sorted_countries = sorted(
        country_counts.values(),
        key=lambda x: (x["code"] != "CO", x["code"] == "INT", -x["count"], x["name"]),
    )
    countries_summary = [
        {"name": "Todos", "code": "ALL", "flag": "🌎", "region": "Todas", "count": len(all_channels)}
    ] + sorted_countries

    regions_summary = [{"name": "Todas", "count": len(all_channels)}] + [
        {"name": reg, "count": count}
        for reg, count in region_counts.items()
        if count > 0
    ]

    return {
        "channels": all_channels,
        "categories": categories_summary,
        "countries": countries_summary,
        "regions": regions_summary,
        "total": len(all_channels),
    }


async def fetch_and_parse_playlists(include_global: bool = False) -> Dict[str, Any]:
    headers = {
        "User-Agent": "ExeTV/3.5 (https://exe.tv; Live IPTV Aggregator)"
    }
    seen_urls: set = set()
    colombia_channels: List[Dict[str, Any]] = []
    other_channels: List[Dict[str, Any]] = []

    for vip_ch in load_custom_colombia_channels():
        url = vip_ch.get("stream_url", "")
        if url:
            seen_urls.add(url)
            for b_url in vip_ch.get("backup_streams", []):
                seen_urls.add(b_url)
            colombia_channels.append(vip_ch)

    for custom_ch in load_custom_channels():
        url = custom_ch.get("stream_url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            if custom_ch.get("country_code") == "CO":
                custom_ch["is_colombia"] = True
                colombia_channels.append(dict(custom_ch))
            else:
                other_channels.append(dict(custom_ch))

    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=20.0) as client:
        country_items = list(IBERO_COUNTRY_URLS.items())
        tasks = [
            client.get(COLOMBIA_OFFICIAL_M3U_URL, timeout=15.0),
            client.get(COLOMBIA_RAW_STREAMS_M3U_URL, timeout=15.0),
            client.get(PRIMARY_M3U_URL, timeout=18.0),
            client.get(FREETV_M3U_URL, timeout=15.0),
            *[client.get(url, timeout=15.0) for _, url in country_items],
        ]
        if include_global:
            tasks.append(client.get(GLOBAL_INDEX_M3U_URL, timeout=25.0))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        co_official_resp = results[0]
        if not isinstance(co_official_resp, Exception) and co_official_resp.status_code == 200:
            parsed_co = parse_m3u_content(
                co_official_resp.text,
                forced_country_code="CO",
                allow_http_via_proxy=True,
                seen_urls=seen_urls,
                start_index=len(colombia_channels),
            )
            colombia_channels.extend(parsed_co)

        co_raw_resp = results[1]
        if not isinstance(co_raw_resp, Exception) and co_raw_resp.status_code == 200:
            parsed_co_raw = parse_m3u_content(
                co_raw_resp.text,
                forced_country_code="CO",
                allow_http_via_proxy=True,
                seen_urls=seen_urls,
                start_index=len(colombia_channels),
            )
            colombia_channels.extend(parsed_co_raw)

        colombia_channels.sort(
            key=lambda c: (
                0 if c.get("is_vip_colombia") else 1,
                c.get("colombia_priority", 500),
                c.get("number", 9999),
            )
        )

        spa_resp = results[2]
        if not isinstance(spa_resp, Exception) and spa_resp.status_code == 200:
            parsed_spa = parse_m3u_content(
                spa_resp.text,
                seen_urls=seen_urls,
                start_index=len(colombia_channels) + len(other_channels),
            )
            for ch in parsed_spa:
                if ch.get("is_colombia") or ch.get("country_code") == "CO":
                    colombia_channels.append(ch)
                else:
                    other_channels.append(ch)

        for idx, (iso_code, _) in enumerate(country_items):
            resp = results[4 + idx]
            if not isinstance(resp, Exception) and resp.status_code == 200:
                parsed_c = parse_m3u_content(
                    resp.text,
                    forced_country_code=iso_code,
                    seen_urls=seen_urls,
                    start_index=len(colombia_channels) + len(other_channels),
                )
                other_channels.extend(parsed_c)

        freetv_resp = results[3]
        if not isinstance(freetv_resp, Exception) and freetv_resp.status_code == 200:
            parsed_ftv = parse_m3u_content(
                freetv_resp.text,
                seen_urls=seen_urls,
                start_index=len(colombia_channels) + len(other_channels),
            )
            for ch in parsed_ftv:
                if ch.get("is_colombia") or ch.get("country_code") == "CO":
                    colombia_channels.append(ch)
                else:
                    other_channels.append(ch)

        if include_global and len(results) > 4 + len(country_items):
            global_resp = results[-1]
            if not isinstance(global_resp, Exception) and global_resp.status_code == 200:
                parsed_glob = parse_m3u_content(
                    global_resp.text,
                    seen_urls=seen_urls,
                    start_index=len(colombia_channels) + len(other_channels),
                )
                other_channels.extend(parsed_glob)

    # Consolidate duplicate channels (e.g., all Caracol TV streams into 1 Caracol TV HD channel with multiple signals)
    consolidated_colombia = consolidate_duplicate_channels(colombia_channels)
    consolidated_others = consolidate_duplicate_channels(other_channels)
    all_channels = consolidated_colombia + consolidated_others
    return summarize_catalog(all_channels)
