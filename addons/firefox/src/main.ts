/// <reference path="../typings/firefox-addon-sdk.d.ts" />

import buttons = require('sdk/ui/button/toggle');
import panel = require('sdk/panel');
import preferences_service = require('sdk/preferences/service');
import self_ = require('sdk/self');
import tabs = require('sdk/tabs');

var mainPanel: panel.Panel;
var toolbarButton: buttons.ToggleButton;
var tabWorkers: {[index: string]: ContentWorker} = {};

function getTabWorker(tab: Tab) {
	if (!tabWorkers[tab.id]) {
		tabWorkers[tab.id] = tab.attach({
			contentScriptFile: self_.data.url('scripts/page.js')
		});
		tabWorkers[tab.id].on('detach', () => {
			delete tabWorkers[tab.id];
		});
	}
	return tabWorkers[tab.id];
}

var mainPanel: panel.Panel;

function notifyPageChanged(tab: Tab) {
	if (mainPanel) {
		mainPanel.port.emit('pagechanged', tabs.activeTab.url);
	}
}

function onPanelHidden() {
	toolbarButton.state('window', { checked: false });
};

function main() {
	// disable strict mode in development to suppress a large
	// number of console warnings from normal web pages
	preferences_service.set('javascript.options.strict', false);

	tabs.on('ready', (tab) => {
		if (tab === tabs.activeTab) {
			notifyPageChanged(tab);
		}
	});

	tabs.on('activate', (tab) => {
		notifyPageChanged(tab);
	});

	var showPanel = (state: ButtonState) => {
		if (!mainPanel) {
			mainPanel = panel.Panel({
				width: 400,
				height: 400,
				contentURL : self_.data.url('index.html'),
				contentScriptFile: self_.data.url('scripts/panel_content.js'),
				contentScriptWhen: 'start',
				onHide: onPanelHidden
			});
			mainPanel.port.on('oauth-credentials-received', (hash: string) => {
				mainPanel.contentURL = self_.data.url('index.html') + hash;
			});
			mainPanel.port.on('find-fields', () => {
				var worker = getTabWorker(tabs.activeTab);
				worker.port.once('found-fields', (fields) => {
					mainPanel.port.emit('found-fields', fields);
				});
				worker.port.emit('find-fields');
			});
			mainPanel.port.on('autofill', (entries: any[]) => {
				var worker = getTabWorker(tabs.activeTab);
				worker.port.emit('autofill', entries);
			});
			mainPanel.port.on('ready', () => {
				notifyPageChanged(tabs.activeTab);
			});
		}

		if (state.checked) {
			mainPanel.show({
				position: toolbarButton
			});
		}
	};

	toolbarButton = buttons.ToggleButton({
		id: 'key-icon',
		label: 'Password Manager',
		icon: {
			'32' : './icon-32.png',
			'64' : './icon-64.png'
		},
		onChange: showPanel
	});
}

main();