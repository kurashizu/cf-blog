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

void sbi_banner(void)
{
	sbi_puts("krsz-sbi: handing over to the kernel\n");
}

static void set_timer(u64 when)
{
	mmio_write64(CLINT_MTIMECMP, when);
	/* The pending supervisor timer belongs to the old deadline. */
	__asm__ volatile("csrc mip, %0" :: "r"(MIP_STIP));
	__asm__ volatile("csrs mie, %0" :: "r"(MIE_MTIE));
}

/*
 * The v0.1 calls Linux still falls back on, plus the two v0.2 extensions it
 * looks for. Anything else is refused rather than silently ignored: a kernel
 * that asked for something it needed should find out.
 */
#define SBI_SUCCESS          0
#define SBI_ERR_NOT_SUPPORTED (-2)

#define EXT_BASE   0x10
#define EXT_TIME   0x54494D45

static void handle_ecall(struct frame *f)
{
	u64 eid = f->a7, fid = f->a6;

	f->a0 = SBI_SUCCESS;

	switch (eid) {
	case 0x00:			/* legacy set_timer */
		set_timer(f->a0);
		return;
	case 0x01:			/* legacy console_putchar */
		htif_putc((char)f->a0);
		return;
	case 0x02:			/* legacy console_getchar */
		f->a0 = (u64)-1;
		return;
	case 0x03: case 0x04:		/* clear_ipi, send_ipi: one hart */
	case 0x05: case 0x06: case 0x07: /* fences: one hart, and TinyEMU is coherent */
		return;
	case 0x08:			/* legacy shutdown */
		mmio_write32(HTIF_BASE + 0, 1);
		mmio_write32(HTIF_BASE + 4, 0);
		for (;;)
			;
	case EXT_TIME:
		if (fid == 0) {
			set_timer(f->a0);
			f->a1 = 0;
		} else {
			f->a0 = SBI_ERR_NOT_SUPPORTED;
		}
		return;
	case EXT_BASE:
		switch (fid) {
		case 0: f->a1 = 0x00000002; break;	/* spec version 0.2 */
		case 1: f->a1 = 0; break;		/* implementation id */
		case 2: f->a1 = 1; break;		/* implementation version */
		case 3:					/* probe_extension */
			f->a1 = (f->a0 <= 0x08 || f->a0 == EXT_TIME) ? 1 : 0;
			break;
		case 4: f->a1 = 0; break;		/* mvendorid */
		case 5: f->a1 = 0; break;		/* marchid */
		case 6: f->a1 = 0; break;		/* mimpid */
		default: f->a0 = SBI_ERR_NOT_SUPPORTED; return;
		}
		f->a0 = SBI_SUCCESS;
		return;
	default:
		f->a0 = SBI_ERR_NOT_SUPPORTED;
		f->a1 = 0;
		return;
	}
}

void sbi_trap(struct frame *f)
{
	u64 cause, epc;

	__asm__ volatile("csrr %0, mcause" : "=r"(cause));

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
		__asm__ volatile("csrr %0, mepc" : "=r"(epc));
		__asm__ volatile("csrw mepc, %0" :: "r"(epc + 4));
		return;
	}

	/* Nothing else should reach machine mode: everything the kernel can
	   handle was delegated to it before it started. */
	sbi_puts("krsz-sbi: unexpected trap in machine mode, stopping\n");
	for (;;)
		;
}

/* The timer is read through this rather than the time CSR so that the counter
   and the deadline agree; nothing else uses it yet. */
u64 sbi_time(void)
{
	return mmio_read64(CLINT_MTIME);
}
