#!/bin/sh
# Builds the three files TinyEMU needs to boot Alpine on riscv64: firmware, a
# kernel, an initramfs, and a root filesystem. Runs inside a riscv64 Alpine
# container under QEMU — see .github/workflows/build-rv-image.yml.
#
# The shape follows scripts/build-vm-image.sh, because the two machines differ
# in less than they share: same distribution, same streamed read-only image,
# same autologin to a shell. What is genuinely different is written down where
# it happens.
set -eu

ALPINE_VERSION="${ALPINE_VERSION:-3.24}"
KERNEL_FLAVOR="${KERNEL_FLAVOR:-lts}"
# Smaller than the x86 machine's: this one has no desktop, and every megabyte
# is a megabyte QEMU has to write while emulating a riscv64 CPU.
SLACK_MB="${SLACK_MB:-256}"
PART_MB="${PART_MB:-200}"
OUT="${OUT:-/out}"
ROOTFS=/rootfs
MIRROR="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}"

echo "==> host: $(uname -m), target Alpine v${ALPINE_VERSION} ${KERNEL_FLAVOR}"

apk add --no-cache e2fsprogs-extra mkinitfs opensbi

# ── root filesystem ────────────────────────────────────────────────────────
mkdir -p "$ROOTFS"
apk add --root "$ROOTFS" --initdb --no-cache \
	--repository "$MIRROR/main" \
	--repository "$MIRROR/community" \
	--allow-untrusted \
	alpine-base "linux-${KERNEL_FLAVOR}" busybox-extras \
	openrc util-linux e2fsprogs \
	nano vim htop curl bash file tree tmux ncurses-terminfo

mkdir -p "$ROOTFS/etc/apk"
cat > "$ROOTFS/etc/apk/repositories" <<EOF
$MIRROR/main
$MIRROR/community
EOF

# ── configuration ──────────────────────────────────────────────────────────
echo krsz-rv > "$ROOTFS/etc/hostname"
cat > "$ROOTFS/etc/hosts" <<'EOF'
127.0.0.1	localhost localhost.localdomain
127.0.1.1	krsz-rv
::1	localhost ip6-localhost ip6-loopback
EOF

# virtio-block, not an emulated IDE controller: TinyEMU's disks arrive over
# virtio-mmio and the kernel calls them vda.
cat > "$ROOTFS/etc/fstab" <<'EOF'
/dev/vda	/	ext4	rw,relatime	0 1
EOF

# The console is a virtio one, so the getty goes on hvc0 rather than a serial
# port. Same autologin as the x86 machine: this is a throwaway with nothing
# listening and no password to hand out.
cat > "$ROOTFS/etc/inittab" <<'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

hvc0::respawn:/sbin/getty -n -l /sbin/autologin -L 0 hvc0 xterm-256color

::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF

sed -i 's|^root:[^:]*:|root::|' "$ROOTFS/etc/shadow"
sed -i 's|^\(root:.*\):/bin/[a-z]*$|\1:/bin/bash|' "$ROOTFS/etc/passwd"

cat > "$ROOTFS/sbin/autologin" <<'EOF'
#!/bin/sh
exec /bin/login -f root
EOF
chmod +x "$ROOTFS/sbin/autologin"

cat > /tmp/motd.raw <<'MOTD'

  \033[38;5;114m██╗  ██╗██████╗ ███████╗███████╗       ██████╗ ██╗   ██╗\033[0m
  \033[38;5;114m██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝       ██╔══██╗██║   ██║\033[0m
  \033[38;5;114m█████╔╝ ██████╔╝███████╗  ███╔╝ ██████╗██████╔╝██║   ██║\033[0m
  \033[38;5;114m██╔═██╗ ██╔══██╗╚════██║ ███╔╝  ╚═════╝██╔══██╗╚██╗ ██╔╝\033[0m
  \033[38;5;114m██║  ██╗██║  ██║███████║███████╗       ██║  ██║ ╚████╔╝ \033[0m
  \033[38;5;114m╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝       ╚═╝  ╚═╝  ╚═══╝  \033[0m

  \033[1mAlpine Linux on an emulated 64-bit RISC-V machine, in a browser tab.\033[0m
  OpenSBI, a real kernel, and TinyEMU interpreting rv64gc as it runs --
  a different emulator from the x86 machine next door, and a slower one:
  it interprets where v86 compiles to WebAssembly.

  \033[38;5;114mTRY THIS\033[0m
    \033[38;5;222muname -a\033[0m          see what you are actually running on
    \033[38;5;222mcat /proc/cpuinfo\033[0m the ISA string this CPU reports
    \033[38;5;222mtmux\033[0m              terminal multiplexer

  \033[38;5;110mGOOD TO KNOW\033[0m
    There is no network on this machine. TinyEMU speaks raw ethernet
    frames and the relay next door speaks streams; bridging the two
    needs a TCP/IP stack in the page, which is not written yet.
    The disk is streamed in 1 MiB pieces as you touch it, so the first
    use of a command is slower than the second.
    Nothing is persisted here yet either -- power off and it is gone.

MOTD

: > "$ROOTFS/etc/motd"
while IFS= read -r line; do
	printf '%b\n' "$line" >> "$ROOTFS/etc/motd"
done < /tmp/motd.raw

cat > "$ROOTFS/etc/tmux.conf" <<'EOF'
set -g mouse on
set -g history-limit 10000
set -g default-terminal "screen-256color"
set -g status-style "bg=colour236,fg=colour252"
EOF

mkdir -p "$ROOTFS/etc/profile.d"
cat > "$ROOTFS/etc/profile.d/krsz.sh" <<'EOF'
export PS1='\[\033[1;32m\]\u@krsz-rv\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ '
alias ll='ls -la'

# A virtio console carries no window size either, so the same trick as the x86
# machine: ask the terminal where its cursor lands in the far corner.
alias rs='resize >/dev/null 2>&1'
case "$(tty)" in
	/dev/hvc*)
		if command -v resize >/dev/null; then
			resize >/dev/null 2>&1
			[ -n "${BASH:-}" ] && PROMPT_COMMAND='resize >/dev/null 2>&1'
		fi
		;;
esac
EOF

# ── services ───────────────────────────────────────────────────────────────
mkdir -p "$ROOTFS/etc/runlevels/boot" "$ROOTFS/etc/runlevels/default" "$ROOTFS/etc/runlevels/sysinit"
for svc in devfs dmesg sysfs; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/sysinit/$svc" 2>/dev/null || true
done
for svc in bootmisc hostname syslog; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/boot/$svc" 2>/dev/null || true
done
rm -f "$ROOTFS/etc/runlevels/sysinit/hwdrivers" \
	"$ROOTFS/etc/runlevels/boot/modules" \
	"$ROOTFS/etc/runlevels/sysinit/mdev" || true

# ── firmware, kernel, initramfs ────────────────────────────────────────────
KVER=$(ls "$ROOTFS/lib/modules" | head -n1)
echo "==> kernel modules version: $KVER"

# Everything the machine needs to reach its root is on virtio-mmio, which is
# how TinyEMU presents every device it has.
mkdir -p "$ROOTFS/etc/mkinitfs/features.d"
cat > "$ROOTFS/etc/mkinitfs/features.d/tinyemu.modules" <<'EOF'
kernel/drivers/virtio
kernel/drivers/block/virtio_blk.ko*
kernel/drivers/char/virtio_console.ko*
kernel/fs/ext4
EOF
cat > "$ROOTFS/etc/mkinitfs/mkinitfs.conf" <<'EOF'
features="base ext4 tinyemu"
EOF
mkinitfs -b "$ROOTFS" -o "$OUT/initramfs" "$KVER"

# TinyEMU copies the bios to the base of RAM and the kernel to the next 2 MB
# boundary after it, so a firmware smaller than 2 MB puts the kernel at
# 0x80200000 -- which is exactly where OpenSBI's fw_jump hands control on. The
# padding is what makes that arithmetic true rather than lucky.
FW=$(find / -name 'fw_jump.bin' -path '*opensbi*' 2>/dev/null | head -n1)
[ -n "$FW" ] || { echo "!! no OpenSBI fw_jump.bin in the opensbi package"; exit 1; }
cp "$FW" "$OUT/fw_jump.bin"
dd if=/dev/zero bs=1M count=2 2>/dev/null | cat "$OUT/fw_jump.bin" - | head -c 2097152 > "$OUT/bios.bin"
rm -f "$OUT/fw_jump.bin"

# The kernel has to be a raw Image: OpenSBI jumps to it, and there is nothing
# in between to decompress anything.
KERNEL="$ROOTFS/boot/vmlinuz-$KERNEL_FLAVOR"
[ -f "$KERNEL" ] || KERNEL=$(ls "$ROOTFS"/boot/vmlinuz* | head -n1)
case "$(head -c 2 "$KERNEL" | od -An -tx1 | tr -d ' \n')" in
	1f8b) echo "==> kernel is gzipped, unpacking"; gunzip -c "$KERNEL" > "$OUT/kernel" ;;
	*) cp "$KERNEL" "$OUT/kernel" ;;
esac

# ── image ──────────────────────────────────────────────────────────────────
USED_MB=$(du -sm "$ROOTFS" | cut -f1)
IMAGE_MB=$((USED_MB + SLACK_MB))
echo "==> rootfs uses ${USED_MB} MB, image will be ${IMAGE_MB} MB"

# mke2fs -d fills the filesystem from a directory, so nothing here needs a loop
# device or privileges.
mke2fs -q -t ext4 -d "$ROOTFS" -L krsz-rv -O ^has_journal,^metadata_csum,^64bit \
	"$OUT/rootfs.img" "${IMAGE_MB}M"

# Split for the uploader, which refuses anything over 300 MiB.
SIZE=$(stat -c %s "$OUT/rootfs.img")
PART_BYTES=$((PART_MB * 1024 * 1024))
PARTS=$(( (SIZE + PART_BYTES - 1) / PART_BYTES ))
i=0
while [ "$i" -lt "$PARTS" ]; do
	dd if="$OUT/rootfs.img" of="$OUT/rootfs.img.$(printf '%03d' "$i")" \
		bs=1M skip=$((i * PART_MB)) count="$PART_MB" 2>/dev/null
	i=$((i + 1))
done
rm -f "$OUT/rootfs.img"

ls -l "$OUT"
