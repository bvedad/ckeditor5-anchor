/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/unanchorcommand
 */

import Command from '@ckeditor/ckeditor5-core/src/command';
import findAttributeRange from '@ckeditor/ckeditor5-typing/src/utils/findattributerange';
import first from '@ckeditor/ckeditor5-utils/src/first';
import { isImageAllowed } from './utils';

/**
 * The unanchor command. It is used by the {@link module:anchor/anchor~Anchor anchor plugin}.
 *
 * @extends module:core/command~Command
 */
export default class UnanchorCommand extends Command {
	/**
	 * @inheritDoc
	 */
	refresh() {
		const model = this.editor.model;
		const doc = model.document;

		const selectedElement = first( doc.selection.getSelectedBlocks() );

		// A check for the `AnchorImage` plugin. If the selection contains an image element, get values from the element.
		// Currently the selection reads attributes from text nodes only. See #7429 and #7465.
		if ( isImageAllowed( selectedElement, model.schema ) ) {
			this.isEnabled = model.schema.checkAttribute( selectedElement, 'anchorId' );
		} else {
			this.isEnabled = model.schema.checkAttributeInSelection( doc.selection, 'anchorId' );
		}
	}

	/**
	 * Executes the command.
	 *
	 * When the selection is collapsed, it removes the `anchorId` attribute from each node with the same `anchorId` attribute value.
	 * When the selection is non-collapsed, it removes the `anchorId` attribute from each node in selected ranges.
	 *
	 * # Decorators
	 *
	 * If {@link module:anchor/anchor~AnchorConfig#decorators `config.anchor.decorators`} is specified,
	 * all configured decorators are removed together with the `anchorId` attribute.
	 *
	 * @fires execute
	 */
	execute() {
		const editor = this.editor;
		const model = this.editor.model;
		const selection = model.document.selection;
		const anchorCommand = editor.commands.get( 'anchor' );

		model.change( writer => {
			// Get ranges to unanchor.
			const rangesToUnanchor = selection.isCollapsed ?
				[ findAttributeRange(
					selection.getFirstPosition(),
					'anchorId',
					selection.getAttribute( 'anchorId' ),
					model
				) ] :
				model.schema.getValidRanges( selection.getRanges(), 'anchorId' );

			// Remove `anchorId` attribute from specified ranges.
			for ( const range of rangesToUnanchor ) {
				writer.removeAttribute( 'anchorId', range );
				// If there are registered custom attributes, then remove them during unanchor.
				if ( anchorCommand ) {
					for ( const manualDecorator of anchorCommand.manualDecorators ) {
						writer.removeAttribute( manualDecorator.id, range );
					}
				}
			}
		} );
	}
}
