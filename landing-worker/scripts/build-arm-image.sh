#!/bin/sh
# Builds the kernel and root filesystem QEMU needs to boot Alpine on arm64.
#
# Shorter than its riscv64 sibling, and the reasons are worth naming. There is
# no firmware to write: QEMU's `virt` board starts the kernel itself, where
# TinyEMU needed an SBI implementation of our own. There is no hand-built
# initramfs either: `virt` gives the kernel a PL011 UART that exists before
# init runs, so Alpine's own mkinitfs has somewhere to print and its console
# does not arrive late as a module. And arm64 runners are real, so nothing here
# runs under emulation.
#
# What is shared with the other two machines is the shape: same distribution,
# same read-only image streamed in 1 MiB pieces, same autologin to a shell.
set -eu

ALPINE_VERSION="${ALPINE_VERSION:-3.24}"
KERNEL_FLAVOR="${KERNEL_FLAVOR:-virt}"
SLACK_MB="${SLACK_MB:-256}"
PART_MB="${PART_MB:-200}"
OUT="${OUT:-/out}"
ROOTFS=/rootfs
MIRROR="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}"

echo "==> host: $(uname -m), target Alpine v${ALPINE_VERSION} ${KERNEL_FLAVOR}"

apk add --no-cache e2fsprogs-extra cpio

# ── root filesystem ────────────────────────────────────────────────────────
mkdir -p "$ROOTFS"
# linux-virt rather than linux-lts: it is Alpine's kernel for virtual machines,
# which is exactly what this is, and it carries virtio built in rather than as
# modules an initramfs has to find first.
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
echo krsz-arm > "$ROOTFS/etc/hostname"
cat > "$ROOTFS/etc/hosts" <<'EOF'
127.0.0.1	localhost localhost.localdomain
127.0.1.1	krsz-arm
::1	localhost ip6-localhost ip6-loopback
EOF

cat > "$ROOTFS/etc/fstab" <<'EOF'
/dev/vda	/	ext4	rw,relatime	0 1
EOF

# ttyAMA0 is the PL011 the `virt` board puts at 0x9000000, and -nographic points
# QEMU's stdio at it. A real serial port rather than the riscv64 machine's
# virtio console, so the getty goes there and window size works the usual way.
cat > "$ROOTFS/etc/inittab" <<'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

ttyAMA0::respawn:/sbin/getty -n -l /sbin/autologin -L 0 ttyAMA0 xterm-256color

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

  \033[38;5;114m██╗  ██╗██████╗ ███████╗███████╗       █████╗ ██████╗ ███╗   ███╗\033[0m
  \033[38;5;114m██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝      ██╔══██╗██╔══██╗████╗ ████║\033[0m
  \033[38;5;114m█████╔╝ ██████╔╝███████╗  ███╔╝ █████╗███████║██████╔╝██╔████╔██║\033[0m
  \033[38;5;114m██╔═██╗ ██╔══██╗╚════██║ ███╔╝  ╚════╝██╔══██║██╔══██╗██║╚██╔╝██║\033[0m
  \033[38;5;114m██║  ██╗██║  ██║███████║███████╗      ██║  ██║██║  ██║██║ ╚═╝ ██║\033[0m
  \033[38;5;114m╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝      ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝\033[0m

  \033[1mAlpine Linux on an emulated 64-bit ARM machine, in a browser tab.\033[0m
  This one is QEMU itself, compiled to WebAssembly: the same emulator you
  would run on a desktop, translating aarch64 to wasm as it goes, on a
  worker thread sharing memory with the page.

  \033[38;5;114mTRY THIS\033[0m
    \033[38;5;222muname -a\033[0m          see what you are actually running on
    \033[38;5;222mcat /proc/cpuinfo\033[0m the core this CPU reports
    \033[38;5;222mtmux\033[0m              terminal multiplexer

  \033[38;5;110mGOOD TO KNOW\033[0m
    There is no network on this machine yet. QEMU's user-mode stack wants
    a host socket API the browser does not have.
    The disk is streamed in 1 MiB pieces as you touch it, so the first
    use of a command is slower than the second.
    Writes stay in the tab. Power off and they are gone.

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
export PS1='\[\033[1;32m\]\u@krsz-arm\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ '
alias ll='ls -la'
EOF

# ── services ───────────────────────────────────────────────────────────────
mkdir -p "$ROOTFS/etc/runlevels/boot" "$ROOTFS/etc/runlevels/default" "$ROOTFS/etc/runlevels/sysinit"
for svc in devfs dmesg sysfs; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/sysinit/$svc" 2>/dev/null || true
done
for svc in bootmisc hostname; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/boot/$svc" 2>/dev/null || true
done
# hwdrivers scans a bus this machine does not have, and modules loads a list
# built for real hardware. Both cost seconds and neither finds anything.
rm -f "$ROOTFS/etc/runlevels/sysinit/hwdrivers" \
	"$ROOTFS/etc/runlevels/boot/modules" \
	"$ROOTFS/etc/runlevels/sysinit/mdev" || true

# ── kernel ─────────────────────────────────────────────────────────────────
KVER=$(ls "$ROOTFS/lib/modules" | head -n1)
echo "==> kernel modules version: $KVER"

# QEMU's -kernel takes an uncompressed Image on arm64. Alpine ships exactly that
# as vmlinuz-virt, despite the name.
cp "$ROOTFS/boot/vmlinuz-$KERNEL_FLAVOR" "$OUT/kernel"
echo "==> kernel: $(stat -c %s "$OUT/kernel") bytes"

# No initramfs. linux-virt has virtio-blk and ext4 built in, so the kernel
# mounts /dev/vda itself -- which is the whole reason for choosing that flavour
# over lts, and what let the riscv64 machine's hand-built initramfs stay there.

# ── image ──────────────────────────────────────────────────────────────────
rm -rf "$ROOTFS/var/cache/apk"/* "$ROOTFS/tmp"/* 2>/dev/null || true
USED_KB=$(du -sk "$ROOTFS" | cut -f1)
SIZE_MB=$(( USED_KB / 1024 + SLACK_MB ))
echo "==> root filesystem: ${USED_KB} KiB used, building a ${SIZE_MB} MiB image"

# mke2fs -d fills the filesystem from a directory, so nothing here needs a loop
# device or privileges.
mke2fs -q -t ext4 -d "$ROOTFS" -L krsz-arm -O ^has_journal,^metadata_csum,^64bit \
	"$OUT/rootfs.img" "${SIZE_MB}M"
echo "==> image: $(stat -c %s "$OUT/rootfs.img") bytes"

# Split for the uploader, which refuses anything over 300 MiB. The route
# reassembles them by name, the same as the riscv64 image.
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
echo "==> split into $PARTS parts of ${PART_MB} MiB"

ls -l "$OUT"
