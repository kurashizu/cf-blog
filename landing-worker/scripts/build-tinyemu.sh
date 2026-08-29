#!/bin/bash
# Builds Fabrice Bellard's TinyEMU to WebAssembly, which is what gives the page
# a riscv64 machine — v86 is an IA-32 emulator and cannot be one.
#
# The upstream JS makefile is from 2019 and speaks an Emscripten dialect that no
# longer exists, so the flags are rewritten here rather than in a patch file:
# each substitution is one obsolete flag and it is clearer to read them as a
# list than as a diff.
set -euo pipefail

TINYEMU_VERSION="${TINYEMU_VERSION:-2019-12-21}"
EMSDK_VERSION="${EMSDK_VERSION:-3.1.74}"
OUT="${OUT:-$PWD/out}"
WORK="${WORK:-/tmp/tinyemu-build}"

mkdir -p "$WORK" "$OUT"
cd "$WORK"

if [ ! -d emsdk ]; then
	git clone --depth 1 https://github.com/emscripten-core/emsdk
fi
(cd emsdk && ./emsdk install "$EMSDK_VERSION" && ./emsdk activate "$EMSDK_VERSION")
# shellcheck disable=SC1091
source emsdk/emsdk_env.sh

if [ ! -d "tinyemu-$TINYEMU_VERSION" ]; then
	curl -sL "https://bellard.org/tinyemu/tinyemu-$TINYEMU_VERSION.tar.gz" | tar xz
fi
cd "tinyemu-$TINYEMU_VERSION"

python3 - <<'PY'
import pathlib
p = pathlib.Path('Makefile.js')
s = p.read_text()

# Compiler flags: --llvm-opts went away, and clang now treats what this code
# does casually as errors rather than warnings.
s = s.replace('-O2 --llvm-opts 2 -Wall', '-O2 -Wall -Wno-implicit-function-declaration -Wno-int-conversion -Wno-incompatible-pointer-types')

# Link flags, one obsolete spelling at a time.
s = s.replace('--memory-init-file 0 ', '')
s = s.replace('-s BINARYEN_TRAP_MODE=clamp ', '')
s = s.replace('EXTRA_EXPORTED_RUNTIME_METHODS', 'EXPORTED_RUNTIME_METHODS')
# The JS library calls _malloc and _free directly and reaches the C callbacks
# through dynCall; both have to be asked for now or they are optimised away.
s = s.replace("'_net_set_carrier']", "'_net_set_carrier','_malloc','_free']")
s = s.replace('-s NO_FILESYSTEM=1', '-s NO_FILESYSTEM=1 -s DYNCALLS=1')
s = s.replace('-s TOTAL_MEMORY=67108864', '-s INITIAL_MEMORY=67108864')

# The page loads this itself rather than letting it run on load, so it is built
# as a module with a name to call.
s = s.replace(
    "EMLDFLAGS_WASM:=$(EMLDFLAGS) -s WASM=1",
    "EMLDFLAGS_WASM:=$(EMLDFLAGS) -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createTinyEmu -s ENVIRONMENT=web -s STACK_SIZE=1048576",
)

# Only the 64-bit wasm target is wanted; the others cost build time and the
# asm.js ones no longer link at all.
s = s.replace('PROGS=js/riscvemu32.js js/riscvemu32-wasm.js js/riscvemu64.js js/riscvemu64-wasm.js',
              'PROGS=js/riscvemu64-wasm.js')
p.write_text(s)
print('Makefile.js rewritten')
PY

# The JS library that ships with it is the same vintage as the makefile and
# leans on three things the Emscripten runtime has since removed. It would have
# compiled and then failed on its first fetch.
python3 - <<'PATCHLIB'
import pathlib
p = pathlib.Path('js/lib.js')
s = p.read_text()

# Renamed years ago.
s = s.replace('Pointer_stringify(', 'UTF8ToString(')
# Runtime.* is gone; dynCall is a plain global when DYNCALLS is on.
s = s.replace('Runtime.dynCall(', 'dynCall(')

# Browser.wgetRequests belonged to a library this build does not link. The
# requests only need somewhere to live that outlives the call, and Module is
# already that.
s = s.replace('var handle = Browser.getNextWgetRequestHandle();',
              'var handle = (Module.__wgetId = (Module.__wgetId || 0) + 1);')
s = s.replace('delete Browser.wgetRequests[handle];',
              'delete (Module.__wgetReqs || {})[handle];')
s = s.replace('Browser.wgetRequests[handle] = http;',
              '(Module.__wgetReqs = Module.__wgetReqs || {})[handle] = http;')

# The page is not obliged to care about download progress.
s = s.replace('update_downloading(Boolean(flag));',
              "if (typeof update_downloading === 'function') update_downloading(Boolean(flag));")

p.write_text(s)
print('js/lib.js patched')
PATCHLIB

mkdir -p js
emmake make -f Makefile.js -j"$(nproc)"

cp js/riscvemu64-wasm.js js/riscvemu64-wasm.wasm "$OUT/"
ls -l "$OUT"
