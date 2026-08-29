/*
 * krsz-sbi: the smallest machine-mode firmware that will boot Linux on
 * TinyEMU, written because the alternatives do not fit this machine.
 *
 * OpenSBI is the obvious choice and does not work here. A current one programs
 * registers this 2019 emulator has never implemented; an old one has an HTIF
 * console driver that writes to a symbol in its own memory, because that is how
 * HTIF works on real hardware — while TinyEMU maps the same registers at a
 * fixed address. Either way the machine boots in silence, which is the one
 * thing that makes a problem like this unfixable.
 *
 * What Linux actually needs from machine mode is small: a timer, a way to print
 * a character, and the delegation set up before it starts. That is all this is.
 */

typedef unsigned long long u64;
typedef unsigned int u32;

/* TinyEMU's fixed addresses; see riscv_machine.c in its source. */
#define HTIF_BASE   0x40008000ULL
#define CLINT_BASE  0x02000000ULL
#define CLINT_MTIMECMP (CLINT_BASE + 0x4000)
#define CLINT_MTIME    (CLINT_BASE + 0xbff8)

#define MIP_STIP    (1UL << 5)
#define MIE_MTIE    (1UL << 7)

#define CAUSE_INTERRUPT     (1ULL << 63)
#define CAUSE_M_TIMER       7
#define CAUSE_ILLEGAL       2
#define CAUSE_ECALL_S       9

/* The counter Linux reads for every timestamp, and the one register this
   emulator does not have. */
#define CSR_TIME            0xc01

/*
 * The frame start.S pushes: x1 through x31, indexed by register number so an
 * emulated instruction can write whichever destination it names.
 */
struct frame {
	u64 x[31];
};

#define REG(f, n) ((f)->x[(n) - 1])
#define A0(f) REG(f, 10)
#define A1(f) REG(f, 11)
#define A6(f) REG(f, 16)
#define A7(f) REG(f, 17)

static void mmio_write32(u64 addr, u32 value)
{
	*(volatile u32 *)(unsigned long)addr = value;
}

static u32 mmio_read32(u64 addr)
{
	return *(volatile u32 *)(unsigned long)addr;
}

/*
 * The timer is a pair of 32-bit registers, not a 64-bit one: TinyEMU registers
 * the CLINT as a 32-bit device and asserts on anything wider. A single 64-bit
 * store to the compare register is silently nothing, which is why the kernel
 * set a deadline, went to sleep, and never woke up.
 */
static u64 clint_time(void)
{
	u32 hi, lo, hi_again;

	do {
		hi = mmio_read32(CLINT_MTIME + 4);
		lo = mmio_read32(CLINT_MTIME);
		hi_again = mmio_read32(CLINT_MTIME + 4);
	} while (hi != hi_again);

	return ((u64)hi << 32) | lo;
}

static void clint_set_timecmp(u64 when)
{
	/* High half first and out of reach, so the deadline is never briefly in
	   the past while the two halves disagree. */
	mmio_write32(CLINT_MTIMECMP + 4, 0xffffffffu);
	mmio_write32(CLINT_MTIMECMP, (u32)when);
	mmio_write32(CLINT_MTIMECMP + 4, (u32)(when >> 32));
}

/*
 * HTIF takes a 64-bit command in two halves and acts on the write to the upper
 * one: device 1, command 1, one character in the low byte.
 */
static void htif_putc(char c)
{
	mmio_write32(HTIF_BASE + 0, (unsigned char)c);
	mmio_write32(HTIF_BASE + 4, 0x01010000);
}

static void sbi_puts(const char *s)
{
	while (*s)
		htif_putc(*s++);
}

static void put_hex(u64 v)
{
	int i;
	sbi_puts("0x");
	for (i = 60; i >= 0; i -= 4) {
		unsigned d = (v >> i) & 0xf;
		htif_putc(d < 10 ? '0' + d : 'a' + d - 10);
	}
}

void sbi_banner(void)
{
	u64 mtvec;

	__asm__ volatile("csrr %0, mtvec" : "=r"(mtvec));
	sbi_puts("krsz-sbi: trap vector at ");
	put_hex(mtvec);
	sbi_puts(", handing over to the kernel\n");
}

/*
 * The first few traps, in full. A firmware this small is either right or
 * catastrophically wrong, and the difference is visible in the first handful of
 * calls the kernel makes; after that the noise would drown the boot.
 */
static int traps_logged;

static void set_timer(u64 when)
{
	clint_set_timecmp(when);
	/* The pending supervisor timer belongs to the old deadline. */
	__asm__ volatile("csrc mip, %0" :: "r"(MIP_STIP));
	__asm__ volatile("csrs mie, %0" :: "r"(MIE_MTIE));
}

/*
 * The calls Linux makes. Two eras of them: the v0.1 numbers a kernel falls back
 * on when nothing better is advertised, and the extensions a current one looks
 * for first -- TIME for the timer and DBCN for the console. A kernel built
 * without the legacy extension prints through DBCN or not at all, which is why
 * both are here.
 *
 * Anything else is refused rather than quietly succeeding: a kernel that asked
 * for something it needed should find out.
 */
#define SBI_SUCCESS          0
#define SBI_ERR_NOT_SUPPORTED (-2)

#define EXT_BASE   0x10
#define EXT_TIME   0x54494D45
#define EXT_DBCN   0x4442434E

static void handle_ecall(struct frame *f)
{
	/* Read every argument before writing any of them: a0 is both the first
	   argument and the first return value. */
	const u64 eid = A7(f), fid = A6(f);
	const u64 arg0 = A0(f), arg1 = A1(f);
	u64 error = SBI_SUCCESS, value = 0;

	switch (eid) {
	case 0x00:			/* legacy set_timer */
		set_timer(arg0);
		break;
	case 0x01:			/* legacy console_putchar */
		htif_putc((char)arg0);
		break;
	case 0x02:			/* legacy console_getchar */
		error = (u64)-1;
		break;
	case 0x03: case 0x04:		/* clear_ipi, send_ipi: one hart */
	case 0x05: case 0x06: case 0x07: /* fences: one hart, and coherent */
		break;
	case 0x08:			/* legacy shutdown */
		mmio_write32(HTIF_BASE + 0, 1);
		mmio_write32(HTIF_BASE + 4, 0);
		for (;;)
			;
	case EXT_TIME:
		if (fid == 0)
			set_timer(arg0);
		else
			error = SBI_ERR_NOT_SUPPORTED;
		break;
	case EXT_DBCN:
		switch (fid) {
		case 0: {		/* write: arg0 bytes at arg1 */
			const char *p = (const char *)(unsigned long)arg1;
			u64 i;
			for (i = 0; i < arg0; i++)
				htif_putc(p[i]);
			value = arg0;
			break;
		}
		case 1:			/* read: nothing is typed at it yet */
			value = 0;
			break;
		case 2:			/* write_byte */
			htif_putc((char)arg0);
			break;
		default:
			error = SBI_ERR_NOT_SUPPORTED;
			break;
		}
		break;
	case EXT_BASE:
		switch (fid) {
		/* 2.0, because that is the version a kernel wants to see before it
		   will consider the debug console extension at all. */
		case 0: value = 0x02000000; break;
		case 1: value = 0; break;	/* implementation id */
		case 2: value = 1; break;	/* implementation version */
		case 3:				/* probe_extension */
			value = (arg0 <= 0x08 || arg0 == EXT_TIME || arg0 == EXT_DBCN) ? 1 : 0;
			break;
		case 4: case 5: case 6:		/* mvendorid, marchid, mimpid */
			value = 0;
			break;
		default:
			error = SBI_ERR_NOT_SUPPORTED;
			break;
		}
		break;
	default:
		error = SBI_ERR_NOT_SUPPORTED;
		break;
	}

	A0(f) = error;
	A1(f) = value;
}

void sbi_trap(struct frame *f)
{
	u64 cause, epc;

	__asm__ volatile("csrr %0, mcause" : "=r"(cause));
	__asm__ volatile("csrr %0, mepc" : "=r"(epc));

	/* Emulated time reads are the overwhelming majority and say nothing, so
	   they are counted rather than printed; everything else is worth a line
	   until the boot is well past the point where it stops. */
	if ((cause & 0xff) != CAUSE_ILLEGAL && traps_logged < 200) {
		traps_logged++;
		sbi_puts("sbi: cause=");
		put_hex(cause & 0xff);
		if ((cause & 0xff) == CAUSE_ECALL_S) {
			sbi_puts(" eid=");
			put_hex(A7(f));
			sbi_puts(" fid=");
			put_hex(A6(f));
			sbi_puts(" arg0=");
			put_hex(A0(f));
		} else {
			sbi_puts(" epc=");
			put_hex(epc);
		}
		htif_putc('\n');
	}

	if (cause & CAUSE_INTERRUPT) {
		if ((cause & 0xff) == CAUSE_M_TIMER) {
			/* Hand it to S-mode and stop asking: the kernel will set
			   the next deadline itself. */
			__asm__ volatile("csrc mie, %0" :: "r"(MIE_MTIE));
			__asm__ volatile("csrs mip, %0" :: "r"(MIP_STIP));
			return;
		}
		return;
	}

	if ((cause & 0xff) == CAUSE_ILLEGAL) {
		/* The only instruction worth emulating here is a read of the time
		   CSR: TinyEMU has no such register, and on real hardware machine
		   mode is exactly where that gap is filled. */
		u64 insn;
		__asm__ volatile("csrr %0, mtval" : "=r"(insn));
		if ((insn & 0x7f) == 0x73 && ((insn >> 20) & 0xfff) == CSR_TIME) {
			unsigned rd = (unsigned)((insn >> 7) & 0x1f);
			if (rd != 0)
				REG(f, rd) = clint_time();
			__asm__ volatile("csrw mepc, %0" :: "r"(epc + 4));
			return;
		}
		sbi_puts("krsz-sbi: illegal instruction ");
		put_hex(insn);
		sbi_puts(" at ");
		put_hex(epc);
		htif_putc('\n');
		for (;;)
			;
	}

	if ((cause & 0xff) == CAUSE_ECALL_S) {
		handle_ecall(f);
		__asm__ volatile("csrw mepc, %0" :: "r"(epc + 4));
		return;
	}

	/* Nothing else should reach machine mode: everything the kernel can
	   handle was delegated to it before it started. */
	sbi_puts("krsz-sbi: unexpected trap in machine mode, cause=");
	put_hex(cause);
	sbi_puts(" epc=");
	put_hex(epc);
	sbi_puts("\n");
	for (;;)
		;
}
