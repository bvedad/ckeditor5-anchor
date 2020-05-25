/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorimage
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import AnchorImageEditing from './anchorimageediting';
import AnchorImageUI from './anchorimageui';

import '../theme/anchorimage.css';

/**
 * The `AnchorImage` plugin.
 *
 * This is a "glue" plugin that loads the {@link module:anchor/anchorimageediting~AnchorImageEditing anchor image editing feature}
 * and {@link module:anchor/anchorimageui~AnchorImageUI anchor image UI feature}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorImage extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ AnchorImageEditing, AnchorImageUI ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorImage';
	}
}
