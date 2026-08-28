#!/bin/sh
# Builds the three files v86 needs to boot Alpine: a kernel, an initramfs, and
# an ext4 root filesystem. Runs inside a 32-bit Alpine container so apk, mkinitfs
# and the target binaries are all native x86 — see .github/workflows/build-vm-image.yml.
#
# Why not a bootable disk image: v86 can load a bzimage and initrd directly and
# take the kernel command line as an option, which removes the bootloader, the
# partition table and the loop-device mounting that a disk image would need. It
# also means the cmdline is controlled by the page instead of typed into a
# bootloader prompt.
set -eu

ALPINE_VERSION="${ALPINE_VERSION:-3.24}"
KERNEL_FLAVOR="${KERNEL_FLAVOR:-lts}"
IMAGE_MB="${IMAGE_MB:-256}"
# Free space to leave on top of the installed system, for apk and scratch files.
SLACK_MB="${SLACK_MB:-96}"
# `wrangler r2 object put` refuses anything larger, and a smaller image is less
# to stream anyway.
MAX_MB=290
OUT="${OUT:-/out}"
ROOTFS=/rootfs
MIRROR="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VERSION}"

echo "==> host: $(uname -m), target Alpine v${ALPINE_VERSION} ${KERNEL_FLAVOR}"

apk add --no-cache e2fsprogs-extra mkinitfs

# linux-firmware-none satisfies linux-lts's linux-firmware-any dependency with an
# empty package. The real one is hundreds of MB of vendor blobs — GPU firmware,
# WiFi, and so on — none of which exists on an emulated PC.

# ── root filesystem ────────────────────────────────────────────────────────
mkdir -p "$ROOTFS"
apk add --root "$ROOTFS" --initdb --no-cache \
	--repository "$MIRROR/main" \
	--repository "$MIRROR/community" \
	--allow-untrusted \
	alpine-base "linux-${KERNEL_FLAVOR}" linux-firmware-none busybox-extras \
	openrc util-linux e2fsprogs \
	nano vim htop curl bash file tree

mkdir -p "$ROOTFS/etc/apk"
cat > "$ROOTFS/etc/apk/repositories" <<EOF
$MIRROR/main
$MIRROR/community
EOF

# ── configuration ──────────────────────────────────────────────────────────
echo krsz-vm > "$ROOTFS/etc/hostname"

cat > "$ROOTFS/etc/fstab" <<'EOF'
/dev/sda	/	ext4	rw,relatime	0 1
EOF

# A serial getty is what the page attaches to. Keeping tty1 as well means the
# VGA screen still shows something if the serial view is ever swapped out.
cat > "$ROOTFS/etc/inittab" <<'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

ttyS0::respawn:/sbin/getty -L 0 ttyS0 vt100
tty1::respawn:/sbin/getty 38400 tty1

::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF

# This is a throwaway demo machine with no network services listening, and
# prompting for a password nobody was given would just make it unusable.
sed -i 's|^root:[^:]*:|root::|' "$ROOTFS/etc/shadow"

cat > "$ROOTFS/etc/motd" <<'EOF'

   Alpine Linux on v86 — a 32-bit x86 PC emulated in your browser.
   Nothing here is persisted: everything is gone when you power off.

EOF

mkdir -p "$ROOTFS/etc/profile.d"
cat > "$ROOTFS/etc/profile.d/krsz.sh" <<'EOF'
export PS1='\[\033[1;32m\]\u@krsz-vm\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ '
alias ll='ls -la'
EOF

# ── services ───────────────────────────────────────────────────────────────
# hwdrivers is the coldplug service that modprobes a driver for every device it
# finds on the PCI bus. On v86 that is what triple-faults the machine and sends
# it back to the BIOS, so a fixed virtual machine with known hardware simply
# does not run hardware autodetection.
for svc in devfs dmesg sysfs; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/sysinit/$svc" 2>/dev/null || true
done
mkdir -p "$ROOTFS/etc/runlevels/boot" "$ROOTFS/etc/runlevels/default" "$ROOTFS/etc/runlevels/sysinit"
for svc in bootmisc hostname syslog; do
	ln -sf "/etc/init.d/$svc" "$ROOTFS/etc/runlevels/boot/$svc" 2>/dev/null || true
done
# Deliberately absent from every runlevel: hwdrivers, mdev-conf coldplug, modules.
rm -f "$ROOTFS/etc/runlevels/sysinit/hwdrivers" \
	"$ROOTFS/etc/runlevels/boot/modules" \
	"$ROOTFS/etc/runlevels/sysinit/mdev" || true

# ── kernel + initramfs ─────────────────────────────────────────────────────
KVER=$(ls "$ROOTFS/lib/modules" | head -n1)
echo "==> kernel modules version: $KVER"

# Only the features needed to mount an ext4 root off the emulated IDE disk.
# Every extra feature is another driver probed at boot on hardware v86 may only
# partly implement.
#
# `ata` supplies the controller driver, but the block device itself comes from
# sd_mod in `scsi` — without it libata enumerates the disk and no /dev/sda ever
# appears, which is exactly how the first build failed to mount its root.
#
# The stock `ata`/`scsi` features bring up the SCSI core and the controller, but
# the guest still came up with host0/target0:0:0:0 present and no /dev/sda —
# nothing had bound sd_mod, the upper-level disk driver. Listing the modules
# explicitly is deterministic in a way that feature names are not.
mkdir -p "$ROOTFS/etc/mkinitfs/features.d"
cat > "$ROOTFS/etc/mkinitfs/features.d/v86.modules" <<'EOF'
kernel/drivers/ata
kernel/drivers/scsi/scsi_mod.ko*
kernel/drivers/scsi/sd_mod.ko*
kernel/drivers/scsi/sr_mod.ko*
kernel/drivers/cdrom
EOF

cat > "$ROOTFS/etc/mkinitfs/mkinitfs.conf" <<'EOF'
features="base ext4 v86"
EOF

cp "$ROOTFS/boot/vmlinuz-${KERNEL_FLAVOR}" "$OUT/vmlinuz"
chroot "$ROOTFS" /sbin/mkinitfs -c /etc/mkinitfs/mkinitfs.conf -o /boot/initramfs-v86 "$KVER"
cp "$ROOTFS/boot/initramfs-v86" "$OUT/initramfs"

# Prove the disk drivers are actually in there rather than finding out by
# watching a guest fail to mount its root.
echo "==> initramfs storage modules:"
mkdir -p /tmp/initcheck && (cd /tmp/initcheck && gzip -dc "$OUT/initramfs" | cpio -idm 2>/dev/null) || true
find /tmp/initcheck -name 'sd_mod*' -o -name 'ata_piix*' -o -name 'ext4*' | sed 's|/tmp/initcheck||' || true

# The .ko being present is not enough: modprobe resolves through modules.dep, and
# a module packed without a dep entry silently fails to load — which is exactly
# how the guest ended up with an enumerated disk and no /dev/sda.
echo "==> modules.dep entries:"
find /tmp/initcheck -name modules.dep -exec grep -cE 'sd_mod|ata_piix' {} + 2>/dev/null || echo "!! no modules.dep"
find /tmp/initcheck -name modules.dep -exec grep -E 'sd_mod|ata_piix' {} + 2>/dev/null | head -5 || true


# The kernel and initramfs are loaded whole by v86, so they should not also sit
# inside the root filesystem taking up space in the streamed image.
rm -rf "$ROOTFS/boot"/vmlinuz-* "$ROOTFS/boot"/initramfs-* "$ROOTFS/boot"/System.map-* "$ROOTFS/boot"/config-*

# ── ext4 image ─────────────────────────────────────────────────────────────
# mke2fs -d populates the filesystem from a directory, so no loop mount and no
# privileged container are needed. No partition table either: the kernel is told
# root=/dev/sda, the whole disk.
#
# Size follows the content rather than a fixed number: too small fails the build
# outright, and too large is a bigger object to stream and to upload. IMAGE_MB is
# the floor, MAX_MB the ceiling the uploader can accept.
USED_MB=$(( $(du -sk "$ROOTFS" | cut -f1) / 1024 ))
NEEDED_MB=$(( USED_MB + SLACK_MB ))
[ "$NEEDED_MB" -lt "$IMAGE_MB" ] && NEEDED_MB="$IMAGE_MB"
if [ "$NEEDED_MB" -gt "$MAX_MB" ]; then
	if [ "$USED_MB" -ge "$MAX_MB" ]; then
		echo "!! rootfs is ${USED_MB} MB, which leaves no room under the ${MAX_MB} MB ceiling" >&2
		exit 1
	fi
	echo "==> clamping ${NEEDED_MB} MB to the ${MAX_MB} MB ceiling"
	NEEDED_MB="$MAX_MB"
fi
echo "==> rootfs uses ${USED_MB} MB, building a ${NEEDED_MB} MB image"

mke2fs -q -t ext4 -b 4096 -d "$ROOTFS" -F -L krsz-root "$OUT/rootfs.img" "$((NEEDED_MB * 256))"

echo "==> built:"
ls -l "$OUT"
for f in vmlinuz initramfs rootfs.img; do
	echo "$f size=$(stat -c %s "$OUT/$f")"
done
