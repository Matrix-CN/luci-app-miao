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
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, port) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		var button = String.format('&#160;<a class="btn cbi-button" href="http://%s:%s/ui" target="_blank" rel="noreferrer noopener">%s</a>',
			window.location.hostname, port || '9090', _('打开控制面板'));
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

		m = new form.Map('mihomo', _('Mihomo 透明代理'),
			_('基于 Mihomo 核心的规则分流与透明代理工具，支持指定物理网口/接口接管流量。'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			var uiPort = uci.get('mihomo', 'config', 'ui_port') || '9090';
			var statusEl = E('p', { id: 'service_status' });
			statusEl.innerHTML = renderStatus(isRunning, uiPort);

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				statusEl
			]);
		};

		poll.add(function () {
			return L.resolveDefault(getServiceStatus()).then(function (res) {
				var view = document.getElementById('service_status');
				var currentPort = uci.get('mihomo', 'config', 'ui_port') || '9090';
				if (view) view.innerHTML = renderStatus(res, currentPort);
			});
		});

		s = m.section(form.NamedSection, 'config', 'mihomo', _('基本与网口代理设置'));
		s.addremove = false;

		s.tab('basic', _('基本设置'));
		s.tab('interface', _('网口代理策略'));
		s.tab('advanced', _('高级与端口'));

		o = s.taboption('basic', form.Flag, 'enabled', _('启用 Mihomo'));
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'config_path', _('配置文件路径'),
			_('对应 /etc/mihomo/ 下的 YAML 配置文件路径'));
		o.default = '/etc/mihomo/config.yaml';
		o.rmempty = false;

		o = s.taboption('basic', form.ListValue, 'proxy_mode', _('透明代理模式'));
		o.value('tproxy', _('TProxy 模式 (推荐，基于 nftables 拦截指定网口)'));
		o.value('tun', _('TUN 模式 (由 Mihomo 内部协议栈接管)'));
		o.value('core_only', _('仅启动核心 (不注入防火墙规则，仅作 Socks/HTTP 代理)'));
		o.default = 'tproxy';

		// ==================== 定时重启设置 ====================
		o = s.taboption('basic', form.Flag, 'auto_restart', _('启用定时重启'),
			_('通过系统 Crontab 定期重启 Mihomo 服务，释放内存或刷新连接状态。'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('basic', form.ListValue, 'restart_type', _('定时重启方式'));
		o.value('daily', _('每天定时重启'));
		o.value('interval', _('按小时间隔重启'));
		o.value('cron', _('自定义 Cron 表达式'));
		o.default = 'daily';
		o.depends('auto_restart', '1');

		o = s.taboption('basic', form.ListValue, 'restart_hour', _('重启时间 (小时)'));
		for (var h = 0; h < 24; h++) {
			o.value(String(h), String.format('%02d 时', h));
		}
		o.default = '4';
		o.depends({ auto_restart: '1', restart_type: 'daily' });

		o = s.taboption('basic', form.Value, 'restart_min', _('重启时间 (分钟)'));
		o.datatype = 'range(0,59)';
		o.default = '0';
		o.placeholder = '0';
		o.depends({ auto_restart: '1', restart_type: 'daily' });

		o = s.taboption('basic', form.ListValue, 'restart_interval', _('重启间隔周期'));
		o.value('1', _('每 1 小时'));
		o.value('2', _('每 2 小时'));
		o.value('3', _('每 3 小时'));
		o.value('4', _('每 4 小时'));
		o.value('6', _('每 6 小时'));
		o.value('8', _('每 8 小时'));
		o.value('12', _('每 12 小时'));
		o.default = '6';
		o.depends({ auto_restart: '1', restart_type: 'interval' });

		o = s.taboption('basic', form.Value, 'restart_cron', _('自定义 Cron 表达式'),
			_('标准 5 段格式：<code>分 时 日 月 周</code>，例如每周一凌晨 3:30 重启填 <code>30 3 * * 1</code>'));
		o.default = '0 4 * * *';
		o.placeholder = '0 4 * * *';
		o.depends({ auto_restart: '1', restart_type: 'cron' });
		o.validate = function(section_id, value) {
			if (!value) return _('Cron 表达式不能为空');
			var parts = value.trim().split(/\s+/);
			if (parts.length !== 5) {
				return _('请输入合法的 5 段式 Cron 表达式（分 时 日 月 周）');
			}
			return true;
		};

		// ==================== 网口代理策略 ====================
		o = s.taboption('interface', widgets.DeviceSelect, 'proxy_ifaces', _('代理指定网口 (二层/物理设备)'),
			_('选择一个或多个需要透明代理的物理网口或网桥（例如：br-lan、eth1、eth2、phy0-ap0）。仅来自所选网口的流量会被重定向至 Mihomo。'));
		o.multiple = true;
		o.noaliases = true;
		o.nobridges = false;
		o.rmempty = false;
		o.default = 'br-lan';

		o = s.taboption('interface', form.Flag, 'proxy_udp', _('代理所选网口 UDP 流量'),
			_('开启后对所选网口的 UDP 流量（如 QUIC、游戏、语音）同样启用 TProxy 透明代理。'));
		o.default = '1';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('interface', form.DynamicList, 'bypass_ips', _('绕过目标 IP / 网段'),
			_('发往这些目标网段的流量将不经过 Mihomo 代理（内置已默认绕过私有局域网段）。'));
		o.datatype = 'cidr4';
		o.placeholder = '192.168.100.0/24';

		o = s.taboption('interface', form.DynamicList, 'bypass_src_macs', _('绕过源 MAC 地址'),
			_('即使接入了被代理的网口，列表内的设备 MAC 也将直接连接网络，不经过代理。'));
		o.datatype = 'macaddr';
		o.placeholder = '00:11:22:33:44:55';

		// ==================== 高级与端口 ====================
		o = s.taboption('advanced', form.Value, 'tproxy_port', _('TProxy 监听端口'),
			_('必须与 config.yaml 中的 tproxy-port 保持一致。'));
		o.datatype = 'port';
		o.default = '7893';
		o.depends('proxy_mode', 'tproxy');

		o = s.taboption('advanced', form.Value, 'dns_port', _('DNS 劫持端口'),
			_('将指定网口的 53 端口 DNS 查询重定向至 Mihomo 的 dns.listen 端口（留空则不劫持）。'));
		o.datatype = 'port';
		o.placeholder = '1053';
		o.default = '1053';
		o.rmempty = true;

		o = s.taboption('advanced', form.Value, 'ui_port', _('Web 面板端口'),
			_('对应 config.yaml 中 external-controller 的端口，用于上方快捷跳转按钮。'));
		o.datatype = 'port';
		o.default = '9090';

		return m.render();
	}
});
