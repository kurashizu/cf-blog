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
#define CAUSE_ECALL_S       9

/* The frame start.S pushes, in the order it pushes it. */
struct frame {
	u64 ra, gp, tp, t0, t1, t2;
	u64 a0, a1, a2, a3, a4, a5, a6, a7;
	u64 t3, t4, t5, t6;
};

static void mmio_write32(u64 addr, u32 value)
{
	*(volatile u32 *)(unsigned long)addr = value;
}

static u64 mmio_read64(u64 addr)
{
	return *(volatile u64 *)(unsigned long)addr;
}

static void mmio_write64(u64 addr, u64 value)
{
	*(volatile u64 *)(unsigned long)addr = value;
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
	mmio_write64(CLINT_MTIMECMP, when);
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
	const u64 eid = f->a7, fid = f->a6;
	const u64 arg0 = f->a0, arg1 = f->a1;
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

	f->a0 = error;
	f->a1 = value;
}

void sbi_trap(struct frame *f)
{
	u64 cause, epc;

	__asm__ volatile("csrr %0, mcause" : "=r"(cause));
	__asm__ volatile("csrr %0, mepc" : "=r"(epc));

	if (traps_logged < 8) {
		u64 tval;
		__asm__ volatile("csrr %0, mtval" : "=r"(tval));
		traps_logged++;
		sbi_puts("krsz-sbi: trap cause=");
		put_hex(cause);
		sbi_puts(" epc=");
		put_hex(epc);
		sbi_puts(" tval=");
		put_hex(tval);
		sbi_puts(" a7=");
		put_hex(f->a7);
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

/* The timer is read through this rather than the time CSR so that the counter
   and the deadline agree; nothing else uses it yet. */
u64 sbi_time(void)
{
	return mmio_read64(CLINT_MTIME);
}
