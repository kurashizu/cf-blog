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
s = s.replace("'_net_set_carrier']", "'_net_set_carrier','_vm_stop','_vm_dump_state','_vm_dump_loop','_malloc','_free']")
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

# TinyEMU drives itself with a chain of timers inside the module and has no way
# to be told to stop, so a powered-off machine would keep running unseen. One
# flag, checked where the chain is picked up again.
python3 - <<'PATCHRUN'
import pathlib
p = pathlib.Path('jsemu.c')
s = p.read_text()
a = '''void virt_machine_run(void *opaque)
{
    VirtMachine *m = opaque;'''
b = '''BOOL vm_stopped;
static BOOL vm_ran_once;
static uint64_t vm_run_calls, vm_interp_calls;
static int vm_last_delay;

/* How the run loop is actually behaving: a machine can look stopped because
   nothing schedules it, because it schedules itself and sleeps, or because it
   runs and executes nothing. These three numbers say which. */
void vm_dump_loop(void)
{
    fprintf(stderr, "run=%\" PRIu64 \" interp=%\" PRIu64 \" last_delay=%d\\n",
            vm_run_calls, vm_interp_calls, vm_last_delay);
}

/* Called from the page when the machine is powered off: the run loop
   reschedules itself, so stopping means not scheduling the next one. */
void vm_stop(void)
{
    vm_stopped = TRUE;
}

void virt_machine_run(void *opaque)
{
    VirtMachine *m = opaque;

    if (vm_stopped)
        return;

    /* One line, once: the difference between a machine that is slow and one
       that never started is otherwise invisible from the page. */
    if (!vm_ran_once) {
        vm_ran_once = TRUE;
        fprintf(stderr, "machine running\\n");
    }
    vm_run_calls++;'''
assert a in s, 'run loop not found'
s = s.replace(a, b, 1)

# And one where vm_start begins, so a machine that never gets as far as loading
# its config can be told apart from one that loads everything and never runs.
a2 = '    s->p = mallocz(sizeof(VirtMachineParams));'
b2 = '    fprintf(stderr, "vm_start: %s, %d MB\\n", url, ram_size);\n' + a2
assert a2 in s, 'vm_start body not found'
s = s.replace(a2, b2, 1)

p.write_text(s)
loop_at = '''        virt_machine_interp(m, MAX_EXEC_CYCLE);
        i++;'''
loop_new = '''        vm_interp_calls++;
        virt_machine_interp(m, MAX_EXEC_CYCLE);
        i++;'''
assert loop_at in s, 'interp call not found'
s = s.replace(loop_at, loop_new, 1)

delay_at = '''    if (delay == 0) {
        emscripten_async_call(virt_machine_run, m, 0);'''
delay_new = '''    vm_last_delay = delay;
    if (delay == 0) {
        emscripten_async_call(virt_machine_run, m, 0);'''
assert delay_at in s, 'delay branch not found'
s = s.replace(delay_at, delay_new, 1)

print('jsemu.c: vm_stop, prints and loop counters added')
PATCHRUN

# This TinyEMU predates the privileged spec that OpenSBI expects, so the
# firmware reads registers the emulator has never heard of and traps to a dead
# stop before printing anything. Two families are enough: the PMP registers,
# which OpenSBI programs to fence its domains, and the machine performance
# counters it enumerates on the way past.
#
# Reads answer zero and writes are dropped. Nothing here enforces PMP anyway —
# the point is to let the firmware finish configuring a protection scheme the
# emulator does not implement, not to pretend it works.
python3 - <<'PATCHCSR'
import pathlib
p = pathlib.Path('riscv_cpu.c')
s = p.read_text()

read_at = '''    case 0xf14:
        val = s->mhartid;
        break;'''
read_new = '''    case 0xf14:
        val = s->mhartid;
        break;
    case 0x3a0 ... 0x3af: /* pmpcfg0-15 */
    case 0x3b0 ... 0x3ef: /* pmpaddr0-63 */
    case 0x320:           /* mcountinhibit */
    case 0x323 ... 0x33f: /* mhpmevent3-31 */
    case 0xb03 ... 0xb1f: /* mhpmcounter3-31 */
    case 0xb83 ... 0xb9f: /* mhpmcounter3-31h */
        val = 0;
        break;'''
assert read_at in s, 'csr_read tail not found'
s = s.replace(read_at, read_new, 1)

write_at = '''static int csr_write(RISCVCPUState *s, uint32_t csr, target_ulong val)
{
    target_ulong mask;
'''
write_new = '''static int csr_write(RISCVCPUState *s, uint32_t csr, target_ulong val)
{
    target_ulong mask;

    /* Accepted and discarded: see the note in scripts/build-tinyemu.sh. */
    if ((csr >= 0x3a0 && csr <= 0x3ef) ||
        csr == 0x320 ||
        (csr >= 0x323 && csr <= 0x33f) ||
        (csr >= 0xb03 && csr <= 0xb1f) ||
        (csr >= 0xb83 && csr <= 0xb9f))
        return 0;
'''
assert write_at in s, 'csr_write head not found'
s = s.replace(write_at, write_new, 1)

# A way to ask the CPU where it is. Without a console, a machine that runs
# forever and one that is quietly making progress look identical; the program
# counter and the privilege level tell them apart in one call.
init_at = '''    s->common.class_ptr = &glue(riscv_cpu_class, MAX_XLEN);
    s->mem_map = mem_map;'''
init_new = '''    s->common.class_ptr = &glue(riscv_cpu_class, MAX_XLEN);
    dbg_cpu = s;
    s->mem_map = mem_map;'''
assert init_at in s, 'cpu init body not found'
s = s.replace(init_at, init_new, 1)

# The dump itself, declared after dump_regs so it can call it.
dump_at = 'static void dump_regs(RISCVCPUState *s)'
dump_new = '''static RISCVCPUState *dbg_cpu;
static void dump_regs(RISCVCPUState *s);

/* Called from the page: prints where the CPU is. See build-tinyemu.sh. */
void vm_dump_state(void)
{
    if (!dbg_cpu) {
        fprintf(stderr, "no cpu yet\\n");
        return;
    }
    dump_regs(dbg_cpu);
    fprintf(stderr, "power_down=%d mip=%08x mie=%08x insn=%\" PRIu64 \"\\n",
            dbg_cpu->power_down_flag, (uint32_t)dbg_cpu->mip,
            (uint32_t)dbg_cpu->mie, (uint64_t)dbg_cpu->insn_counter);
}

static void dump_regs(RISCVCPUState *s)'''
assert dump_at in s, 'dump_regs not found'
s = s.replace(dump_at, dump_new, 1)

p.write_text(s)
print('riscv_cpu.c: PMP and performance counter CSRs stubbed, state dump added')
PATCHCSR

# The guest finds its disk, reports its size, and then never reads a byte of
# it. These two lines say whether the request reaches the block device at all
# and whether it turns into a fetch.
python3 - <<'PATCHBLK'
import pathlib
p = pathlib.Path('block_net.c')
s = p.read_text()
a = '''    //    printf("bf_read_async: sector_num=%" PRId64 " n=%d\\n", sector_num, n);'''
b = '''    fprintf(stderr, "blk: read sector=%" PRId64 " n=%d\\n", sector_num, n);'''
assert a in s, 'read_async trace not found'
s = s.replace(a, b, 1)

a2 = 'static void bf_start_load_block(BlockDevice *bs, int block_num)\n{'
b2 = '''static void bf_start_load_block(BlockDevice *bs, int block_num)
{
    fprintf(stderr, "blk: fetching block %d\\n", block_num);'''
assert a2 in s, 'start_load_block not found'
s = s.replace(a2, b2, 1)

p.write_text(s)
print('block_net.c: read and fetch traced')
PATCHBLK

# The ISA string in the device tree is built by walking the misa bits in
# alphabetical order, which spells rv64acdfimsu. A kernel reads that string in
# canonical order -- base first, then m, a, f, d -- sees an 'a' where the base
# letter belongs, and concludes the CPU does not support rv64ima. It then stops
# with a BUG in smpboot.c, which is a long way from the actual complaint.
python3 - <<'PATCHISA'
import pathlib
p = pathlib.Path('riscv_machine.c')
s = p.read_text()
a = '''    q = isa_string;
    q += snprintf(isa_string, sizeof(isa_string), "rv%d", max_xlen);
    for(i = 0; i < 26; i++) {
        if (misa & (1 << i))
            *q++ = 'a' + i;
    }
    *q = '\\0';'''
b = '''    {
        /* Canonical order, which is the only order a kernel will read. The
           supervisor and user bits of misa are deliberately not letters here:
           they are not ISA extensions and a strict parser rejects them. */
        static const char canonical[] = "imafdqclbjtpvn";
        const char *c;

        q = isa_string;
        q += snprintf(isa_string, sizeof(isa_string), "rv%d", max_xlen);
        for (c = canonical; *c != '\\0'; c++) {
            if (misa & (1 << (*c - 'a')))
                *q++ = *c;
        }
        *q = '\\0';
    }'''
assert a in s, 'isa string not found'
p.write_text(s.replace(a, b, 1))
print('riscv_machine.c: ISA string put in canonical order')
PATCHISA

# The HTIF console is the only one this machine has, and OpenSBI will not bind a
# serial driver to a node with no address. Without a console the firmware and
# the kernel both boot in complete silence, which is indistinguishable from not
# booting at all.
python3 - <<'PATCHFDT'
import pathlib
p = pathlib.Path('riscv_machine.c')
s = p.read_text()
a = '''    fdt_begin_node(s, "htif");
    fdt_prop_str(s, "compatible", "ucb,htif0");
    fdt_end_node(s); /* htif */'''
b = '''    fdt_begin_node_num(s, "htif", HTIF_BASE_ADDR);
    fdt_prop_str(s, "compatible", "ucb,htif0");
    fdt_prop_tab_u64_2(s, "reg", HTIF_BASE_ADDR, 16);
    fdt_end_node(s); /* htif */'''
assert a in s, 'htif node not found'
s = s.replace(a, b, 1)

# And name it as the console, so the firmware does not have to guess which of
# the devices it found is the one to print on.
a2 = '''    fdt_begin_node(s, "chosen");'''
b2 = '''    fdt_begin_node(s, "chosen");
    fdt_prop_str(s, "stdout-path", "/htif@40008000");'''
assert a2 in s, 'chosen node not found'
s = s.replace(a2, b2, 1)

p.write_text(s)
print('riscv_machine.c: htif given an address and named as stdout')
PATCHFDT

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

# A second build that says what the guest CPU is doing wrong. TinyEMU keeps its
# diagnostics behind compile-time switches, and a machine that runs but prints
# nothing — no console, no disk reads — cannot be told apart from outside
# without them. The page loads this one only with ?debug.
if [ "${DEBUG_BUILD:-1}" = "1" ]; then
	make -f Makefile.js clean >/dev/null 2>&1 || rm -f ./*.js.o js/riscvemu64-wasm.*
	EMCFLAGS_EXTRA="-DDUMP_EXCEPTIONS -DDUMP_INVALID_MEM_ACCESS -DDUMP_MMU_EXCEPTIONS -DDUMP_INVALID_CSR"
	sed -i.bak "s|^EMCFLAGS=|EMCFLAGS=$EMCFLAGS_EXTRA |" Makefile.js
	emmake make -f Makefile.js -j"$(nproc)"
	cp js/riscvemu64-wasm.js "$OUT/riscvemu64-debug.js"
	cp js/riscvemu64-wasm.wasm "$OUT/riscvemu64-debug.wasm"
	# The glue looks for its own name; the copy has a different one.
	sed -i "s/riscvemu64-wasm\.wasm/riscvemu64-debug.wasm/g" "$OUT/riscvemu64-debug.js"
fi
ls -l "$OUT"
