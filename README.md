# 📺 SmarterTV - Web Portal, Android & Google TV App

SmarterTV es un ecosistema completo para distribución y monetización de un reproductor IPTV rápido y ultraligero (238 KB), compatible con teléfonos Android, tablets y Smart TVs con **Google TV / Android TV**.

---

## 🌟 Características Principales

1. **Aplicación Nativa Android & Google TV:**
   - Soporte total para control remoto (D-Pad).
   - Acceso nativo mediante credenciales Xtream Codes (Servidor, Usuario, Contraseña).
   - Reproducción fluida en vivo (HLS) y películas/series bajo demanda (VOD).
2. **Monetización Inteligente (Split-Screen Ad Sidebar):**
   - Primeros 5-10 minutos 100% libres de publicidad a pantalla completa.
   - Activación automática de barra lateral sin pausar ni interrumpir la transmisión de video o audio.
   - Rotador de banners y soporte para Google AdSense / AdMob.
   - Desbloqueo PRO mediante Código QR o Clave de Licencia.
3. **Portal Web & Panel de Ventas:**
   - Landing page moderna optimizada para conversión y descarga directa del APK.
   - Tutorial integrado paso a paso para televisores mediante la app **Downloader**.
   - Panel de control de ventas (`admin.html`) para generar licencias de clientes y registrar pagos (PayPal, MercadoPago, WhatsApp, Efectivo).
   - Política de privacidad lista para aprobación de redes de anuncios.
4. **Despliegue Cero-Configuración en Vercel:**
   - Compatible directamente con Vercel para hosting gratuito en CDN global con HTTPS automático.

---

## 📁 Estructura del Repositorio

```
apptv/
├── index.html              # Landing Page pública y descarga de la app
├── admin.html              # Panel administrativo de ventas y licencias
├── privacy.html            # Política de privacidad
├── vercel.json             # Configuración de rutas y cabeceras de descarga APK
├── css/
│   └── web.css             # Estilos modernos del portal web
├── downloads/
│   └── smartertv.apk       # APK compilado y firmado listo para distribución
├── android/                # Código fuente nativo de la app Android
│   ├── AndroidManifest.xml # Configuración Leanback y permisos
│   ├── build_apk.sh        # Script automatizado de compilación y firmado
│   ├── smartertv.keystore  # Llave de firmado RSA 2048-bit
│   ├── src/                # MainActivity.java (Webview con aceleración GPU)
│   ├── res/                # Iconos y banner para Android TV
│   ├── assets/             # Interfaz interna del reproductor y D-Pad
│   └── tools/              # Compilador ECJ
├── server.py               # Servidor web local de prueba (puerto 5050)
├── run_web.sh              # Lanzador local del servidor
└── README.md
```

---

## 🚀 Despliegue en Vercel con Dominio de Hostinger

### Paso 1: Conectar Repositorio a Vercel (Gratis)
1. Entra a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..."** ➔ **"Project"**.
3. Selecciona el repositorio `Spincel/apptv`.
4. Deja la configuración por defecto (**Root Directory: `./`**, **Framework: Other**).
5. Haz clic en **"Deploy"**. En segundos tu sitio web estará publicado en una URL `.vercel.app`.

### Paso 2: Conectar tu Dominio de Hostinger
1. En el panel de tu proyecto en Vercel, ve a **Settings** ➔ **Domains**.
2. Escribe tu dominio (ejemplo: `tudominio.com` o `app.tudominio.com`) y haz clic en **Add**.
3. Vercel te mostrará los registros DNS requeridos:
   - **Registro A**: Host `@` apuntando a `76.76.21.21`
   - **Registro CNAME**: Host `www` apuntando a `cname.vercel-dns.com`
4. Entra al panel de **Hostinger** ➔ **Dominios** ➔ Tu Dominio ➔ **Zona DNS**.
5. Agrega o actualiza esos dos registros.
6. En pocos minutos, tu dominio propio estará activo con certificado SSL (HTTPS) gratuito proporcionado por Vercel.

---

## 📥 Cómo Instalar en Televisores (Google TV / Android TV / Fire TV)

Tus usuarios de Smart TV solo deben:
1. Abrir la app **Downloader** en su televisor (disponible gratis en Google Play Store / Amazon Appstore).
2. Escribir la URL de tu sitio web:
   ```
   https://tudominio.com/download/smartertv.apk
   ```
3. La aplicación se descarga e instala automáticamente.

---

## 🛠️ Cómo Recompilar el APK Android

Si realizas cambios en el código de la app Android, recompila ejecutando:

```bash
cd android
./build_apk.sh
```

El script compila, firma con la clave `smartertv.keystore`, optimiza con `zipalign` y actualiza automáticamente tanto `android/out/smartertv.apk` como `downloads/smartertv.apk`.
