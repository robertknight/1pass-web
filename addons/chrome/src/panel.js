var page = chrome.extension.getBackgroundPage();

// install helper so app can close background
// window after autofill is complete
page.hidePanel = function() {
	window.close();
}.bind(this);

page.renderApp(document.getElementById('app-view'));

chrome.tabs.query({active: true}, function(tabs) {
	if (tabs.length >= 1) {
		var tab = tabs[0];
		page.notifyPageChanged(tab);
	}
});
