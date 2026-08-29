/* TinyEMU copies the firmware to the base of RAM and the kernel to the next
   2 MB boundary, so this has to start at 0x80000000 and stay well under 2 MB. */
OUTPUT_ARCH(riscv)
ENTRY(_start)
SECTIONS
{
	. = 0x80000000;
	.text : { *(.text.start) *(.text*) }
	.rodata : { *(.rodata*) }
	.data : { *(.data*) *(.sdata*) }
	.bss : { *(.bss*) *(.sbss*) *(COMMON) }
	. = ALIGN(8);
	_end = .;
}
