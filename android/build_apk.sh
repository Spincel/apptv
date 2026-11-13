#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
SDK_DIR="${ANDROID_HOME:-$HOME/Android/Sdk}"
BUILD_TOOLS="$SDK_DIR/build-tools/34.0.0"
PLATFORM="$SDK_DIR/platforms/android-34/android.jar"
ECJ="$DIR/tools/ecj.jar"
KEYSTORE="$DIR/smartertv.keystore"
OUTPUT_DIR="$DIR/out"
OUTPUT_APK="$OUTPUT_DIR/smartertv.apk"

echo "=========================================================="
echo "   🚀 Compilando SmarterTV - APK Android & Google TV"
echo "=========================================================="

mkdir -p "$DIR/compiled" "$DIR/gen" "$DIR/bin" "$DIR/dex" "$OUTPUT_DIR"

echo "1. Compilando recursos XML e imágenes..."
"$BUILD_TOOLS/aapt2" compile --dir "$DIR/res" -o "$DIR/compiled/resources.zip"

echo "2. Enlazando recursos, assets empaquetados y generando R.java..."
"$BUILD_TOOLS/aapt2" link \
  -I "$PLATFORM" \
  --manifest "$DIR/AndroidManifest.xml" \
  -A "$DIR/assets" \
  -o "$OUTPUT_DIR/unaligned.apk" \
  "$DIR/compiled/resources.zip" \
  --java "$DIR/gen"

echo "3. Compilando código Java nativo con ECJ..."
java -jar "$ECJ" -1.8 \
  -cp "$PLATFORM" \
  -d "$DIR/bin" \
  "$DIR/gen/com/smartertv/app/R.java" \
  "$DIR/src/com/smartertv/app/MainActivity.java"

echo "4. Convirtiendo bytecode Java a DEX (d8)..."
"$BUILD_TOOLS/d8" \
  --lib "$PLATFORM" \
  --output "$DIR/dex" \
  $(find "$DIR/bin" -name "*.class")

echo "5. Integrando classes.dex en el paquete APK..."
(cd "$DIR/dex" && zip -u "$OUTPUT_DIR/unaligned.apk" classes.dex)

echo "6. Optimizando alineación de memoria (zipalign 4-byte)..."
"$BUILD_TOOLS/zipalign" -p -f 4 "$OUTPUT_DIR/unaligned.apk" "$OUTPUT_DIR/aligned.apk"

echo "7. Firmando APK con firma v1, v2 y v3 (apksigner)..."
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias smartertv \
  --ks-pass pass:smartertv2026 \
  --key-pass pass:smartertv2026 \
  --out "$OUTPUT_APK" \
  "$OUTPUT_DIR/aligned.apk"

echo "8. Verificando integridad de la firma..."
"$BUILD_TOOLS/apksigner" verify --verbose "$OUTPUT_APK"

echo "9. Actualizando APK descargable del sitio web..."
mkdir -p "$DIR/../downloads"
cp "$OUTPUT_APK" "$DIR/../downloads/smartertv.apk"

echo ""
echo "=========================================================="
echo "  ✔ ¡Compilación exitosa!"
echo "  📦 APK final listo para instalar:"
echo "     $OUTPUT_APK"
echo "  🌐 APK copiado para descarga web:"
echo "     $DIR/../downloads/smartertv.apk"
echo "=========================================================="
