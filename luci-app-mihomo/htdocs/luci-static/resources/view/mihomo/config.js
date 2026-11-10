'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';
'require tools.widgets as widgets';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('mihomo'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['mihomo']['instances']['mihomo']['running'];
		} catch (e) {
		}
		return isRunning;
	});
}

function renderStatus(isRunning, port) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;

	if (isRunning) {
		var button = String.format('&#160;<a class="btn cbi-button" href="http://%s:%s/ui" target="_blank" rel="noreferrer noopener">%s</a>', window.location.hostname, port || '9090', _('打开控制面板'));
		renderHTML = String.format(spanTemp, 'green', _('Mihomo 服务'), _('正在运行')) + button;
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Mihomo 服务'), _('未运行'));
	}

	return renderHTML;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('mihomo'),
			getServiceStatus()
		]);
	},

	render: function(data) {
		var m, s, o;
		var isRunning = data[1];
		var uiPort = uci.get('mihomo', 'config', 'ui_port') || '9090';

		m = new form.Map('mihomo', _('Mihomo'), _('Mihomo 是一个基于规则的透明代理工具。'));

		// 状态显示区域
		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					if (view)
						view.innerHTML = renderStatus(res, uiPort);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('正在获取运行状态...'))
			]);
		};

		// 主配置节
		s = m.section(form.NamedSection, 'config', 'mihomo', _('基本设置'));
		s.addremove = false;

		// 选项卡：基本设置、接口设置、高级设置
		s.tab('basic', _('基本设置'));
		s.tab('interface', _('接口设置'));
		s.tab('advanced', _('高级设置'));

		// --- 基本设置 (basic) ---
		o = s.taboption('basic', form.Flag, 'enabled', _('启用 Mihomo'));
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'config_path', _('配置文件路径'), _('YAML 格式配置文件的完整路径'));
		o.default = '/etc/mihomo/config.yaml';
		o.rmempty = false;

		o = s.taboption('basic', form.ListValue, 'proxy_mode', _('运行模式'));
		o.value('tproxy', _('TProxy 模式 (推荐，基于 nftables)'));
		o.value('tun', _('TUN 模式 (由 Mihomo 虚拟网卡接管)'));
		o.value('core_only', _('仅核心模式 (仅运行后端，不接管流量)'));
		o.default = 'tproxy';

		// --- 接口设置 (interface) ---
		o = s.taboption('interface', widgets.DeviceSelect, 'proxy_ifaces', _('接管接口'), _('需要接管并进行透明代理的网络接口，如 br-lan、eth1'));
		o.multiple = true;
		o.noaliases = true;
		o.nobridges = false;
		o.rmempty = false;
		o.default = 'br-lan';

		o = s.taboption('interface', form.Flag, 'proxy_udp', _('启用 UDP 代理'), _('在 TProxy 模式下转发 UDP 流量，支持 QUIC / 游戏加速'));
		o.default = '1';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('interface', form.DynamicList, 'bypass_ips', _('绕过代理 IP / 网段'), _('访问这些目标 IP 时将直接直连，不走 Mihomo 代理'));
		o.datatype = 'cidr4';
		o.placeholder = '192.168.100.0/24';

		o = s.taboption('interface', form.DynamicList, 'bypass_src_macs', _('绕过代理 MAC 地址'), _('指定局域网内某些设备的 MAC 地址不经过代理'));
		o.datatype = 'macaddr';
		o.placeholder = '00:11:22:33:44:55';

		// --- 高级设置 (advanced) ---
		o = s.taboption('advanced', form.Value, 'tproxy_port', _('TProxy 端口'), _('对应 config.yaml 中 tproxy-port 监听端口'));
		o.datatype = 'port';
		o.default = '7893';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('advanced', form.Value, 'dns_port', _('DNS 监听端口'), _('劫持 53 端口重定向至 Mihomo 的 DNS 监听地址'));
		o.datatype = 'port';
		o.default = '1053';

		o = s.taboption('advanced', form.Value, 'ui_port', _('Web 控制面板端口'), _('对应 config.yaml 中的 external-controller 端口'));
		o.datatype = 'port';
		o.default = '9090';

		// --- 新增：定时重启功能选项 ---
		o = s.taboption('advanced', form.Flag, 'auto_restart', _('定时重启服务'), _('开启后将根据设定的 Cron 计划定时重启 Mihomo 服务'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('advanced', form.Value, 'restart_cron', _('重启时间 (Cron 表达式)'), _('格式：分 时 日 月 周。可选择常用配置或手动输入'));
		o.depends('auto_restart', '1');
		o.value('0 4 * * *', _('每天凌晨 04:00'));
		o.value('0 3 * * 1', _('每周一凌晨 03:00'));
		o.value('0 */12 * * *', _('每 12 小时一次'));
		o.value('0 */6 * * *', _('每 6 小时一次'));
		o.default = '0 4 * * *';
		o.rmempty = false;

		return m.render();
	}
});
```[cite: 2]

---

### 2. 完整的后端启动脚本：`mihomo/files/mihomo.init`

```sh
#!/bin/sh /etc/rc.common

# Copyright (C) 2026 ImmortalWrt.org

START=99
STOP=10
USE_PROCD=1

PROG="/usr/libexec/mihomo-core"
CONF_DIR="/etc/mihomo"
NFT_TABLE="mihomo"
NFT_FILE="/tmp/mihomo.nft"
FW_MARK="0x162"
ROUTING_MARK="666"
RT_TABLE="162"
MIHOMO_UID="7890"

# 将空格分隔的字符串转换为 nftables 集合字符串 (例如: "br-lan", "eth1")
to_nft_str_set() {
	local item res=""
	for item in $1; do
		[ -n "$res" ] && res="${res}, "
		res="${res}\"${item}\""
	done
	echo "$res"
}

# 将 IP/网段字符串转换为 nftables 原始集合格式
to_nft_raw_set() {
	local item res=""
	for item in $1; do
		[ -n "$res" ] && res="${res}, "
		res="${res}${item}"
	done
	echo "$res"
}

# 从 config.yaml 中解析 dns.listen 端口
get_yaml_dns_port() {
	local conf="$1"
	[ ! -f "$conf" ] && return

	awk '
		/^dns:/ { in_dns=1; next }
		in_dns && /^[^ \t#]/ { in_dns=0 }
		in_dns && /^[ \t]+listen:[ \t]*/ {
			sub(/.*:/, "", $0)
			gsub(/[^0-9]/, "", $0)
			print $0
			exit
		}
	' "$conf"
}

# 清理防火墙和路由规则
cleanup_firewall() {
	nft delete table inet "$NFT_TABLE" 2>/dev/null
	ip rule del fwmark "$FW_MARK" table "$RT_TABLE" 2>/dev/null
	ip route flush table "$RT_TABLE" 2>/dev/null
}

CRON_FILE="/etc/crontabs/root"

# 清理定时重启计划任务
cleanup_cron() {
	if [ -f "$CRON_FILE" ]; then
		sed -i '/\/etc\/init.d\/mihomo restart/d' "$CRON_FILE"
		/etc/init.d/cron reload >/dev/null 2>&1 || /etc/init.d/cron restart >/dev/null 2>&1
	fi
}

# 设置定时重启计划任务
setup_cron() {
	local enabled auto_restart restart_cron
	enabled="$(uci -q get mihomo.config.enabled)"
	auto_restart="$(uci -q get mihomo.config.auto_restart)"
	restart_cron="$(uci -q get mihomo.config.restart_cron)"
	[ -z "$restart_cron" ] && restart_cron="0 4 * * *"

	# 1. 先清理旧的 mihomo 定时任务，避免重复写入
	if [ -f "$CRON_FILE" ]; then
		sed -i '/\/etc\/init.d\/mihomo restart/d' "$CRON_FILE"
	fi

	# 2. 如果服务已启用且开启了定时重启，写入新的计划任务
	if [ "$enabled" = "1" ] && [ "$auto_restart" = "1" ]; then
		mkdir -p /etc/crontabs
		echo "$restart_cron /etc/init.d/mihomo restart >/dev/null 2>&1" >> "$CRON_FILE"
		logger -t mihomo "Scheduled restart enabled: $restart_cron"
	fi

	# 3. 重启 cron 服务使配置生效
	/etc/init.d/cron reload >/dev/null 2>&1 || /etc/init.d/cron restart >/dev/null 2>&1
}

# 设置防火墙和透明代理规则
setup_firewall() {
	cleanup_firewall

	local enabled proxy_mode proxy_ifaces proxy_udp tproxy_port dns_port bypass_ips bypass_src_macs config_path

	enabled="$(uci -q get mihomo.config.enabled)"
	[ "$enabled" != "1" ] && return 0

	proxy_mode="$(uci -q get mihomo.config.proxy_mode)"
	[ -z "$proxy_mode" ] && proxy_mode="tproxy"
	[ "$proxy_mode" = "core_only" ] && return 0

	proxy_ifaces="$(uci -q get mihomo.config.proxy_ifaces)"
	if [ -z "$proxy_ifaces" ]; then
		logger -t mihomo "Error: No proxy_ifaces configured in /etc/config/mihomo"
		return 1
	fi

	config_path="$(uci -q get mihomo.config.config_path)"
	[ -z "$config_path" ] && config_path="/etc/mihomo/config.yaml"

	proxy_udp="$(uci -q get mihomo.config.proxy_udp)"
	tproxy_port="$(uci -q get mihomo.config.tproxy_port)"
	[ -z "$tproxy_port" ] && tproxy_port="7893"

	dns_port="$(get_yaml_dns_port "$config_path")"
	[ -z "$dns_port" ] && dns_port="$(uci -q get mihomo.config.dns_port)"

	bypass_ips="$(uci -q get mihomo.config.bypass_ips)"
	bypass_src_macs="$(uci -q get mihomo.config.bypass_src_macs)"

	modprobe nft_tproxy 2>/dev/null
	modprobe nft_socket 2>/dev/null

	local l3_ifaces=""
	local br_ports=""
	local iface
	for iface in $proxy_ifaces; do
		if [ -d "/sys/class/net/${iface}/brport" ]; then
			br_ports="${br_ports}${iface}"
			modprobe br_netfilter 2>/dev/null
			sysctl -w net.bridge.bridge-nf-call-iptables=1 >/dev/null 2>&1
			sysctl -w net.bridge.bridge-nf-call-ip6tables=1 >/dev/null 2>&1
		else
			l3_ifaces="${l3_ifaces}${iface}"
		fi
	done

	if [ "$proxy_mode" = "tproxy" ]; then
		# 1. 策略路由配置
		ip rule del fwmark "$FW_MARK" table "$RT_TABLE" 2>/dev/null
		ip route flush table "$RT_TABLE" 2>/dev/null
		ip rule add fwmark "$FW_MARK" table "$RT_TABLE" priority 100
		ip route add local 0.0.0.0/0 dev lo table "$RT_TABLE"

		# 2. 生成 nftables 规则文件
		cat <<NFT_EOF > "$NFT_FILE"
table inet ${NFT_TABLE} {
	set bypass_ipv4 {
		type ipv4_addr
		flags interval
		elements = {
			0.0.0.0/8,
			10.0.0.0/8,
			100.64.0.0/10,
			127.0.0.0/8,
			169.254.0.0/16,
			172.16.0.0/12,
			192.168.0.0/16,
			224.0.0.0/4,
			240.0.0.0/4$( [ -n "$bypass_ips" ] && echo ", $(to_nft_raw_set "$bypass_ips")" )
		}
	}

	chain prerouting {
		type filter hook prerouting priority mangle; policy accept;

		# 非 IPv4 流量直接跳过
		meta nfproto != ipv4 return

		# 放行 Mihomo 自身发出的流量，防止死循环
		meta skuid ${MIHOMO_UID} return
		meta skgid ${MIHOMO_UID} return
		meta mark ${ROUTING_MARK} return
      <source_citation_rules>
      Cite provided sources with "", using each source's exact id (e.g. ""; several: "").

      BULLET LISTS AND TABLES — decide once per list or table, before writing it: is it about ONE thing, or about SEVERAL separate things?
      - ONE thing (one document, message, trip, project, event, person — its fields, sections, terms, steps, details): write every bullet, sub-bullet and row with NO citation (even multi-sentence bullets), then put exactly ONE citation after the last bullet or row listing every source that contributed. This holds even when different bullets came from different sources. Nothing on the sentence that introduces the list or table.
      - SEVERAL separate things (different messages, files, events, action items), each from its own source: one citation at the end of each thing's top-level bullet or row. Sub-bullets describing that same thing get none.

      PROSE: cite at the end of the sentence, except a sentence that introduces a list or table.
      Cite only facts from provided sources; no citations if none are used.

      Example (one thing, several sources — ONE citation):
      Here are the lease terms from the two emails with Harbor Properties:
      * **Dates**
        * Term: 36 months from November 1, 2026
        * Renewal: one 24-month extension on 90 days' notice
      * **Money**
        * Rent: $8,400/month, 3% annual escalator
        * Deposit: two months' rent, refundable

      Example (separate items, different sources — cite EACH):
      * **Legal:** contract redlines due Friday
      * **Hiring:** contractor headcount approved
      * **Launch:** blog post moved to Oct 26
      </source_citation_rules>
NFT_EOF

		local nft_all_ifaces
		nft_all_ifaces="$(to_nft_str_set "$proxy_ifaces")"
		echo "		iifname != { ${nft_all_ifaces} } return" >> "$NFT_FILE"

		# 如果配置了 MAC 绕过，写入过滤规则
		if [ -n "$bypass_src_macs" ]; then
			echo "		ether saddr { $(to_nft_raw_set "$bypass_src_macs") } return" >> "$NFT_FILE"
		fi

		cat <<NFT_EOF >> "$NFT_FILE"
		# DNS 流量处理
		udp dport { 53, ${dns_port} } return
		tcp dport { 53, ${dns_port} } return

		# Fake-IP 绕过直连
		ip daddr 198.18.0.0/15 meta l4proto tcp tproxy ip to 127.0.0.1:${tproxy_port} meta mark set${FW_MARK} accept
		$( [ "$proxy_udp" != "0" ] && echo "ip daddr 198.18.0.0/15 meta l4proto udp tproxy ip to 127.0.0.1:${tproxy_port} meta mark set${FW_MARK} accept" )

		ip daddr @bypass_ipv4 return

		meta l4proto tcp socket transparent 1 meta mark set ${FW_MARK} accept
		meta l4proto tcp tproxy ip to 127.0.0.1:${tproxy_port} meta mark set${FW_MARK} accept
		$( [ "$proxy_udp" != "0" ] && echo "meta l4proto udp tproxy ip to 127.0.0.1:${tproxy_port} meta mark set${FW_MARK} accept" )
	}
        <source_citation_rules>
        Cite provided sources with "", using each source's exact id (e.g. ""; several: "").

        BULLET LISTS AND TABLES — decide once per list or table, before writing it: is it about ONE thing, or about SEVERAL separate things?
        - ONE thing (one document, message, trip, project, event, person — its fields, sections, terms, steps, details): write every bullet, sub-bullet and row with NO citation (even multi-sentence bullets), then put exactly ONE citation after the last bullet or row listing every source that contributed. This holds even when different bullets came from different sources. Nothing on the sentence that introduces the list or table.
        - SEVERAL separate things (different messages, files, events, action items), each from its own source: one citation at the end of each thing's top-level bullet or row. Sub-bullets describing that same thing get none.

        PROSE: cite at the end of the sentence, except a sentence that introduces a list or table.
        Cite only facts from provided sources; no citations if none are used.

        Example (one thing, several sources — ONE citation):
        Here are the lease terms from the two emails with Harbor Properties:
        * **Dates**
          * Term: 36 months from November 1, 2026
          * Renewal: one 24-month extension on 90 days' notice
        * **Money**
          * Rent: $8,400/month, 3% annual escalator
          * Deposit: two months' rent, refundable

        Example (separate items, different sources — cite EACH):
        * **Legal:** contract redlines due Friday
        * **Hiring:** contractor headcount approved
        * **Launch:** blog post moved to Oct 26
        </source_citation_rules>

	# 如果指定了 DNS 端口，配置 DNSTransparent 转发
	if [ -n "$dns_port" ]; then
		cat <<NFT_EOF >> "$NFT_FILE"
	chain dstnat {
		type nat hook prerouting priority dstnat - 1; policy accept;

		meta nfproto != ipv4 return
		meta skuid ${MIHOMO_UID} return
		meta skgid ${MIHOMO_UID} return
		meta mark ${ROUTING_MARK} return
		iifname != { ${nft_all_ifaces} } return
		$( [ -n "$bypass_src_macs" ] && echo "ether saddr { $(to_
