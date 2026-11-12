'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';
'require ui';
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
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, port) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		var button = String.format('&#160;<a class="btn cbi-button" href="http://%s:%s/ui" target="_blank" rel="noreferrer noopener">%s</a>',
			window.location.hostname, port || '9090', _('打开面板'));
		renderHTML = String.format(spanTemp, 'green', _('Mihomo'), _('运行中')) + button;
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Mihomo'), _('未运行'));
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

		m = new form.Map('mihomo', _('Mihomo'), _('Mihomo 透明代理配置管理'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					if (view) view.innerHTML = renderStatus(res, uiPort);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('正在获取状态...'))
			]);
		};

		s = m.section(form.NamedSection, 'config', 'mihomo', _('配置'));
		s.addremove = false;

		s.tab('basic', _('基本设置'));
		s.tab('interface', _('接口与分流'));
		s.tab('advanced', _('端口设置'));
		s.tab('cron', _('定时重启'));

		o = s.taboption('basic', form.Flag, 'enabled', _('启用 Mihomo'));
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'config_path', _('配置文件路径'), _('存放在 /etc/mihomo/ 目录下的 YAML 配置文件路径，可点击右侧按钮直接上传并替换'));
		o.default = '/etc/mihomo/config.yaml';
		o.rmempty = false;
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var node = form.Value.prototype.renderWidget.apply(this, [section_id, option_index, cfgvalue]);
			var self = this;

			return E('div', { 'style': 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' }, [
				node,
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'click': ui.createHandlerFn(this, function(ev) {
						var inputEl = node.querySelector('input') || node;
						var currentPath = (inputEl && inputEl.value) ? inputEl.value.trim() : '/etc/mihomo/config.yaml';

						// 限制上传目标在 /etc/mihomo/ 目录下，保证安全性与规范性
						if (!currentPath.startsWith('/etc/mihomo/') || currentPath === '/etc/mihomo/') {
							currentPath = '/etc/mihomo/config.yaml';
						}

						return ui.uploadFile(currentPath, ev.target).then(function() {
							if (inputEl && inputEl.value !== currentPath) {
								inputEl.value = currentPath;
								inputEl.dispatchEvent(new Event('change', { bubbles: true }));
							}
							ui.addNotification(null, E('p', _('配置文件已成功上传并替换至：') + currentPath), 'info');
						}).catch(function(e) {
							ui.addNotification(null, E('p', _('配置文件上传失败：') + e.message), 'danger');
						});
					})
				}, _('上传并替换配置'))
			]);
		};

		o = s.taboption('basic', form.ListValue, 'proxy_mode', _('代理模式'));
		o.value('tproxy', _('TProxy 模式 (nftables 透明代理)'));
		o.value('tun', _('TUN 模式 (由 Mihomo 接管网卡)'));
		o.value('core_only', _('仅核心 (仅提供 Socks/HTTP 代理)'));
		o.default = 'tproxy';

		o = s.taboption('interface', widgets.DeviceSelect, 'proxy_ifaces', _('代理接口'), _('需要经过 Mihomo 透明代理的接口，如 br-lan, eth1, eth2, phy0-ap0 等'));
		o.multiple = true;
		o.noaliases = true;
		o.nobridges = false;
		o.rmempty = false;
		o.default = 'br-lan';

		o = s.taboption('interface', form.Flag, 'proxy_udp', _('代理 UDP 流量'), _('开启后将透明代理 UDP 流量（如 QUIC、游戏语音等，仅 TProxy 模式有效）'));
		o.default = '1';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('interface', form.DynamicList, 'bypass_src_ips', _('绕过源 IP'), _('指定不经过 Mihomo 透明代理的内网设备 IP 或网段'));
		o.datatype = 'or(ip4addr, cidr4)';
		o.placeholder = '192.168.1.100';

		o = s.taboption('interface', form.DynamicList, 'bypass_src_macs', _('绕过源 MAC'), _('指定不经过 Mihomo 透明代理的内网设备 MAC 地址'));
		o.datatype = 'macaddr';
		o.placeholder = '00:11:22:33:44:55';

		o = s.taboption('advanced', form.Value, 'tproxy_port', _('TProxy 端口'), _('需与 config.yaml 中的 tproxy-port 保持一致'));
		o.datatype = 'port';
		o.default = '7893';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('advanced', form.Value, 'dns_port', _('DNS 重定向端口'), _('劫持局域网 53 端口 DNS 请求并转发至 Mihomo 的 dns.listen 端口'));
		o.datatype = 'port';
		o.default = '1053';

		o = s.taboption('advanced', form.Value, 'ui_port', _('Web 面板端口'), _('需与 config.yaml 中的 external-controller 端口一致'));
		o.datatype = 'port';
		o.default = '9090';

		o = s.taboption('cron', form.Flag, 'cron_restart', _('定时重启 Mihomo 服务'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('cron', form.ListValue, 'cron_weekday', _('重启星期'));
		o.value('*', _('每天'));
		o.value('1', _('星期一'));
		o.value('2', _('星期二'));
		o.value('3', _('星期三'));
		o.value('4', _('星期四'));
		o.value('5', _('星期五'));
		o.value('6', _('星期六'));
		o.value('0', _('星期日'));
		o.default = '*';
		o.depends('cron_restart', '1');

		o = s.taboption('cron', form.ListValue, 'cron_hour', _('重启小时'));
		for (var i = 0; i < 24; i++) {
			o.value(String(i), (i < 10 ? '0' + i : String(i)) + _(' 时'));
		}
		o.default = '4';
		o.depends('cron_restart', '1');

		o = s.taboption('cron', form.ListValue, 'cron_minute', _('重启分钟'));
		for (var j = 0; j < 60; j++) {
			o.value(String(j), (j < 10 ? '0' + j : String(j)) + _(' 分'));
		}
		o.default = '0';
		o.depends('cron_restart', '1');

		return m.render();
	}
});
