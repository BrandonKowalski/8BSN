#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE="${CORE:-mesen}"
BUILD="$ROOT/core/build"
OUT="$ROOT/src/emu/core"

case "$CORE" in
  mesen)
    REPO="https://github.com/libretro/Mesen.git"
    COMMIT="0102910c39ad1a62bc3f784466f3f67ca9eae335"
    MAKE_DIR="Libretro"
    LIB="mesen_libretro_emscripten.bc"
    HEADER_DIR="Libretro"
    LINK_ARGS=(-sINITIAL_MEMORY=134217728)
    MAKE_ARGS=(platform=emscripten STATIC_LINKING=1 fpic= AR=emar)
    ;;
  nestopia)
    REPO="https://github.com/libretro/nestopia.git"
    COMMIT="06a8949e0b3cf60e3a38a374b1426bf40fccb9a0"
    MAKE_DIR="libretro"
    LIB="nestopia_libretro_emscripten.bc"
    HEADER_DIR="libretro/libretro-common/include"
    LINK_ARGS=(-sINITIAL_MEMORY=67108864 -sFILESYSTEM=0)
    MAKE_ARGS=(platform=emscripten AR=emar)
    ;;
  *)
    echo "unknown CORE: $CORE" >&2
    exit 1
    ;;
esac

SRC="$BUILD/$CORE"
mkdir -p "$BUILD"
if [ ! -d "$SRC/.git" ]; then
  git clone --quiet "$REPO" "$SRC"
fi
git -C "$SRC" fetch --quiet origin "$COMMIT" || true
git -C "$SRC" checkout --quiet --force "$COMMIT"

JOBS="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
emmake make -C "$SRC/$MAKE_DIR" "${MAKE_ARGS[@]}" clean >/dev/null
emmake make -C "$SRC/$MAKE_DIR" "${MAKE_ARGS[@]}" -j"$JOBS"

cp "$SRC/$MAKE_DIR/$LIB" "$BUILD/lib$CORE.a"
emcc -O3 -I"$SRC/$HEADER_DIR" -c "$ROOT/core/frontend/tb_frontend.c" -o "$BUILD/tb_frontend.o"

mkdir -p "$OUT"
em++ -O3 \
  "$BUILD/tb_frontend.o" \
  "$BUILD/lib$CORE.a" \
  -o "$OUT/tb_core.mjs" \
  -sMODULARIZE \
  -sEXPORT_ES6 \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=0 \
  "${LINK_ARGS[@]}" \
  -sEXPORTED_FUNCTIONS=_tb_init,_tb_load_rom,_tb_set_input,_tb_set_sprite_limit_removal,_tb_run_frame,_tb_video_ptr,_tb_audio_ptr,_tb_audio_frames,_tb_sample_rate,_tb_fps,_tb_ram_ptr,_tb_ram_size,_tb_sram_ptr,_tb_sram_size,_tb_state_size,_tb_save_state,_tb_load_state,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP16

{
  echo "core: $CORE"
  echo "repo: $REPO"
  echo "commit: $COMMIT"
  echo "emcc: $(emcc --version 2>/dev/null | head -n 1)"
  echo "link: ${LINK_ARGS[*]}"
  if [ -n "${REASON:-}" ]; then
    echo "reason: $REASON"
  fi
} > "$ROOT/core/BUILD_INFO"
