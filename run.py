import os
import sys
import time
import signal
import shutil
import socket
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

BIND_HOST = "0.0.0.0"
LOCAL_HOST = "127.0.0.1"
BACKEND_PORT = "8085"
FRONTEND_PORT = "5173"


def get_local_ip() -> str:
    """Detects the local Wi-Fi/LAN IP address so mobile devices on the same network can connect."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def get_npm_cmd() -> str:
    """Returns the correct npm executable for the current OS."""
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    resolved = shutil.which(npm_cmd) or shutil.which("npm")
    if not resolved:
        print("[Exe.tv] Error: No se encontró 'npm' instalado en el sistema.")
        sys.exit(1)
    return resolved


def ensure_dependencies(npm_exec: str) -> None:
    """Checks and installs missing backend or frontend dependencies if needed."""
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import httpx    # noqa: F401
    except ImportError:
        print("[Exe.tv] Instalando dependencias del Backend (FastAPI, Uvicorn, HTTPX)...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=str(BACKEND_DIR),
            check=True,
        )

    if not (FRONTEND_DIR / "node_modules").exists():
        print("[Exe.tv] Instalando dependencias del Frontend (npm install)...")
        subprocess.run(
            [npm_exec, "install"],
            cwd=str(FRONTEND_DIR),
            check=True,
        )


def wait_for_backend(url: str, timeout: float = 20.0) -> bool:
    """Waits until the FastAPI backend responds to health checks before opening the browser."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def terminate_process_tree(proc: subprocess.Popen) -> None:
    """Gracefully terminates a subprocess and its children on Windows & Unix."""
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            proc.terminate()
            proc.wait(timeout=5)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def main() -> None:
    npm_exec = get_npm_cmd()
    ensure_dependencies(npm_exec)

    lan_ip = get_local_ip()
    backend_url = f"http://{LOCAL_HOST}:{BACKEND_PORT}"
    frontend_url = f"http://{LOCAL_HOST}:{FRONTEND_PORT}"
    lan_frontend_url = f"http://{lan_ip}:{FRONTEND_PORT}"

    print("=" * 66)
    print("  EXE.TV — Plataforma de Televisión en Vivo (IPTV)")
    print("=" * 66)
    print(f"  -> En este PC       : {frontend_url}")
    print(f"  -> En Celular/TV    : {lan_frontend_url}  (Misma red Wi-Fi)")
    print(f"  -> Backend API      : {backend_url}/api/channels")
    print("  Presiona Ctrl + C para detener ambos servidores.")
    print("=" * 66)

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        BIND_HOST,
        "--port",
        BACKEND_PORT,
    ]

    frontend_cmd = [
        npm_exec,
        "run",
        "dev",
        "--",
        "--host",
        BIND_HOST,
        "--port",
        FRONTEND_PORT,
    ]

    processes: list[subprocess.Popen] = []

    try:
        print("\n[1/2] Iniciando Backend (FastAPI)...")
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=str(BACKEND_DIR),
        )
        processes.append(backend_proc)

        wait_for_backend(f"{backend_url}/api/health", timeout=15.0)

        print("[2/2] Iniciando Frontend (React + Vite)...")
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=str(FRONTEND_DIR),
        )
        processes.append(frontend_proc)

        time.sleep(2.0)
        if "--no-browser" not in sys.argv:
            try:
                webbrowser.open(frontend_url)
            except Exception:
                pass

        while True:
            time.sleep(1.0)
            if backend_proc.poll() is not None:
                print("\n[Exe.tv] El servidor Backend se detuvo inesperadamente.")
                break
            if frontend_proc.poll() is not None:
                print("\n[Exe.tv] El servidor Frontend se detuvo inesperadamente.")
                break

    except KeyboardInterrupt:
        print("\n\n[Exe.tv] Deteniendo servidores...")
    finally:
        for proc in processes:
            terminate_process_tree(proc)
        print("[Exe.tv] Todos los servicios han sido cerrados correctamente.")


if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda sig, frame: (_ for _ in ()).throw(KeyboardInterrupt()))
    main()
