#!/bin/sh
# Builds the kernel and root filesystem QEMU needs to boot Alpine on x86-64.
#
# This is the machine upstream qemu-wasm actually exercises with a disk, which
# is why it is the one the site ships. The `pc` board starts the kernel through
# a BIOS the build ships beside the binary, virtio-blk works there where it
# the serial console is a plain 16550 at ttyS0.
#
# The initramfs is Alpine's own mkinitfs rather than one built by hand -- the
# board has a UART before init runs, so it has somewhere to print.
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
# which is exactly what this is, and it leaves out the drivers for hardware that
# will never be here.
apk add --root "$ROOTFS" --initdb --no-cache \
	--repository "$MIRROR/main" \
	--repository "$MIRROR/community" \
	--allow-untrusted \
	alpine-base "linux-${KERNEL_FLAVOR}" busybox-extras \
	openrc util-linux e2fsprogs mkinitfs \
	nano vim htop curl bash file tree tmux ncurses-terminfo \
	iproute2 iputils busybox-openrc ca-certificates

mkdir -p "$ROOTFS/etc/apk"
cat > "$ROOTFS/etc/apk/repositories" <<EOF
$MIRROR/main
$MIRROR/community
EOF

# ── configuration ──────────────────────────────────────────────────────────
echo krsz-pc > "$ROOTFS/etc/hostname"
cat > "$ROOTFS/etc/hosts" <<'EOF'
127.0.0.1	localhost localhost.localdomain
127.0.1.1	krsz-pc
::1	localhost ip6-localhost ip6-loopback
EOF

cat > "$ROOTFS/etc/fstab" <<'EOF'
/dev/vda	/	ext4	rw,relatime	0 1
EOF

# ttyS0 is the 16550 every PC has and where -nographic points QEMU's stdio. A
# real serial port, so the getty goes there and window size works the usual way.
cat > "$ROOTFS/etc/inittab" <<'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

ttyS0::respawn:/sbin/getty -n -l /sbin/autologin -L 0 ttyS0 xterm-256color

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
  \033[38;5;114m██╗  ██╗██████╗ ███████╗███████╗      ██████╗  ██████╗\033[0m
  \033[38;5;114m██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝      ██╔══██╗██╔════╝\033[0m
  \033[38;5;114m█████╔╝ ██████╔╝███████╗  ███╔╝ █████╗██████╔╝██║\033[0m
  \033[38;5;114m██╔═██╗ ██╔══██╗╚════██║ ███╔╝  ╚════╝██╔═══╝ ██║\033[0m
  \033[38;5;114m██║  ██╗██║  ██║███████║███████╗      ██║     ╚██████╗\033[0m
  \033[38;5;114m╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝      ╚═╝      ╚═════╝\033[0m

  \033[1mAlpine Linux on an emulated x86-64 PC, in a browser tab.\033[0m
  QEMU itself, compiled to WebAssembly, on a thread beside the page.

  \033[38;5;114mTRY THIS\033[0m
    \033[38;5;222muname -a\033[0m          what you are actually running on
    \033[38;5;222mapk add <pkg>\033[0m     the mirror is reachable through the relay
    \033[38;5;222mtmux\033[0m              the mouse works
    \033[38;5;222mcat /proc/cpuinfo\033[0m the core this CPU reports

  \033[38;5;110mGOOD TO KNOW\033[0m
    The disk streams in 1 MiB pieces, so a command is slower the first time.
    What you change is kept in this browser and replayed at the next boot.
    Outbound traffic goes through a relay on this origin. Nothing can reach in.

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

# The gateway on the page runs a DHCP server, so the guest only has to ask --
# but something has to ask. Without this the NIC is present and down, and the
# network looks broken from inside while the relay sits there unused.
mkdir -p "$ROOTFS/etc/network"
cat > "$ROOTFS/etc/network/interfaces" <<'EOF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
EOF

# A resolver to fall back on if a lease ever arrives without one; udhcpc
# rewrites this when it does. The gateway answers DNS at its own address.
cat > "$ROOTFS/etc/resolv.conf" <<'EOF'
nameserver 192.168.86.1
EOF

mkdir -p "$ROOTFS/etc/profile.d"
cat > "$ROOTFS/etc/profile.d/krsz.sh" <<'EOF'
export PS1='\[\033[1;32m\]\u@krsz-pc\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ '
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
# The NIC needs configuring, and that is the networking service's job.
ln -sf /etc/init.d/networking "$ROOTFS/etc/runlevels/boot/networking" 2>/dev/null || true

# virtio_net is a module in Alpine's linux-virt, and the initramfs loads only
# what `modules=` on the cmdline names -- which is the disk's driver, because
# that is what root depends on. Nothing loads this one, so it is named here and
# modprobed before networking runs; otherwise there is no eth0 to configure.
cat > "$ROOTFS/etc/init.d/vmnet" <<'EOF'
#!/sbin/openrc-run
description="Loads the virtio NIC's driver, which nothing else does"
depend() {
	before net networking
}
start() {
	ebegin "Loading virtio_net"
	modprobe virtio_net 2>/dev/null
	# Give the PCI probe a moment to create the interface before networking
	# looks for it.
	for _ in 1 2 3 4 5 6 7 8 9 10; do
		[ -d /sys/class/net/eth0 ] && break
		sleep 0.2
	done
	[ -d /sys/class/net/eth0 ]
	eend $? "no virtio NIC -- check that networking is enabled on the page"
}
EOF
chmod +x "$ROOTFS/etc/init.d/vmnet"
ln -sf /etc/init.d/vmnet "$ROOTFS/etc/runlevels/boot/vmnet" 2>/dev/null || true

# hwdrivers scans a bus this machine does not have, and modules loads a list
# built for real hardware. Both cost seconds and neither finds anything.
rm -f "$ROOTFS/etc/runlevels/sysinit/hwdrivers" \
	"$ROOTFS/etc/runlevels/boot/modules" \
	"$ROOTFS/etc/runlevels/sysinit/mdev" || true

# ── kernel ─────────────────────────────────────────────────────────────────
KVER=$(ls "$ROOTFS/lib/modules" | head -n1)
echo "==> kernel modules version: $KVER"

# On x86 -kernel takes a bzImage, which is exactly what Alpine's vmlinuz-virt
# is, so it goes across as it stands.
cp "$ROOTFS/boot/vmlinuz-$KERNEL_FLAVOR" "$OUT/kernel"
echo "==> kernel: $(stat -c %s "$OUT/kernel") bytes"

# An initramfs is required: linux-virt builds VIRTIO_PCI in but leaves
# VIRTIO_BLK and EXT4_FS as modules, so without one the kernel enumerates the
# PCI device and then waits forever for a /dev/vda nothing is there to create.
#
# mkinitfs is given the features by hand rather than read from
# /etc/mkinitfs/mkinitfs.conf, because the default set drags in cryptsetup, lvm
# and raid probing that this machine has no use for and pays for on every boot.
cat > "$ROOTFS/etc/mkinitfs/mkinitfs.conf" <<'EOF'
features="base virtio ext4 scsi"
EOF
chroot "$ROOTFS" /sbin/mkinitfs -o /boot/initramfs-krsz "$KVER"
cp "$ROOTFS/boot/initramfs-krsz" "$OUT/initramfs"
echo "==> initramfs: $(stat -c %s "$OUT/initramfs") bytes"

# ── image ──────────────────────────────────────────────────────────────────
rm -rf "$ROOTFS/var/cache/apk"/* "$ROOTFS/tmp"/* 2>/dev/null || true
USED_KB=$(du -sk "$ROOTFS" | cut -f1)
SIZE_MB=$(( USED_KB / 1024 + SLACK_MB ))
echo "==> root filesystem: ${USED_KB} KiB used, building a ${SIZE_MB} MiB image"

# mke2fs -d fills the filesystem from a directory, so nothing here needs a loop
# device or privileges.
#
# With a journal, which it did without while the guest's writes died with the
# tab: there was nothing to recover, and leaving it out saved the space and the
# writes. Now that writes are kept in OPFS and replayed, every power-off is an
# unclean one -- the tab does not get to unmount -- and without a journal the
# only way back is a full scan of 410 MiB, which on this CPU takes minutes and
# ends in a reboot. The journal turns that into a few seconds.
mke2fs -q -t ext4 -d "$ROOTFS" -L krsz-pc -O ^metadata_csum,^64bit \
	"$OUT/rootfs.img" "${SIZE_MB}M"
echo "==> image: $(stat -c %s "$OUT/rootfs.img") bytes"

# Split for the uploader, which refuses anything over 300 MiB. The route
# reassembles them by name.
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
