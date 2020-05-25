/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorcommand
 */

import Command from '@ckeditor/ckeditor5-core/src/command';
import findAttributeRange from '@ckeditor/ckeditor5-typing/src/utils/findattributerange';
import toMap from '@ckeditor/ckeditor5-utils/src/tomap';
import Collection from '@ckeditor/ckeditor5-utils/src/collection';
import first from '@ckeditor/ckeditor5-utils/src/first';
import AutomaticDecorators from './utils/automaticdecorators';
import { isImageAllowed } from './utils';

/**
 * The anchor command. It is used by the {@link module:anchor/anchor~Anchor anchor feature}.
 *
 * @extends module:core/command~Command
 */
export default class AnchorCommand extends Command {
	/**
	 * The value of the `'anchorId'` attribute if the start of the selection is located in a node with this attribute.
	 *
	 * @observable
	 * @readonly
	 * @member {Object|undefined} #value
	 */

	constructor( editor ) {
		super( editor );

		/**
		 * A collection of {@link module:anchor/utils~ManualDecorator manual decorators}
		 * corresponding to the {@link module:anchor/anchor~AnchorConfig#decorators decorator configuration}.
		 *
		 * You can consider it a model with states of manual decorators added to the currently selected anchor.
		 *
		 * @readonly
		 * @type {module:utils/collection~Collection}
		 */
		this.manualDecorators = new Collection();

		/**
		 * An instance of the helper that ties together all {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition}
		 * that are used by the {@ganchor features/anchor anchor} and the {@ganchor features/image#anchoring-images anchoring images} features.
		 *
		 * @readonly
		 * @type {module:anchor/utils~AutomaticDecorators}
		 */
		this.automaticDecorators = new AutomaticDecorators();
	}

	/**
	 * Synchronizes the state of {@link #manualDecorators} with the currently present elements in the model.
	 */
	restoreManualDecoratorStates() {
		for ( const manualDecorator of this.manualDecorators ) {
			manualDecorator.value = this._getDecoratorStateFromModel( manualDecorator.id );
		}
	}

	/**
	 * @inheritDoc
	 */
	refresh() {
		const model = this.editor.model;
		const doc = model.document;

		const selectedElement = first( doc.selection.getSelectedBlocks() );

		// A check for the `AnchorImage` plugin. If the selection contains an element, get values from the element.
		// Currently the selection reads attributes from text nodes only. See #7429 and #7465.
		if ( isImageAllowed( selectedElement, model.schema ) ) {
			this.value = selectedElement.getAttribute( 'anchorId' );
			this.isEnabled = model.schema.checkAttribute( selectedElement, 'anchorId' );
		} else {
			this.value = doc.selection.getAttribute( 'anchorId' );
			this.isEnabled = model.schema.checkAttributeInSelection( doc.selection, 'anchorId' );
		}

		for ( const manualDecorator of this.manualDecorators ) {
			manualDecorator.value = this._getDecoratorStateFromModel( manualDecorator.id );
		}
	}

	/**
	 * Executes the command.
	 *
	 * When the selection is non-collapsed, the `anchorId` attribute will be applied to nodes inside the selection, but only to
	 * those nodes where the `anchorId` attribute is allowed (disallowed nodes will be omitted).
	 *
	 * When the selection is collapsed and is not inside the text with the `anchorId` attribute, a
	 * new {@link module:engine/model/text~Text text node} with the `anchorId` attribute will be inserted in place of the caret, but
	 * only if such element is allowed in this place. The `_data` of the inserted text will equal the `id` parameter.
	 * The selection will be updated to wrap the just inserted text node.
	 *
	 * When the selection is collapsed and inside the text with the `anchorId` attribute, the attribute value will be updated.
	 *
	 * # Decorators and model attribute management
	 *
	 * There is an optional argument to this command that applies or removes model
	 * {@ganchor framework/guides/architecture/editing-engine#text-attributes text attributes} brought by
	 * {@link module:anchor/utils~ManualDecorator manual anchor decorators}.
	 *
	 * Text attribute names in the model correspond to the entries in the {@link module:anchor/anchor~AnchorConfig#decorators configuration}.
	 * For every decorator configured, a model text attribute exists with the "anchor" prefix. For example, a `'anchorMyDecorator'` attribute
	 * corresponds to `'myDecorator'` in the configuration.
	 *
	 * To learn more about anchor decorators, check out the {@link module:anchor/anchor~AnchorConfig#decorators `config.anchor.decorators`}
	 * documentation.
	 *
	 * Here is how to manage decorator attributes with the anchor command:
	 *
	 *		const anchorCommand = editor.commands.get( 'anchor' );
	 *
	 *		// Adding a new decorator attribute.
	 *		anchorCommand.execute( 'http://example.com', {
	 *			anchorIsExternal: true
	 *		} );
	 *
	 *		// Removing a decorator attribute from the selection.
	 *		anchorCommand.execute( 'http://example.com', {
	 *			anchorIsExternal: false
	 *		} );
	 *
	 *		// Adding multiple decorator attributes at the same time.
	 *		anchorCommand.execute( 'http://example.com', {
	 *			anchorIsExternal: true
	 *		} );
	 *
	 *		// Removing and adding decorator attributes at the same time.
	 *		anchorCommand.execute( 'http://example.com', {
	 *			anchorIsExternal: false,
	 *			anchorFoo: true
	 *		} );
	 *
	 * **Note**: If the decorator attribute name is not specified, its state remains untouched.
	 *
	 * **Note**: {@link module:anchor/unanchorcommand~UnanchorCommand#execute `UnanchorCommand#execute()`} removes all
	 * decorator attributes.
	 *
	 * @fires execute
	 * @param {String} id Anchor destination.
	 * @param {Object} [manualDecoratorIds={}] The information about manual decorator attributes to be applied or removed upon execution.
	 */
	execute( id, manualDecoratorIds = {} ) {
		const model = this.editor.model;
		const selection = model.document.selection;
		// Stores information about manual decorators to turn them on/off when command is applied.
		const truthyManualDecorators = [];
		const falsyManualDecorators = [];

		for ( const name in manualDecoratorIds ) {
			if ( manualDecoratorIds[ name ] ) {
				truthyManualDecorators.push( name );
			} else {
				falsyManualDecorators.push( name );
			}
		}

		model.change( writer => {
			// If selection is collapsed then update selected anchor or insert new one at the place of caret.
			if ( selection.isCollapsed ) {
				const position = selection.getFirstPosition();

				// When selection is inside text with `anchorId` attribute.
				if ( selection.hasAttribute( 'anchorId' ) ) {
					// Then update `anchorId` value.
					const anchorRange = findAttributeRange( position, 'anchorId', selection.getAttribute( 'anchorId' ), model );

					writer.setAttribute( 'anchorId', id, anchorRange );

					truthyManualDecorators.forEach( item => {
						writer.setAttribute( item, true, anchorRange );
					} );

					falsyManualDecorators.forEach( item => {
						writer.removeAttribute( item, anchorRange );
					} );

					// Put the selection at the end of the updated anchor.
					writer.setSelection( writer.createPositionAfter( anchorRange.end.nodeBefore ) );
				}
				// If not then insert text node with `anchorId` attribute in place of caret.
				// However, since selection in collapsed, attribute value will be used as data for text node.
				// So, if `id` is empty, do not create text node.
				else if ( id !== '' ) {
					const attributes = toMap( selection.getAttributes() );

					attributes.set( 'anchorId', id );

					truthyManualDecorators.forEach( item => {
						attributes.set( item, true );
					} );

					const { end: positionAfter } = model.insertContent( writer.createText( id, attributes ), position );

					// Put the selection at the end of the inserted anchor.
					// Using end of range returned from insertContent in case nodes with the same attributes got merged.
					writer.setSelection( positionAfter );
				}

				// Remove the `anchorId` attribute and all anchor decorators from the selection.
				// It stops adding a new content into the anchor element.
				[ 'anchorId', ...truthyManualDecorators, ...falsyManualDecorators ].forEach( item => {
					writer.removeSelectionAttribute( item );
				} );
			} else {
				// If selection has non-collapsed ranges, we change attribute on nodes inside those ranges
				// omitting nodes where the `anchorId` attribute is disallowed.
				const ranges = model.schema.getValidRanges( selection.getRanges(), 'anchorId' );

				// But for the first, check whether the `anchorId` attribute is allowed on selected blocks (e.g. the "image" element).
				const allowedRanges = [];

				for ( const element of selection.getSelectedBlocks() ) {
					if ( model.schema.checkAttribute( element, 'anchorId' ) ) {
						allowedRanges.push( writer.createRangeOn( element ) );
					}
				}

				// Ranges that accept the `anchorId` attribute. Since we will iterate over `allowedRanges`, let's clone it.
				const rangesToUpdate = allowedRanges.slice();

				// For all selection ranges we want to check whether given range is inside an element that accepts the `anchorId` attribute.
				// If so, we don't want to propagate applying the attribute to its children.
				for ( const range of ranges ) {
					if ( this._isRangeToUpdate( range, allowedRanges ) ) {
						rangesToUpdate.push( range );
					}
				}

				for ( const range of rangesToUpdate ) {
					writer.setAttribute( 'anchorId', id, range );

					truthyManualDecorators.forEach( item => {
						writer.setAttribute( item, true, range );
					} );

					falsyManualDecorators.forEach( item => {
						writer.removeAttribute( item, range );
					} );
				}
			}
		} );
	}

	/**
	 * Provides information whether a decorator with a given name is present in the currently processed selection.
	 *
	 * @private
	 * @param {String} decoratorName The name of the manual decorator used in the model
	 * @returns {Boolean} The information whether a given decorator is currently present in the selection.
	 */
	_getDecoratorStateFromModel( decoratorName ) {
		const model = this.editor.model;
		const doc = model.document;

		const selectedElement = first( doc.selection.getSelectedBlocks() );

		// A check for the `AnchorImage` plugin. If the selection contains an element, get values from the element.
		// Currently the selection reads attributes from text nodes only. See #7429 and #7465.
		if ( isImageAllowed( selectedElement, model.schema ) ) {
			return selectedElement.getAttribute( decoratorName );
		}

		return doc.selection.getAttribute( decoratorName );
	}

	/**
	 * Checks whether specified `range` is inside an element that accepts the `anchorId` attribute.
	 *
	 * @private
	 * @param {module:engine/view/range~Range} range A range to check.
	 * @param {Array.<module:engine/view/range~Range>} allowedRanges An array of ranges created on elements where the attribute is accepted.
	 * @returns {Boolean}
	 */
	_isRangeToUpdate( range, allowedRanges ) {
		for ( const allowedRange of allowedRanges ) {
			// A range is inside an element that will have the `anchorId` attribute. Do not modify its nodes.
			if ( allowedRange.containsRange( range ) ) {
				return false;
			}
		}

		return true;
	}
}
