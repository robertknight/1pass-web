/// <reference path="../../typings/react-0.12.d.ts" />

import react = require('react');
import typed_react = require('typed-react');
import style = require('ts-style');

import div = require('../base/div');
import fonts = require('../fonts');
import reactutil = require('../base/reactutil');
import ripple = require('./ripple');
import theme = require('../theme');

export interface MenuItem {
	label: string;
	onClick: () => void;
}

interface MenuState {
	entering?: boolean;
	showTime?: Date;
}

export interface MenuProps {
	/** The source rect of the icon which triggered the
	  * menu.
	  */
	sourceRect: reactutil.Rect;

	/** The viewport within which the menu is being
	  * displayed.
	  */
	viewportRect: reactutil.Rect;

	/** List of menu items to display in the menu. */
	items: MenuItem[];

	/** Callback to invoke when the menu is dismissed. */
	onDismiss: () => void;
}

function measureText(document: Document, text: string, font: string) {
	if (!document) {
		// in non-browser contexts, use a dummy value
		return text.length * 10;
	}

	var HELPER_CANVAS_ID = 'materialMenuCanvas';
	var menuCanvas = <HTMLCanvasElement>document.getElementById(HELPER_CANVAS_ID);
	if (!menuCanvas) {
		menuCanvas = document.createElement('canvas');
		menuCanvas.id = HELPER_CANVAS_ID;
		menuCanvas.style.display = 'none';
		document.body.appendChild(menuCanvas);
	}
	var context = menuCanvas.getContext('2d');
	context.font = font;
	return context.measureText(text).width;
}

/** A material-design style menu.
  *
  * See http://www.google.co.uk/design/spec/components/menus.html
  *
  * On small screens, this component automatically
  * displays as a bottom sheet
  * (see http://www.google.co.uk/design/spec/components/bottom-sheets.html)
  */
export class Menu extends typed_react.Component<MenuProps, MenuState> {
	getInitialState() {
		return {
			showTime: new Date,
			entering: true
		}
	}

	componentDidMount() {
		this.setState({showTime: new Date});
	}

	// returns true if this menu should be displayed
	// as a sheet sliding in from one edge of the app.
	//
	// Referred to as a 'Bottom Sheet' in the Material Design
	// specs
	private displayAsSheet() {
		var SMALL_SCREEN_WIDTH_THRESHOLD = 400;
		return reactutil.rectWidth(this.props.viewportRect) < SMALL_SCREEN_WIDTH_THRESHOLD;
	}

	private getMenuRect() {
		// On large screens (tablet, desktop), the menu is
		// positioned such that one of the corners is aligned
		// with a corner of the source rect. If space permits,
		// this is the top-left corner. Otherwise one of the
		// other corners is aligned.
		//
		// On small screens (phone), the menu will slide in
		// from one of the edges of the display and use the
		// full width of that edge

		var MENU_ITEM_HEIGHT = 48;
		var VIEWPORT_EDGE_MARGIN = 3;

		var viewRect = this.props.viewportRect;
		var srcRect = {
			left: this.props.sourceRect.left,
			right: this.props.sourceRect.right,
			top: this.props.sourceRect.top,
			bottom: this.props.sourceRect.bottom
		};

		srcRect.left = Math.max(srcRect.left, viewRect.left + VIEWPORT_EDGE_MARGIN);
		srcRect.right = Math.min(srcRect.right, viewRect.right - VIEWPORT_EDGE_MARGIN);
		srcRect.top = Math.max(srcRect.top, viewRect.top + VIEWPORT_EDGE_MARGIN);
		srcRect.bottom = Math.min(srcRect.bottom, viewRect.bottom - VIEWPORT_EDGE_MARGIN);

		var menuRect: reactutil.Rect;
		var expandedHeight = this.props.items.length * MENU_ITEM_HEIGHT;
		expandedHeight += theme.menu.paddingTop + theme.menu.paddingBottom;

		// ideally this should be adjusted to fit the text
		// of menu items
		var menuWidth = 0;
		var itemFont = theme.menu.item.fontSize + 'px ' + fonts.FAMILY;

		var document: Document;
		if (this.isMounted()) {
			document = (<HTMLElement>this.getDOMNode()).ownerDocument;
		}

		this.props.items.forEach((item) => {
			var itemWidth = measureText(document, item.label, itemFont);
			menuWidth = Math.max(menuWidth, itemWidth);
		});
		menuWidth += theme.menu.item.paddingLeft + theme.menu.item.paddingRight;

		if (this.displayAsSheet()) {
			// show menu at bottom of display
			menuRect = {
				left: viewRect.left,
				bottom: viewRect.bottom,
				right: viewRect.right,
				top: viewRect.bottom - expandedHeight
			};
		} else {
			var hasSpaceToRight = viewRect.right - srcRect.left > menuWidth;
			var hasSpaceBelow = viewRect.bottom - srcRect.top > expandedHeight;

			if (hasSpaceToRight) {
				if (hasSpaceBelow) {
					// align TL of source rect with TL of menu
					menuRect = {
						top: srcRect.top,
						left: srcRect.left,
						right: srcRect.left + menuWidth,
						bottom: srcRect.top + expandedHeight
					};
				} else {
					// align BL of source rect with BL of menu
					menuRect = {
						top: srcRect.bottom - expandedHeight,
						left: srcRect.left,
						right: srcRect.left + menuWidth,
						bottom: srcRect.bottom
					};
				}
			} else {
				if (hasSpaceBelow) {
					// align TR of source rect with TR of menu
					menuRect = {
						top: srcRect.top,
						left: srcRect.right - menuWidth,
						right: srcRect.right,
						bottom: srcRect.top + expandedHeight
					};
				} else {
					// align BR of source rect with BR of menu
					menuRect = {
						top: srcRect.bottom - expandedHeight,
						left: srcRect.right - menuWidth,
						right: srcRect.right,
						bottom: srcRect.bottom
					};
				}
			}
		}

		return menuRect;
	}

	render() {
		var menuItems = this.props.items.map((item) => {
			return div(theme.menu.item, {
				key: item.label,
				onClick: () => {
					// when the menu is first opened, ignore any immediate taps that
					// might still be events from the user tapping to open the menu
					var MIN_ITEM_CLICK_DELAY = 500;
					if (Date.now() - this.state.showTime.getTime() < MIN_ITEM_CLICK_DELAY) {
						return;
					}

					setTimeout(() => {
						item.onClick();
						this.props.onDismiss();
					}, 300);
				}
			}, 
				ripple.InkRippleF({radius: 100}),
				div(theme.menu.item.label, {}, item.label)
			);
		});

		var visibleMs = Date.now() - this.state.showTime.getTime();
		var menuRect = this.getMenuRect();
		var menuOpacity = 0;
		var menuTransform = 'translateY(0px)';

		if (this.state.entering) {
			window.setTimeout(() => {
				this.setState({entering: false});
			}, 10);
		};

		if (!this.state.entering || this.displayAsSheet()) {
			// menus fade in. Sheets slide in from a screen edge
			menuOpacity = 1.0;
		}

		var overlayStyles: any[] = [theme.menu.overlay];
		if (this.displayAsSheet()) {
			if (!this.state.entering) {
				// see http://www.google.co.uk/design/spec/components/bottom-sheets.html#bottom-sheets-specs
				overlayStyles.push({opacity: .2});
			} else {
				menuTransform = 'translateY(' + reactutil.rectHeight(menuRect) + 'px)';
			}
		}

		return div(theme.menu.container, {},
			react.DOM.div(style.mixin(overlayStyles, {
				onClick: (e: React.MouseEvent) => {
					this.props.onDismiss();
				}
			})),
			div(theme.menu, {
				ref: 'menu',
				style: reactutil.prefix({
					top: menuRect.top,
					left: menuRect.left,
					width: menuRect.right - menuRect.left,
					height: menuRect.bottom - menuRect.top,
					opacity: menuOpacity,
					transform: menuTransform
				}),
			}, menuItems)
		);
	}
}

export var MenuF = reactutil.createFactory(Menu);

