#!/bin/bash
# Builds QEMU for the browser, from ktock/qemu-wasm — the fork whose Wasm TCG
# backend is being upstreamed. One target per run: each is a full QEMU build and
# they take long enough that batching them buys nothing but a longer wait to
# find out something is wrong.
#
# What this gets us that v86 and TinyEMU cannot: x86-64, arm64 and riscv64 from
# one codebase, with QEMU's device models behind them. What it costs: an
# artifact measured in tens of megabytes, SharedArrayBuffer (so the page has to
# be cross-origin isolated), and a disk that QEMU expects to have in its own
# filesystem rather than streamed a megabyte at a time.
set -euo pipefail

TARGET="${TARGET:-aarch64}"
QEMU_REF="${QEMU_REF:-master}"
OUT="${OUT:-$PWD/out}"
WORK="${WORK:-/tmp/qemu-wasm}"

mkdir -p "$OUT"

if [ ! -d "$WORK" ]; then
	git clone --depth 1 --branch "$QEMU_REF" https://github.com/ktock/qemu-wasm "$WORK"
fi

echo "==> building the toolchain image"
docker build -t buildqemu - < "$WORK/Dockerfile"

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
docker run --rm -d --name build-qemu-wasm -v "$WORK":/qemu/:ro \
	--entrypoint /bin/sh buildqemu -c 'sleep infinity'

BUILD_DIR=$(docker exec build-qemu-wasm pwd)
echo "==> building in $BUILD_DIR"

# Verbatim from the project's own instructions, which is the point: this is a
# long build and guessing at flags is how an afternoon disappears.
EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"

docker exec build-qemu-wasm emconfigure /qemu/configure \
	--static --target-list="${TARGET}-softmmu" --cpu=wasm32 --cross-prefix= \
	--without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
	--extra-cflags="$EXTRA_CFLAGS" --extra-cxxflags="$EXTRA_CFLAGS" \
	--extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS"

docker exec build-qemu-wasm emmake make -j"$(nproc)" "qemu-system-${TARGET}"

echo "==> collecting artifacts"
for name in "qemu-system-${TARGET}" "qemu-system-${TARGET}.wasm" \
	"qemu-system-${TARGET}.worker.js" "qemu-system-${TARGET}.js"; do
	docker cp "build-qemu-wasm:${BUILD_DIR}/${name}" "$OUT/" 2>/dev/null || true
done

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
ls -l "$OUT"
