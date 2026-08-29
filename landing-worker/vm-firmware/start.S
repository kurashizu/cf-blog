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

	la	t0, trap_entry
	csrw	mtvec, t0

	/* Everything the kernel should handle itself goes to S-mode. Bit 9 stays
	   here: that is the ecall this firmware exists to answer. */
	li	t0, 0xb1ff
	csrw	medeleg, t0
	li	t0, 0x222		/* SSIP | STIP | SEIP */
	csrw	mideleg, t0

	/* Let S-mode read the counters, or every timekeeping path traps. */
	li	t0, -1
	csrw	mcounteren, t0
	csrw	scounteren, t0

	la	sp, stack_top
	/* The trap handler swaps this in: the kernel's stack is not ours. */
	csrw	mscratch, sp

	/* Said before handing over, so that a silent kernel and a dead machine
	   are not the same thing to look at. */
	call	sbi_banner

	li	t0, (1 << 11)		/* MPP = S */
	csrw	mstatus, t0
	li	t0, 0x80200000
	csrw	mepc, t0
	csrr	a0, mhartid
	mv	a1, s1
	mret

	.align 4
	.globl trap_entry
trap_entry:
	csrrw	sp, mscratch, sp
	addi	sp, sp, -160
	sd	ra, 0(sp)
	sd	gp, 8(sp)
	sd	tp, 16(sp)
	sd	t0, 24(sp)
	sd	t1, 32(sp)
	sd	t2, 40(sp)
	sd	a0, 48(sp)
	sd	a1, 56(sp)
	sd	a2, 64(sp)
	sd	a3, 72(sp)
	sd	a4, 80(sp)
	sd	a5, 88(sp)
	sd	a6, 96(sp)
	sd	a7, 104(sp)
	sd	t3, 112(sp)
	sd	t4, 120(sp)
	sd	t5, 128(sp)
	sd	t6, 136(sp)

	mv	a0, sp			/* the frame, for C to read and write */
	call	sbi_trap

	ld	ra, 0(sp)
	ld	gp, 8(sp)
	ld	tp, 16(sp)
	ld	t0, 24(sp)
	ld	t1, 32(sp)
	ld	t2, 40(sp)
	ld	a0, 48(sp)
	ld	a1, 56(sp)
	ld	a2, 64(sp)
	ld	a3, 72(sp)
	ld	a4, 80(sp)
	ld	a5, 88(sp)
	ld	a6, 96(sp)
	ld	a7, 104(sp)
	ld	t3, 112(sp)
	ld	t4, 120(sp)
	ld	t5, 128(sp)
	ld	t6, 136(sp)
	addi	sp, sp, 160
	csrrw	sp, mscratch, sp
	mret

	.section .bss
	.align 12
stack_bottom:
	.space 16384
stack_top:
