# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2026 ImmortalWrt.org

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mihomo
PKG_VERSION:=1.0.0
PKG_RELEASE:=2

LUCI_TITLE:=LuCI support for Mihomo
LUCI_DEPENDS:=+luci-base +mihomo +ip-tiny +kmod-nft-tproxy +kmod-nft-socket +kmod-nft-bridge
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
