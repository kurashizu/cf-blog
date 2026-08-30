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

# Without submodules: QEMU's are firmware ROM sources — u-boot, seabios,
# opensbi and the rest — hundreds of megabytes that a browser build never
# links. The one subproject this does need, dtc, is checked out below.
if [ ! -d "$WORK" ]; then
	git clone --depth 1 --branch "$QEMU_REF" https://github.com/ktock/qemu-wasm "$WORK"
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
# Unconditionally, and as a plain checkout: a submodule left by the recursive
# clone has its .git elsewhere, which is not a repository once the tree is
# copied into the container — and meson responds to that by trying to create
# one, in a directory that already has files in it.
rm -rf "$WORK/subprojects/dtc"
git clone "$DTC_URL" "$WORK/subprojects/dtc"
git -C "$WORK/subprojects/dtc" checkout --detach "$DTC_REV"
echo "==> dtc at $(git -C "$WORK/subprojects/dtc" rev-parse --short HEAD)"

echo "==> building the toolchain image"
docker build -t buildqemu - < "$WORK/Dockerfile"

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
# Copied in rather than bind-mounted, which is where four attempts went. Meson
# writes into the source tree to set subprojects up, and a mount owned by the
# host's user is a directory the container cannot touch — reported, unhelpfully,
# as "Git command failed". Inside its own filesystem the build owns everything
# it needs to.
docker run --rm -d --name build-qemu-wasm --entrypoint /bin/sh buildqemu -c 'sleep infinity'
echo "==> copying the source into the container"
docker cp "$WORK/." build-qemu-wasm:/qemu

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
docker exec build-qemu-wasm sh -c 'ls -la /qemu/subprojects/dtc | head -6'
docker exec build-qemu-wasm sh -c 'id; ls -la /qemu/subprojects | head -20; git -C /qemu/subprojects/dtc log --oneline -1 || echo "(dtc is not a repo in here)"'

configure_failed() {
	echo "==> meson's own log"
	docker exec build-qemu-wasm sh -c 'tail -80 /build/meson-logs/meson-log.txt' || true
	exit 1
}

# PTHREAD_POOL_SIZE below is a link setting -- in the compile flags emcc ignores
# it with a warning, which is how it got missed the first time. Emscripten's
# default pool is 4 and QEMU wants more: main is proxied onto one, and the CPU,
# RCU and block threads take the rest. Past the fourth, spawnThread gets a
# worker from getNewWorker whose wasm module is still loading --
# loadWasmModuleToWorker is asynchronous and nothing waits for it -- so the
# thread never starts and whoever waited on it waits forever. From outside that
# looked like: the guest printed "[vda] 905216 512-byte logical blocks", having
# read one sector, and stopped for good.
docker exec build-qemu-wasm emconfigure /qemu/configure \
	--static --target-list="${TARGET}-softmmu" --cpu=wasm32 --cross-prefix= \
	--without-default-features --enable-system --with-coroutine=fiber --enable-virtfs \
	--extra-cflags="$EXTRA_CFLAGS" --extra-cxxflags="$EXTRA_CFLAGS" \
	--extra-ldflags="-sEXPORTED_RUNTIME_METHODS=getTempRet0,setTempRet0,addFunction,removeFunction,TTY,FS -sPTHREAD_POOL_SIZE=8" || configure_failed

docker exec build-qemu-wasm emmake make -j"$(nproc)" "qemu-system-${TARGET}"

echo "==> collecting artifacts"
for name in "qemu-system-${TARGET}" "qemu-system-${TARGET}.wasm" \
	"qemu-system-${TARGET}.worker.js" "qemu-system-${TARGET}.js"; do
	docker cp "build-qemu-wasm:${BUILD_DIR}/${name}" "$OUT/" 2>/dev/null || true
done

# The ROMs x86 cannot start without: its BIOS, and the VGA BIOS the display
# adapter runs. QEMU looks for these at runtime under whatever -L names, so they
# have to travel with the binary rather than being linked into it. They are
# committed blobs rather than the firmware *sources* the submodules hold, which
# is why a shallow clone without submodules still has them.
#
# Only the handful x86 actually reads: pc-bios is 45 files and most of them
# belong to boards this build does not have.
mkdir -p "$OUT/pc-bios"
for rom in bios-256k.bin vgabios-stdvga.bin vgabios.bin kvmvapic.bin linuxboot_dma.bin \
	efi-virtio.rom efi-e1000.rom; do
	docker cp "build-qemu-wasm:/qemu/pc-bios/${rom}" "$OUT/pc-bios/" 2>/dev/null || true
done
echo "==> ROMs collected: $(ls "$OUT/pc-bios" 2>/dev/null | wc -l)"

docker rm -f build-qemu-wasm >/dev/null 2>&1 || true
ls -l "$OUT"
