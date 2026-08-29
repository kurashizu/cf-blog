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
# The desktop packages ate the old 96 MB down to single digits, which is not
# enough to install anything -- and npm pulling a toolchain wants a great deal
# more than that. Free space costs only R2 storage: blocks are fetched as the
# guest touches them, so an image with room in it is not a slower one.
SLACK_MB="${SLACK_MB:-512}"
# The root filesystem is stored as parts because `wrangler r2 object put` refuses
# anything over 300 MiB; the disk proxy maps a byte offset back to the part that
# holds it, so the guest sees one contiguous disk.
PART_MB="${PART_MB:-200}"
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
	nano vim htop curl bash file tree tmux ncurses-terminfo eudev \
	openbox xterm xorg-server xf86-input-libinput xinit xsetroot feh tint2 \
	pcmanfm xfce4-terminal mousepad xarchiver galculator yad xclip git \
	netsurf adwaita-icon-theme \
	font-misc-misc ttf-dejavu

mkdir -p "$ROOTFS/etc/apk"
cat > "$ROOTFS/etc/apk/repositories" <<EOF
$MIRROR/main
$MIRROR/community
EOF

# ── configuration ──────────────────────────────────────────────────────────
echo krsz-vm > "$ROOTFS/etc/hostname"

# xauth resolves the hostname to name the display's auth entry, and with nothing
# to resolve it to it rejects its own argument -- five lines of "bad display
# name krsz-vm:0" every time startx runs.
cat > "$ROOTFS/etc/hosts" <<'EOF'
127.0.0.1	localhost localhost.localdomain
127.0.1.1	krsz-vm
::1	localhost ip6-localhost ip6-loopback
EOF

cat > "$ROOTFS/etc/fstab" <<'EOF'
/dev/sda	/	ext4	rw,relatime	0 1
EOF

# v86's network backend runs a DHCP server, so the guest only has to ask.
mkdir -p "$ROOTFS/etc/network"
cat > "$ROOTFS/etc/network/interfaces" <<'EOF'
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
EOF

# A resolver to fall back on if the lease ever arrives without one; udhcpc
# rewrites this when it does.
cat > "$ROOTFS/etc/resolv.conf" <<'EOF'
nameserver 192.168.86.1
EOF

# A serial getty is what the page attaches to. The terminal type matters: tmux
# only turns mouse reporting on for a terminal whose terminfo says it has a
# mouse, and vt100 -- the usual default for a serial line -- does not.
# Keeping tty1 as well means the
# VGA screen still shows something if the serial view is ever swapped out.
cat > "$ROOTFS/etc/inittab" <<'EOF'
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default

ttyS0::respawn:/sbin/getty -n -l /sbin/autologin -L 0 ttyS0 xterm-256color
tty1::respawn:/sbin/getty -n -l /sbin/autologin 38400 tty1

::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF

# This is a throwaway demo machine with no network services listening, and
# prompting for a password nobody was given would just make it unusable.
sed -i 's|^root:[^:]*:|root::|' "$ROOTFS/etc/shadow"

# bash rather than ash for the login shell: it understands the \[ \] wrapping in
# the prompt below, and it has PROMPT_COMMAND, which is how the terminal size
# stays right for a whole session rather than only at login.
sed -i 's|^\(root:.*\):/bin/[a-z]*$|\1:/bin/bash|' "$ROOTFS/etc/passwd"

# getty -l runs this instead of /bin/login. Going through `login -f` rather than
# exec'ing a shell directly keeps the profile, the motd and the login record.
cat > "$ROOTFS/sbin/autologin" <<'EOF'
#!/bin/sh
exec /bin/login -f root
EOF
chmod +x "$ROOTFS/sbin/autologin"

cat > /tmp/motd.raw <<'MOTD'

  \033[38;5;180m██╗  ██╗██████╗ ███████╗███████╗       ██╗   ██╗███╗   ███╗\033[0m
  \033[38;5;180m██║ ██╔╝██╔══██╗██╔════╝╚══███╔╝       ██║   ██║████╗ ████║\033[0m
  \033[38;5;180m█████╔╝ ██████╔╝███████╗  ███╔╝ ██████╗██║   ██║██╔████╔██║\033[0m
  \033[38;5;180m██╔═██╗ ██╔══██╗╚════██║ ███╔╝  ╚═════╝╚██╗ ██╔╝██║╚██╔╝██║\033[0m
  \033[38;5;180m██║  ██╗██║  ██║███████║███████╗        ╚████╔╝ ██║ ╚═╝ ██║\033[0m
  \033[38;5;180m╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝         ╚═══╝  ╚═╝     ╚═╝\033[0m

  \033[1mAlpine Linux on an emulated 32-bit x86 PC, inside a browser tab.\033[0m
  No hypervisor underneath -- SeaBIOS, a real kernel, and v86 translating
  x86 to WebAssembly as it runs.

  \033[38;5;114mTRY THIS\033[0m
    \033[38;5;222muname -a\033[0m          see what you are actually running on
    \033[38;5;222mtmux\033[0m              terminal multiplexer, mouse reporting is on
    \033[38;5;222mstartx\033[0m            an openbox desktop; right-click it for the menu
    \033[38;5;222mapk add <pkg>\033[0m     the mirror is reachable through the relay
    \033[38;5;222mping krsz.in\033[0m      answered by the emulator's own stack
    \033[38;5;222mrs\033[0m                re-fit the shell after resizing the window

  \033[38;5;110mGOOD TO KNOW\033[0m
    What you change is kept in this browser and replayed at the next
    boot -- CONFIG has the switch, and the button that wipes it.
    The disk is streamed in 1 MiB pieces as you touch it, so the first
    use of a command is slower than the second.
    Outbound traffic goes through a relay on the page's own origin,
    rate limited per client. There is no NAT to punch: nothing on
    the internet can reach in.

MOTD

# login cats /etc/motd verbatim, so the escapes have to be real bytes by then —
# printf %b expands them; echo -e is not portable to busybox's shell.
: > "$ROOTFS/etc/motd"
while IFS= read -r line; do
	printf '%b\n' "$line" >> "$ROOTFS/etc/motd"
done < /tmp/motd.raw

# Mouse reporting on, because the whole point of a terminal in a browser tab is
# that a pointer is already there.
cat > "$ROOTFS/etc/tmux.conf" <<'EOF'
set -g mouse on
set -g history-limit 10000
set -g default-terminal "screen-256color"
set -g status-style "bg=colour236,fg=colour252"
EOF

# The same session as kurashizu/openbox-vnc: openbox with one desktop named
# KRSZ, that project's wallpaper drawn by pcmanfm, a tint2 panel, and the same
# three launchers. The browser is the one substitution -- firefox-esr exists for
# 32-bit x86 but is 243 MB and needs to JIT megabytes of JavaScript to start,
# which this machine cannot do at half a MIPS. netsurf renders a page instead.
mkdir -p "$ROOTFS/root/.config/openbox"
cat > "$ROOTFS/root/.xinitrc" <<'EOF'
pcmanfm --desktop &
tint2 &
exec openbox
EOF

mkdir -p "$ROOTFS/usr/share/backgrounds"
if [ -f /assets/wallpaper.png ]; then
	cp /assets/wallpaper.png "$ROOTFS/usr/share/backgrounds/krsz.png"
fi

mkdir -p "$ROOTFS/root/.config/pcmanfm/default"
cat > "$ROOTFS/root/.config/pcmanfm/default/desktop-items-0.conf" <<'EOF'
[*]
wallpaper_mode=stretch
wallpaper=/usr/share/backgrounds/krsz.png
desktop_bg=#12151a
desktop_font=Sans 10
desktop_fg=#ffffff
desktop_shadow=#000000
show_documents=0
show_trash=0
show_mounts=0
EOF

mkdir -p "$ROOTFS/root/.config/libfm"
cat > "$ROOTFS/root/.config/libfm/libfm.conf" <<'EOF'
[config]
quick_exec=1
EOF

mkdir -p "$ROOTFS/usr/share/icons/krsz"
if [ -d /assets/icons ]; then
	cp /assets/icons/*.png "$ROOTFS/usr/share/icons/krsz/"
fi

mkdir -p "$ROOTFS/root/Desktop"
cat > "$ROOTFS/root/Desktop/browser.desktop" <<'EOF'
[Desktop Entry]
Name=Web Browser
Exec=netsurf-gtk3
Icon=/usr/share/icons/krsz/browser.png
Type=Application
Terminal=false
EOF
cat > "$ROOTFS/root/Desktop/files.desktop" <<'EOF'
[Desktop Entry]
Name=Files
Exec=pcmanfm /root
Icon=/usr/share/icons/krsz/files.png
Type=Application
Terminal=false
EOF
cat > "$ROOTFS/root/Desktop/terminal.desktop" <<'EOF'
[Desktop Entry]
Name=Terminal
Exec=xfce4-terminal
Icon=/usr/share/icons/krsz/terminal.png
Type=Application
Terminal=false
EOF
chmod +x "$ROOTFS"/root/Desktop/*.desktop

cat > "$ROOTFS/root/.config/openbox/rc.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <desktops>
    <number>1</number>
    <firstdesk>1</firstdesk>
    <names>
      <name>KRSZ</name>
    </names>
  </desktops>
  <theme>
    <name>Clearlooks</name>
    <titleLayout>NLIMC</titleLayout>
    <font place="ActiveWindow"><name>sans</name><size>9</size></font>
    <font place="InactiveWindow"><name>sans</name><size>9</size></font>
  </theme>
</openbox_config>
EOF

# Backgrounds are numbered in the order they appear and have to be defined
# before anything refers to them -- writing the panel first leaves it with an
# id that does not exist yet, and tint2 comes up drawing nothing at all.
mkdir -p "$ROOTFS/root/.config/tint2"
cat > "$ROOTFS/root/.config/tint2/tint2rc" <<'EOF'
rounded = 0
border_width = 1
background_color = #12151a 92
border_color = #98c379 70

rounded = 0
border_width = 1
background_color = #2b323b 100
border_color = #98c379 100

panel_items = LTC
panel_monitor = all
panel_position = bottom center horizontal
panel_size = 100% 28
panel_margin = 0 0
panel_padding = 4 2 4
panel_background_id = 1
panel_layer = top
strut_policy = follow_size
wm_menu = 1

launcher_icon_size = 20
launcher_padding = 4 2 6
launcher_icon_theme = Adwaita
launcher_item_app = /root/Desktop/terminal.desktop
launcher_item_app = /root/Desktop/files.desktop
launcher_item_app = /root/Desktop/browser.desktop

taskbar_mode = single_desktop
taskbar_padding = 2 0 4
task_maximum_size = 220 24
task_padding = 6 2
task_font = sans 9
task_font_color = #d8dee9 100
task_active_background_id = 2

time1_format = %H:%M
time1_font = sans 9
clock_font_color = #d8dee9 100
clock_padding = 8 0
EOF
chmod +x "$ROOTFS/root/.xinitrc"

# Not the vesa driver, which is the obvious choice and does not work here: it
# asks the video BIOS for its mode list, and a kernel handed straight to the
# emulator means the BIOS never POSTed, so there is nothing to ask. The card
# itself is a QEMU-style stdvga (PCI 1234:1111), which the kernel's bochs driver
# drives directly through its registers -- no firmware involved.
# The server chatters about every PCI id it probes, straight to the terminal it
# was started from, which buries the shell it just left behind. The log keeps
# all of it; the console gets the errors only.
mkdir -p "$ROOTFS/etc/X11/xinit"
cat > "$ROOTFS/etc/X11/xinit/xserverrc" <<'EOF'
#!/bin/sh
exec /usr/bin/Xorg -nolisten tcp -verbose 1 "$@" 2>>/var/log/Xorg.stderr.log
EOF
chmod +x "$ROOTFS/etc/X11/xinit/xserverrc"

# The DRM driver is loaded here rather than at boot, because it brings a
# framebuffer console with it: load it early and the guest sits in a graphical
# mode from the first second, which the page reads -- fairly -- as "something
# has taken the display", switching away from the serial console before there is
# anything to see. Turning fbdev emulation off through the module parameter has
# no effect on this kernel, so the driver simply waits until X is asked for.
mkdir -p "$ROOTFS/usr/local/bin"
cat > "$ROOTFS/usr/local/bin/startx" <<'EOF'
#!/bin/sh
modprobe bochs 2>/dev/null || true

# There is no monitor to ask for a mode list, so the page passes the one it
# wants on the kernel command line and it is turned into a Screen section here.
res=$(sed -n 's/.*krsz_res=\([0-9]\{3,4\}x[0-9]\{3,4\}\).*/\1/p' /proc/cmdline)
if [ -n "$res" ]; then
	cat > /etc/X11/xorg.conf.d/20-mode.conf <<CONF
Section "Screen"
    Identifier "v86-screen"
    Device     "v86"
    Monitor    "v86-monitor"
    DefaultDepth 24
    SubSection "Display"
        Depth   24
        Modes   "$res" "1280x800" "1024x768"
    EndSubSection
EndSection
CONF
else
	rm -f /etc/X11/xorg.conf.d/20-mode.conf
fi

exec /usr/bin/startx "$@"
EOF
chmod +x "$ROOTFS/usr/local/bin/startx"

mkdir -p "$ROOTFS/etc/X11/xorg.conf.d"
cat > "$ROOTFS/etc/X11/xorg.conf.d/10-modesetting.conf" <<'EOF'
Section "Device"
    Identifier "v86"
    Driver     "modesetting"
EndSection

# There is no monitor to ask, so X falls back to 1024x768 and the page has to
# stretch that across a desktop-sized panel. These modes are wider and still fit
# in 8 MB of video memory at 32bpp; the first one the card accepts wins.
Section "Monitor"
    Identifier "v86-monitor"
    HorizSync   30-90
    VertRefresh 50-75
EndSection

Section "Screen"
    Identifier "v86-screen"
    Device     "v86"
    Monitor    "v86-monitor"
    DefaultDepth 24
    SubSection "Display"
        Depth   24
        Modes   "1440x900" "1280x800" "1280x720" "1024x768"
    EndSubSection
EndSection
EOF

cat > "$ROOTFS/root/.config/openbox/menu.xml" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu xmlns="http://openbox.org/3.4/menu">
<menu id="root-menu" label="krsz-vm">
  <item label="Terminal"><action name="Execute"><command>xfce4-terminal</command></action></item>
  <item label="Files"><action name="Execute"><command>pcmanfm /root</command></action></item>
  <item label="Web Browser"><action name="Execute"><command>netsurf-gtk3</command></action></item>
  <item label="Text Editor"><action name="Execute"><command>mousepad</command></action></item>
  <item label="Archives"><action name="Execute"><command>xarchiver</command></action></item>
  <item label="Calculator"><action name="Execute"><command>galculator</command></action></item>
  <separator />
  <item label="Top"><action name="Execute"><command>xfce4-terminal -e htop</command></action></item>
  <item label="Reconfigure"><action name="Reconfigure" /></item>
  <item label="Exit X"><action name="Exit" /></item>
</menu>
</openbox_menu>
EOF

mkdir -p "$ROOTFS/etc/profile.d"
cat > "$ROOTFS/etc/profile.d/krsz.sh" <<'EOF'
export PS1='\[\033[1;32m\]\u@krsz-vm\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ '
alias ll='ls -la'

# A serial line carries no window size, so the kernel assumes 80x24 and the shell
# wraps a quarter of the way across a desktop-sized terminal. `resize` asks the
# terminal where its cursor lands in the far corner and sets the size from the
# answer — only on ttyS0, since the VGA console never replies and the read would
# sit there waiting. `rs` re-runs it after the browser window changes.
#
# Doing it once at login is not enough either: the page is still settling its
# layout then, and the window can be resized at any point afterwards. Re-asking
# before each prompt costs one fork and keeps the size right for good.
alias rs='resize >/dev/null 2>&1'
case "$(tty)" in
	/dev/ttyS*)
		if command -v resize >/dev/null; then
			resize >/dev/null 2>&1
			[ -n "${BASH:-}" ] && PROMPT_COMMAND='resize >/dev/null 2>&1'
		fi
		;;
esac
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
# The NIC needs configuring, which needs the networking service — leaving it out
# is why the guest had no address, no route, and a resolver pointing at
# 127.0.0.1 while the relay sat there unused.
ln -sf /etc/init.d/networking "$ROOTFS/etc/runlevels/boot/networking" 2>/dev/null || true

# Without hwdrivers nothing walks the PCI bus, so the NIC's driver is never
# loaded and networking finds no interface to configure — the guest ends up with
# no route and every lookup fails as "Network unreachable". The hardware here is
# fixed and known, so the drivers it needs are named outright instead.
cat > "$ROOTFS/etc/init.d/vmdrivers" <<'EOF'
#!/sbin/openrc-run
description="Load drivers for the emulator's fixed set of devices"

depend() {
	before net networking
}

start() {
	ebegin "Loading virtio drivers"
	# psmouse and evdev are what turn the emulated PS/2 mouse into the
	# /dev/input/event* node libinput looks for; without them X comes up with a
	# keyboard and no pointer.
	for mod in virtio virtio_ring virtio_pci failover net_failover virtio_net \
		atkbd psmouse evdev serio_raw; do
		modprobe "$mod" 2>/dev/null || true
	done
	# X finds its keyboard and mouse through udev, which has to have seen them.
	# Only the input subsystem is triggered: walking the whole bus is what
	# hwdrivers does, and what takes the machine down.
	if command -v udevd >/dev/null && [ ! -S /run/udev/control ]; then
		udevd --daemon 2>/dev/null || true
		udevadm trigger --subsystem-match=input --action=add 2>/dev/null || true
	fi
	# The NIC is the only one that matters; report on whether it appeared.
	[ -d /sys/class/net/eth0 ]
	eend $? "no virtio NIC — check that networking is enabled on the page"
}
EOF
chmod +x "$ROOTFS/etc/init.d/vmdrivers"
ln -sf /etc/init.d/vmdrivers "$ROOTFS/etc/runlevels/boot/vmdrivers" 2>/dev/null || true

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
#
# Whole directories, not `.ko*` globs. With the globs the guest's own modprobe
# reported "Module sd_mod not found in directory /lib/modules/<ver>" while
# ata_piix — listed as a bare directory — had loaded fine, so the glob entries
# were not landing where modprobe looks. Taking the whole scsi directory costs a
# few MB of initramfs and removes a class of failure that is invisible until a
# guest cannot find its root.
mkdir -p "$ROOTFS/etc/mkinitfs/features.d"
cat > "$ROOTFS/etc/mkinitfs/features.d/v86.modules" <<'EOF'
kernel/drivers/ata
kernel/drivers/scsi
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
echo "==> where modprobe will look:"
ls /tmp/initcheck/lib/modules/*/kernel/drivers/scsi/ 2>/dev/null | head -8 || \
	echo "!! nothing under /lib/modules/*/kernel/drivers/scsi"

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
echo "==> rootfs uses ${USED_MB} MB, building a ${NEEDED_MB} MB image"

mke2fs -q -t ext4 -b 4096 -d "$ROOTFS" -F -L krsz-root "$OUT/rootfs.img" "$((NEEDED_MB * 256))"

# Split for upload. The parts are plain byte ranges of the same image, so the
# proxy can serve any offset by reading from the part it lands in.
# busybox split has no -d/-a, so its suffixes are alphabetic; dd gives the
# numbered parts the proxy expects and needs nothing installed.
PART_COUNT=$(( (NEEDED_MB + PART_MB - 1) / PART_MB ))
i=0
while [ "$i" -lt "$PART_COUNT" ]; do
	dd if="$OUT/rootfs.img" of="$OUT/rootfs.img.$(printf '%03d' "$i")" \
		bs=1048576 skip=$(( i * PART_MB )) count="$PART_MB" 2>/dev/null
	i=$(( i + 1 ))
done
rm -f "$OUT/rootfs.img"
echo "==> rootfs split into ${PART_COUNT} part(s) of up to ${PART_MB} MB"

echo "==> built:"
ls -l "$OUT"
for f in vmlinuz initramfs; do
	echo "$f size=$(stat -c %s "$OUT/$f")"
done
echo "rootfs total=$(( NEEDED_MB * 1024 * 1024 )) part_bytes=$(( PART_MB * 1024 * 1024 ))"
