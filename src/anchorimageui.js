/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorimageui
 */

import ButtonView from '@ckeditor/ckeditor5-ui/src/button/buttonview';
import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import Image from '@ckeditor/ckeditor5-image/src/image';
import AnchorUI from './anchorui';
import AnchorEditing from './anchorediting';
import { isImageWidget } from '@ckeditor/ckeditor5-image/src/image/utils';
import { LINK_KEYSTROKE } from './utils';

import anchorIcon from '../theme/icons/anchor.svg';

/**
 * The anchor image UI plugin.
 *
 * This plugin provides the `'anchorImage'` button that can be displayed in the {@link module:image/imagetoolbar~ImageToolbar}.
 * It can be used to wrap images in anchors.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorImageUI extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ Image, AnchorEditing, AnchorUI ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorImageUI';
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;
		const viewDocument = editor.editing.view.document;

		this.listenTo( viewDocument, 'click', ( evt, data ) => {
			const hasAnchor = isImageAnchored( viewDocument.selection.getSelectedElement() );

			if ( hasAnchor ) {
				data.preventDefault();
			}
		} );

		this._createToolbarAnchorImageButton();
	}

	/**
	 * Creates a `AnchorImageUI` button view.
	 *
	 * Clicking this button shows a {@link module:anchor/anchorui~AnchorUI#_balloon} attached to the selection.
	 * When an image is already anchored, the view shows {@link module:anchor/anchorui~AnchorUI#actionsView} or
	 * {@link module:anchor/anchorui~AnchorUI#formView} if it is not.
	 *
	 * @private
	 */
	_createToolbarAnchorImageButton() {
		const editor = this.editor;
		const t = editor.t;

		editor.ui.componentFactory.add( 'anchorImage', locale => {
			const button = new ButtonView( locale );
			const plugin = editor.plugins.get( 'AnchorUI' );
			const anchorCommand = editor.commands.get( 'anchor' );

			button.set( {
				isEnabled: true,
				label: t( 'Anchor image' ),
				icon: anchorIcon,
				keystroke: LINK_KEYSTROKE,
				tooltip: true,
				isToggleable: true
			} );

			// Bind button to the command.
			button.bind( 'isEnabled' ).to( anchorCommand, 'isEnabled' );
			button.bind( 'isOn' ).to( anchorCommand, 'value', value => !!value );

			// Show the actionsView or formView (both from AnchorUI) on button click depending on whether the image is anchored already.
			this.listenTo( button, 'execute', () => {
				const hasAnchor = isImageAnchored( editor.editing.view.document.selection.getSelectedElement() );

				if ( hasAnchor ) {
					plugin._addActionsView();
				} else {
					plugin._showUI( true );
				}
			} );

			return button;
		} );
	}
}

// A helper function that checks whether the element is a anchored image.
//
// @param {module:engine/model/element~Element} element
// @returns {Boolean}
function isImageAnchored( element ) {
	const isImage = element && isImageWidget( element );

	if ( !isImage ) {
		return false;
	}

	return element.getChild( 0 ).is( 'element', 'a' );
}
