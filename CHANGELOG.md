# 📋 Registro de Versiones - SmarterTV APK & Web Portal

Este archivo lleva el control oficial de cada versión del APK compilado y distribuido a Smart TVs, TV Boxes y dispositivos Android.

---

## 🏷️ Versión 1.1.0 (Build 2) - 18 de Noviembre de 2026
* **Novedades principales:**
  * **Soporte completo de Películas VOD:** Consulta automática a `get_vod_categories` y `get_vod_streams` de la API de Xtream Codes.
  * **Soporte completo de Series de TV:** Consulta a `get_series_categories`, `get_series` y consulta interactiva de temporadas y episodios mediante `get_series_info`.
  * **Selector de Temporadas y Capítulos:** Ventana modal optimizada para televisores que permite navegar entre Temporada 1, 2, 3... y seleccionar cualquier episodio para reproducir.
  * **Reproductor Híbrido HLS / MP4:** Detección automática del formato de streaming. Si es canal en vivo usa HLS (`.m3u8`), y si es película o serie reproduce directamente archivos `.mp4` / `.mkv` con aceleración de hardware.
  * **Diseño vertical de carátulas (2:3):** Las películas y series ahora lucen en su relación de aspecto nativa de póster cinematográfico sin deformación.
  * **Identificador visual de versión en la app:** Se añade la etiqueta `v1.1.0` en la barra superior de la app, en el panel administrativo y en la pantalla de inicio de sesión.
  * **Control de caché:** Incremento obligatorio a `versionCode="2"` y `versionName="1.1.0"` en el `AndroidManifest.xml` para asegurar que las Smart TVs actualicen limpiamente.

---

## 🏷️ Versión 1.0.0 (Build 1) - 13 de Noviembre de 2026
* **Lanzamiento inicial:**
  * Reproducción fluida de canales en vivo con `Hls.js`.
  * Autenticación con servidores IPTV mediante credenciales Xtream Codes (Servidor, Usuario, Contraseña).
  * Soporte para control remoto (D-Pad de Android TV y Google TV).
  * Sistema de monetización mediante barra lateral patrocinada con rotador de anuncios y temporizador de vista limpia de 5 a 10 minutos.
  * Activación PRO mediante código QR o clave de licencia de compra.
  * Soporte nativo para Picture-in-Picture (PiP).
