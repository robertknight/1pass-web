/// <reference path="../typings/firefox-content-script.d.ts" />

// the 'content script' for the extension's main panel.
//
// This is loaded before the front-end itself so that it can set up
// the browser integration interface (an implementation of page_access.PageAccess)
// for use by the app when it loads.

import collectionutil = require('../../../lib/base/collectionutil');
import forms = require('../../../webui/forms');
import stringutil = require('../../../lib/base/stringutil');
import page_access = require('../../../webui/page_access');
import rpc = require('../../../lib/net/rpc');
import site_info_service = require('../../../lib/siteinfo/service');

var selfWorker: ContentWorker = <any>self;

var OAUTH_REDIRECT_URL = 'http://localhost:8234';

if (stringutil.startsWith(window.location.href, OAUTH_REDIRECT_URL)) {
	selfWorker.port.emit('oauth-credentials-received', window.location.hash);
}

var pageAccess = createObjectIn<page_access.ExtensionConnector>(unsafeWindow, { defineAs: 'firefoxAddOn' });
var addonRpc = new rpc.RpcHandler(selfWorker.port);
var appRpc = new rpc.RpcHandler(new rpc.WindowMessagePort(document.defaultView, '*', 'extension-core', 'extension-app'));
appRpc.clone = (data) => {
	return cloneInto(data, unsafeWindow);
};

pageAccess.syncService = selfWorker.options.syncService;
pageAccess.oauthRedirectUrl = OAUTH_REDIRECT_URL;

appRpc.onAsync('find-fields', (done) => {
	addonRpc.call('find-fields', [], (err: any, fields: forms.InputField[]) => {
		done(err, fields);
	});
});

appRpc.onAsync('autofill', (done: (err: any, count: number) => void, fields: forms.AutoFillEntry[]) => {
	addonRpc.call('autofill', [fields], (err: any, count: number) => {
		done(err, count);
	});
});

appRpc.onAsync('fetch-url', (done: (err:any, info: site_info_service.UrlResponse) => void, url: string) => {
	addonRpc.call('fetch-url', [url], (err: any, info: site_info_service.UrlResponse) => {
		done(err, info);
	});
});

appRpc.on('hide-panel', () => {
	addonRpc.call('hide-panel', []);
});

addonRpc.on<void>('pagechanged', (url: string) => {
	pageAccess.currentUrl = url;
	appRpc.call('pagechanged', [url]);
});

addonRpc.on('show', () => {
	appRpc.call('show', []);
});

// notify the add-on that the panel content script is ready.
// Note that the panel content script is loaded _before_
// the front-end so this event does not indicate that
// the front-end itself is ready.
addonRpc.call('ready', []);

