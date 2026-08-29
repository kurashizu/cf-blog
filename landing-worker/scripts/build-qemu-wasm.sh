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

# Submodules included: aarch64 and riscv64 need libfdt, and QEMU builds it from
# its bundled dtc. Without it meson tries to fetch the subproject at configure
# time, which is both slower and a network dependency inside the container.
if [ ! -d "$WORK" ]; then
	git clone --depth 1 --recurse-submodules --shallow-submodules \
		--branch "$QEMU_REF" https://github.com/ktock/qemu-wasm "$WORK"
fi

# zlib.net serves only the current release, so a pinned version disappears from
# it the moment there is a newer one. The GitHub release of the same version
# does not move.
sed -i 's|https://zlib.net/zlib-\$ZLIB_VERSION.tar.xz|https://github.com/madler/zlib/releases/download/v$ZLIB_VERSION/zlib-$ZLIB_VERSION.tar.xz|' "$WORK/Dockerfile"

# arm64 and riscv64 need libfdt, which QEMU builds from the dtc subproject. Left
# to itself, meson runs git inside the source tree to fetch it and reports only
# "Git command failed" when anything about that goes wrong — a bind-mounted tree,
# a shallow clone, a submodule directory left half-populated. Cloning it here
# takes the whole question out of the build.
DTC_URL=$(sed -n 's/^url = //p' "$WORK/subprojects/dtc.wrap")
DTC_REV=$(sed -n 's/^revision = //p' "$WORK/subprojects/dtc.wrap")
if [ ! -d "$WORK/subprojects/dtc/.git" ]; then
	rm -rf "$WORK/subprojects/dtc"
	git clone "$DTC_URL" "$WORK/subprojects/dtc"
	git -C "$WORK/subprojects/dtc" checkout --detach "$DTC_REV"
fi

echo "==> building the toolchain image"
docker build -t buildqemu - < "$WORK/Dockerfile"

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
# Writable, unlike the project's own instructions: meson populates subprojects
# inside the source tree, and a read-only mount stops the build at "git init
# dtc" the moment a target needs a device tree.
docker run --rm -d --name build-qemu-wasm -v "$WORK":/qemu/:rw \
	--entrypoint /bin/sh buildqemu -c 'sleep infinity'

BUILD_DIR=$(docker exec build-qemu-wasm pwd)
echo "==> building in $BUILD_DIR"

# The source is bind-mounted from the host and owned by another uid, which git
# refuses to touch. Meson runs git to set the dtc subproject up and reports only
# that the command failed, so this looks like a missing device-tree library
# rather than a permissions check.
docker exec build-qemu-wasm git config --global --add safe.directory '*'

# And if configure still fails, the reason is in meson's log rather than in
# anything printed to the terminal.
# Verbatim from the project's own instructions, which is the point: this is a
# long build and guessing at flags is how an afternoon disappears.
EXTRA_CFLAGS="-O3 -g -Wno-error=unused-command-line-argument -matomics -mbulk-memory -DNDEBUG -DG_DISABLE_ASSERT -D_GNU_SOURCE -sASYNCIFY=1 -pthread -sPROXY_TO_PTHREAD=1 -sFORCE_FILESYSTEM -sALLOW_TABLE_GROWTH -sTOTAL_MEMORY=2300MB -sWASM_BIGINT -sMALLOC=mimalloc --js-library=/build/node_modules/xterm-pty/emscripten-pty.js -sEXPORT_ES6=1 -sASYNCIFY_IMPORTS=ffi_call_js"

echo "==> what the build sees of the subproject"
docker exec build-qemu-wasm sh -c 'id; ls -la /qemu/subprojects | head -20; git -C /qemu/subprojects/dtc log --oneline -1 || echo "(dtc is not a repo in here)"'

configure_failed() {
	echo "==> meson's own log"
	docker exec build-qemu-wasm sh -c 'tail -80 /build/meson-logs/meson-log.txt' || true
	exit 1
}

docker exec build-qemu-wasm emconfigure /qemu/configure \
	--static --target-list="${TARGET}-softmmu" --cpu=wasm32 --cross-prefix= \
	--without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
	--extra-cflags="$EXTRA_CFLAGS" --extra-cxxflags="$EXTRA_CFLAGS" \
	--extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS" || configure_failed

docker exec build-qemu-wasm emmake make -j"$(nproc)" "qemu-system-${TARGET}"

echo "==> collecting artifacts"
for name in "qemu-system-${TARGET}" "qemu-system-${TARGET}.wasm" \
	"qemu-system-${TARGET}.worker.js" "qemu-system-${TARGET}.js"; do
	docker cp "build-qemu-wasm:${BUILD_DIR}/${name}" "$OUT/" 2>/dev/null || true
done

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
ls -l "$OUT"
