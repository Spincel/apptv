#!/usr/bin/env python3
"""
SmarterTV - Web Server & Download Portal
Serves the Landing Page, APK downloads, and Admin Panel.
"""
import mimetypes
import os
from pathlib import Path
from aiohttp import web

BASE_DIR = Path(__file__).resolve().parent
APK_PATH = BASE_DIR / "downloads" / "smartertv.apk"

routes = web.RouteTableDef()


@routes.get("/")
async def index_handler(request: web.Request) -> web.FileResponse:
    return web.FileResponse(BASE_DIR / "index.html")


@routes.get("/admin")
@routes.get("/admin.html")
async def admin_handler(request: web.Request) -> web.FileResponse:
    return web.FileResponse(BASE_DIR / "admin.html")


@routes.get("/privacy")
@routes.get("/privacy.html")
async def privacy_handler(request: web.Request) -> web.FileResponse:
    return web.FileResponse(BASE_DIR / "privacy.html")


@routes.get("/download/smartertv.apk")
async def apk_download_handler(request: web.Request) -> web.FileResponse:
    if not APK_PATH.is_file():
        return web.Response(text="APK no encontrado en el servidor. Compila primero con ./build_apk.sh", status=404)
    
    headers = {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="smartertv.apk"',
        "Cache-Control": "no-cache",
    }
    return web.FileResponse(APK_PATH, headers=headers)


def create_app() -> web.Application:
    app = web.Application()
    app.add_routes(routes)
    
    # Static assets
    app.router.add_static("/css/", path=str(BASE_DIR / "css"), name="css")
    app.router.add_static("/js/", path=str(BASE_DIR / "js"), name="js")
    app.router.add_static("/downloads/", path=str(BASE_DIR / "downloads"), name="downloads")
    
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print("=" * 60)
    print(f"🚀 Portal Web SmarterTV iniciado en: http://0.0.0.0:{port}")
    print(f"📥 Descarga directa APK: http://0.0.0.0:{port}/download/smartertv.apk")
    print(f"🔐 Panel de Administración: http://0.0.0.0:{port}/admin.html")
    print("=" * 60)
    web.run_app(create_app(), host="0.0.0.0", port=port)
