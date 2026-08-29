/*
 * Entry and trap handling for krsz-sbi.
 *
 * TinyEMU starts the machine in M-mode at the base of RAM with a0 = hart id and
 * a1 = the device tree. This sets up the little that Linux needs from machine
 * mode, drops into S-mode at the kernel, and is only ever entered again through
 * the trap vector below.
 */
	.section .text.start, "ax"
	.globl _start
_start:
	csrw	mie, zero
	csrw	mip, zero
	mv	s1, a1			/* the device tree, for after the banner */

	/* lla, not la: la goes through the global offset table, and in a flat
	   binary with nothing to fill that table it loads zero — which is how
	   both the trap vector and the stack pointer came to be zero, and why
	   the kernel's first ecall landed at address zero and stayed there. */
	lla	t0, trap_entry
	csrw	mtvec, t0

	/* Everything the kernel should handle itself goes to S-mode. Two stay
	   here: the ecall this firmware exists to answer, and illegal
	   instructions, because the time CSR is one of them on this machine. */
	li	t0, 0xb1fb
	csrw	medeleg, t0
	li	t0, 0x222		/* SSIP | STIP | SEIP */
	csrw	mideleg, t0

	/* Let S-mode read the counters, or every timekeeping path traps. */
	li	t0, -1
	csrw	mcounteren, t0
	csrw	scounteren, t0

	lla	sp, stack_top
	/* The trap handler swaps this in: the kernel's stack is not ours. */
	csrw	mscratch, sp

	call	sbi_banner

	li	t0, (1 << 11)		/* MPP = S */
	csrw	mstatus, t0
	li	t0, 0x80200000
	csrw	mepc, t0
	csrr	a0, mhartid
	mv	a1, s1
	mret

/*
 * Every register is saved, not just the caller-saved ones: emulating an
 * instruction means writing its destination register, and the kernel is
 * entitled to have chosen any of them.
 */
	.align 4
	.globl trap_entry
trap_entry:
	csrrw	sp, mscratch, sp
	addi	sp, sp, -256
	sd	x1, 0(sp)
	sd	x3, 16(sp)
	sd	x4, 24(sp)
	sd	x5, 32(sp)
	sd	x6, 40(sp)
	sd	x7, 48(sp)
	sd	x8, 56(sp)
	sd	x9, 64(sp)
	sd	x10, 72(sp)
	sd	x11, 80(sp)
	sd	x12, 88(sp)
	sd	x13, 96(sp)
	sd	x14, 104(sp)
	sd	x15, 112(sp)
	sd	x16, 120(sp)
	sd	x17, 128(sp)
	sd	x18, 136(sp)
	sd	x19, 144(sp)
	sd	x20, 152(sp)
	sd	x21, 160(sp)
	sd	x22, 168(sp)
	sd	x23, 176(sp)
	sd	x24, 184(sp)
	sd	x25, 192(sp)
	sd	x26, 200(sp)
	sd	x27, 208(sp)
	sd	x28, 216(sp)
	sd	x29, 224(sp)
	sd	x30, 232(sp)
	sd	x31, 240(sp)
	/* The guest's own sp, which the swap above put in mscratch. */
	csrr	t0, mscratch
	sd	t0, 8(sp)

	mv	a0, sp			/* the frame, for C to read and write */
	call	sbi_trap

	ld	x1, 0(sp)
	ld	x3, 16(sp)
	ld	x4, 24(sp)
	ld	x5, 32(sp)
	ld	x6, 40(sp)
	ld	x7, 48(sp)
	ld	x8, 56(sp)
	ld	x9, 64(sp)
	ld	x10, 72(sp)
	ld	x11, 80(sp)
	ld	x12, 88(sp)
	ld	x13, 96(sp)
	ld	x14, 104(sp)
	ld	x15, 112(sp)
	ld	x16, 120(sp)
	ld	x17, 128(sp)
	ld	x18, 136(sp)
	ld	x19, 144(sp)
	ld	x20, 152(sp)
	ld	x21, 160(sp)
	ld	x22, 168(sp)
	ld	x23, 176(sp)
	ld	x24, 184(sp)
	ld	x25, 192(sp)
	ld	x26, 200(sp)
	ld	x27, 208(sp)
	ld	x28, 216(sp)
	ld	x29, 224(sp)
	ld	x30, 232(sp)
	ld	x31, 240(sp)
	addi	sp, sp, 256
	csrrw	sp, mscratch, sp
	mret

	.section .bss
	.align 12
stack_bottom:
	.space 16384
stack_top:
