/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import MouseObserver from '@ckeditor/ckeditor5-engine/src/view/observer/mouseobserver';
import TwoStepCaretMovement from '@ckeditor/ckeditor5-typing/src/twostepcaretmovement';
import inlineHighlight from '@ckeditor/ckeditor5-typing/src/utils/inlinehighlight';
import Input from '@ckeditor/ckeditor5-typing/src/input';
import Clipboard from '@ckeditor/ckeditor5-clipboard/src/clipboard';
import AnchorCommand from './anchorcommand';
import UnanchorCommand from './unanchorcommand';
import ManualDecorator from './utils/manualdecorator';
import findAttributeRange from '@ckeditor/ckeditor5-typing/src/utils/findattributerange';
import { keyCodes } from '@ckeditor/ckeditor5-utils/src/keyboard';
import { createAnchorElement, ensureSafeUrl, getLocalizedDecorators, normalizeDecorators } from './utils';

import '../theme/anchor.css';

const HIGHLIGHT_CLASS = 'ck-anchor_selected';
const DECORATOR_AUTOMATIC = 'automatic';
const DECORATOR_MANUAL = 'manual';
const EXTERNAL_LINKS_REGEXP = /^(https?:)?\/\//;

/**
 * The anchor engine feature.
 *
 * It introduces the `anchorId="url"` attribute in the model which renders to the view as a `<a id="url">` element
 * as well as `'anchor'` and `'unanchor'` commands.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorEditing';
	}

	/**
	 * @inheritDoc
	 */
	static get requires() {
		// Clipboard is required for handling cut and paste events while typing over the anchor.
		return [ TwoStepCaretMovement, Input, Clipboard ];
	}

	/**
	 * @inheritDoc
	 */
	constructor( editor ) {
		super( editor );

		editor.config.define( 'anchor', {
			addTargetToExternalAnchors: false
		} );
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		// Allow anchor attribute on all inline nodes.
		editor.model.schema.extend( '$text', { allowAttributes: 'anchorId' } );

		editor.conversion.for( 'dataDowncast' )
			.attributeToElement( { model: 'anchorId', view: createAnchorElement } );

		editor.conversion.for( 'editingDowncast' )
			.attributeToElement( { model: 'anchorId', view: ( id, conversionApi ) => {
				return createAnchorElement( ensureSafeUrl( id ), conversionApi );
			} } );

		editor.conversion.for( 'upcast' )
			.elementToAttribute( {
				view: {
					name: 'a',
					attributes: {
						id: true
					}
				},
				model: {
					key: 'anchorId',
					value: viewElement => viewElement.getAttribute( 'id' )
				}
			} );

		// Create anchoring commands.
		editor.commands.add( 'anchor', new AnchorCommand( editor ) );
		editor.commands.add( 'unanchor', new UnanchorCommand( editor ) );

		const anchorDecorators = getLocalizedDecorators( editor.t, normalizeDecorators( editor.config.get( 'anchor.decorators' ) ) );

		this._enableAutomaticDecorators( anchorDecorators.filter( item => item.mode === DECORATOR_AUTOMATIC ) );
		this._enableManualDecorators( anchorDecorators.filter( item => item.mode === DECORATOR_MANUAL ) );

		// Enable two-step caret movement for `anchorId` attribute.
		const twoStepCaretMovementPlugin = editor.plugins.get( TwoStepCaretMovement );
		twoStepCaretMovementPlugin.registerAttribute( 'anchorId' );

		// Setup highlight over selected anchor.
		inlineHighlight( editor, 'anchorId', 'a', HIGHLIGHT_CLASS );

		// Change the attributes of the selection in certain situations after the anchor was inserted into the document.
		this._enableInsertContentSelectionAttributesFixer();

		// Handle a click at the beginning/end of a anchor element.
		this._enableClickingAfterAnchor();

		// Handle typing over the anchor.
		this._enableTypingOverAnchor();

		// Handle removing the content after the anchor element.
		this._handleDeleteContentAfterAnchor();
	}

	/**
	 * Processes an array of configured {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition automatic decorators}
	 * and registers a {@link module:engine/conversion/downcastdispatcher~DowncastDispatcher downcast dispatcher}
	 * for each one of them. Downcast dispatchers are obtained using the
	 * {@link module:anchor/utils~AutomaticDecorators#getDispatcher} method.
	 *
	 * **Note**: This method also activates the automatic external anchor decorator if enabled with
	 * {@link module:anchor/anchor~AnchorConfig#addTargetToExternalAnchors `config.anchor.addTargetToExternalAnchors`}.
	 *
	 * @private
	 * @param {Array.<module:anchor/anchor~AnchorDecoratorAutomaticDefinition>} automaticDecoratorDefinitions
	 */
	_enableAutomaticDecorators( automaticDecoratorDefinitions ) {
		const editor = this.editor;
		// Store automatic decorators in the command instance as we do the same with manual decorators.
		// Thanks to that, `AnchorImageEditing` plugin can re-use the same definitions.
		const command = editor.commands.get( 'anchor' );
		const automaticDecorators = command.automaticDecorators;

		// Adds a default decorator for external anchors.
		if ( editor.config.get( 'anchor.addTargetToExternalAnchors' ) ) {
			automaticDecorators.add( {
				id: 'anchorIsExternal',
				mode: DECORATOR_AUTOMATIC,
				callback: url => EXTERNAL_LINKS_REGEXP.test( url ),
				attributes: {
					target: '_blank',
					rel: 'noopener noreferrer'
				}
			} );
		}

		automaticDecorators.add( automaticDecoratorDefinitions );

		if ( automaticDecorators.length ) {
			editor.conversion.for( 'downcast' ).add( automaticDecorators.getDispatcher() );
		}
	}

	/**
	 * Processes an array of configured {@link module:anchor/anchor~AnchorDecoratorManualDefinition manual decorators},
	 * transforms them into {@link module:anchor/utils~ManualDecorator} instances and stores them in the
	 * {@link module:anchor/anchorcommand~AnchorCommand#manualDecorators} collection (a model for manual decorators state).
	 *
	 * Also registers an {@link module:engine/conversion/downcasthelpers~DowncastHelpers#attributeToElement attribute-to-element}
	 * converter for each manual decorator and extends the {@link module:engine/model/schema~Schema model's schema}
	 * with adequate model attributes.
	 *
	 * @private
	 * @param {Array.<module:anchor/anchor~AnchorDecoratorManualDefinition>} manualDecoratorDefinitions
	 */
	_enableManualDecorators( manualDecoratorDefinitions ) {
		if ( !manualDecoratorDefinitions.length ) {
			return;
		}

		const editor = this.editor;
		const command = editor.commands.get( 'anchor' );
		const manualDecorators = command.manualDecorators;

		manualDecoratorDefinitions.forEach( decorator => {
			editor.model.schema.extend( '$text', { allowAttributes: decorator.id } );

			// Keeps reference to manual decorator to decode its name to attributes during downcast.
			manualDecorators.add( new ManualDecorator( decorator ) );

			editor.conversion.for( 'downcast' ).attributeToElement( {
				model: decorator.id,
				view: ( manualDecoratorName, { writer } ) => {
					if ( manualDecoratorName ) {
						const attributes = manualDecorators.get( decorator.id ).attributes;
						const element = writer.createAttributeElement( 'a', attributes, { priority: 5 } );
						writer.setCustomProperty( 'anchor', true, element );

						return element;
					}
				} } );

			editor.conversion.for( 'upcast' ).elementToAttribute( {
				view: {
					name: 'a',
					attributes: manualDecorators.get( decorator.id ).attributes
				},
				model: {
					key: decorator.id
				}
			} );
		} );
	}

	/**
	 * Starts listening to {@link module:engine/model/model~Model#event:insertContent} and corrects the model
	 * selection attributes if the selection is at the end of a anchor after inserting the content.
	 *
	 * The purpose of this action is to improve the overall UX because the user is no longer "trapped" by the
	 * `anchorId` attribute of the selection and they can type a "clean" (`anchorId`–less) text right away.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/6053.
	 *
	 * @private
	 */
	_enableInsertContentSelectionAttributesFixer() {
		const editor = this.editor;
		const model = editor.model;
		const selection = model.document.selection;
		const anchorCommand = editor.commands.get( 'anchor' );

		this.listenTo( model, 'insertContent', () => {
			const nodeBefore = selection.anchor.nodeBefore;
			const nodeAfter = selection.anchor.nodeAfter;

			// NOTE: ↰ and ↱ represent the gravity of the selection.

			// The only truly valid case is:
			//
			//		                                 ↰
			//		...<$text anchorId="foo">INSERTED[]</$text>
			//
			// If the selection is not "trapped" by the `anchorId` attribute after inserting, there's nothing
			// to fix there.
			if ( !selection.hasAttribute( 'anchorId' ) ) {
				return;
			}

			// Filter out the following case where a anchor with the same id (e.g. <a id="foo">INSERTED</a>) is inserted
			// in the middle of an existing anchor:
			//
			// Before insertion:
			//		                       ↰
			//		<$text anchorId="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//		                               ↰
			//		<$text anchorId="foo">lINSERTED[]ink</$text>
			//
			if ( !nodeBefore ) {
				return;
			}

			// Filter out the following case where the selection has the "anchorId" attribute because the
			// gravity is overridden and some text with another attribute (e.g. <b>INSERTED</b>) is inserted:
			//
			// Before insertion:
			//
			//		                       ↱
			//		<$text anchorId="foo">[]anchor</$text>
			//
			// Expected after insertion:
			//
			//		                                                          ↱
			//		<$text bold="true">INSERTED</$text><$text anchorId="foo">[]anchor</$text>
			//
			if ( !nodeBefore.hasAttribute( 'anchorId' ) ) {
				return;
			}

			// Filter out the following case where a anchor is a inserted in the middle (or before) another anchor
			// (different URLs, so they will not merge). In this (let's say weird) case, we can leave the selection
			// attributes as they are because the user will end up writing in one anchor or another anyway.
			//
			// Before insertion:
			//
			//		                       ↰
			//		<$text anchorId="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//
			//		                                                             ↰
			//		<$text anchorId="foo">l</$text><$text anchorId="bar">INSERTED[]</$text><$text anchorId="foo">ink</$text>
			//
			if ( nodeAfter && nodeAfter.hasAttribute( 'anchorId' ) ) {
				return;
			}

			model.change( writer => {
				removeAnchorAttributesFromSelection( writer, anchorCommand.manualDecorators );
			} );
		}, { priority: 'low' } );
	}

	/**
	 * Starts listening to {@link module:engine/view/document~Document#event:mousedown} and
	 * {@link module:engine/view/document~Document#event:selectionChange} and puts the selection before/after a anchor node
	 * if clicked at the beginning/ending of the anchor.
	 *
	 * The purpose of this action is to allow typing around the anchor node directly after a click.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/1016.
	 *
	 * @private
	 */
	_enableClickingAfterAnchor() {
		const editor = this.editor;
		const anchorCommand = editor.commands.get( 'anchor' );

		editor.editing.view.addObserver( MouseObserver );

		let clicked = false;

		// Detect the click.
		this.listenTo( editor.editing.view.document, 'mousedown', () => {
			clicked = true;
		} );

		// When the selection has changed...
		this.listenTo( editor.editing.view.document, 'selectionChange', () => {
			if ( !clicked ) {
				return;
			}

			// ...and it was caused by the click...
			clicked = false;

			const selection = editor.model.document.selection;

			// ...and no text is selected...
			if ( !selection.isCollapsed ) {
				return;
			}

			// ...and clicked text is the anchor...
			if ( !selection.hasAttribute( 'anchorId' ) ) {
				return;
			}

			const position = selection.getFirstPosition();
			const anchorRange = findAttributeRange( position, 'anchorId', selection.getAttribute( 'anchorId' ), editor.model );

			// ...check whether clicked start/end boundary of the anchor.
			// If so, remove the `anchorId` attribute.
			if ( position.isTouching( anchorRange.start ) || position.isTouching( anchorRange.end ) ) {
				editor.model.change( writer => {
					removeAnchorAttributesFromSelection( writer, anchorCommand.manualDecorators );
				} );
			}
		} );
	}

	/**
	 * Starts listening to {@link module:engine/model/model~Model#deleteContent} and {@link module:engine/model/model~Model#insertContent}
	 * and checks whether typing over the anchor. If so, attributes of removed text are preserved and applied to the inserted text.
	 *
	 * The purpose of this action is to allow modifying a text without loosing the `anchorId` attribute (and other).
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/4762.
	 *
	 * @private
	 */
	_enableTypingOverAnchor() {
		const editor = this.editor;
		const view = editor.editing.view;

		// Selection attributes when started typing over the anchor.
		let selectionAttributes;

		// Whether pressed `Backspace` or `Delete`. If so, attributes should not be preserved.
		let deletedContent;

		// Detect pressing `Backspace` / `Delete`.
		this.listenTo( view.document, 'delete', () => {
			deletedContent = true;
		}, { priority: 'high' } );

		// Listening to `model#deleteContent` allows detecting whether selected content was a anchor.
		// If so, before removing the element, we will copy its attributes.
		this.listenTo( editor.model, 'deleteContent', () => {
			const selection = editor.model.document.selection;

			// Copy attributes only if anything is selected.
			if ( selection.isCollapsed ) {
				return;
			}

			// When the content was deleted, do not preserve attributes.
			if ( deletedContent ) {
				deletedContent = false;

				return;
			}

			// Enabled only when typing.
			if ( !isTyping( editor ) ) {
				return;
			}

			if ( shouldCopyAttributes( editor.model ) ) {
				selectionAttributes = selection.getAttributes();
			}
		}, { priority: 'high' } );

		// Listening to `model#insertContent` allows detecting the content insertion.
		// We want to apply attributes that were removed while typing over the anchor.
		this.listenTo( editor.model, 'insertContent', ( evt, [ element ] ) => {
			deletedContent = false;

			// Enabled only when typing.
			if ( !isTyping( editor ) ) {
				return;
			}

			if ( !selectionAttributes ) {
				return;
			}

			editor.model.change( writer => {
				for ( const [ attribute, value ] of selectionAttributes ) {
					writer.setAttribute( attribute, value, element );
				}
			} );

			selectionAttributes = null;
		}, { priority: 'high' } );
	}

	/**
	 * Starts listening to {@link module:engine/model/model~Model#deleteContent} and checks whether
	 * removing a content right after the "anchorId" attribute.
	 *
	 * If so, the selection should not preserve the `anchorId` attribute. However, if
	 * the {@link module:typing/twostepcaretmovement~TwoStepCaretMovement} plugin is active and
	 * the selection has the "anchorId" attribute due to overriden gravity (at the end), the `anchorId` attribute should stay untouched.
	 *
	 * The purpose of this action is to allow removing the anchor text and keep the selection outside the anchor.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/7521.
	 *
	 * @private
	 */
	_handleDeleteContentAfterAnchor() {
		const editor = this.editor;
		const model = editor.model;
		const selection = model.document.selection;
		const view = editor.editing.view;
		const anchorCommand = editor.commands.get( 'anchor' );

		// A flag whether attributes `anchorId` attribute should be preserved.
		let shouldPreserveAttributes = false;

		// A flag whether the `Backspace` key was pressed.
		let hasBackspacePressed = false;

		// Detect pressing `Backspace`.
		this.listenTo( view.document, 'delete', ( evt, data ) => {
			hasBackspacePressed = data.domEvent.keyCode === keyCodes.backspace;
		}, { priority: 'high' } );

		// Before removing the content, check whether the selection is inside a anchor or at the end of anchor but with 2-SCM enabled.
		// If so, we want to preserve anchor attributes.
		this.listenTo( model, 'deleteContent', () => {
			// Reset the state.
			shouldPreserveAttributes = false;

			const position = selection.getFirstPosition();
			const anchorId = selection.getAttribute( 'anchorId' );

			if ( !anchorId ) {
				return;
			}

			const anchorRange = findAttributeRange( position, 'anchorId', anchorId, model );

			// Preserve `anchorId` attribute if the selection is in the middle of the anchor or
			// the selection is at the end of the anchor and 2-SCM is activated.
			shouldPreserveAttributes = anchorRange.containsPosition( position ) || anchorRange.end.isEqual( position );
		}, { priority: 'high' } );

		// After removing the content, check whether the current selection should preserve the `anchorId` attribute.
		this.listenTo( model, 'deleteContent', () => {
			// If didn't press `Backspace`.
			if ( !hasBackspacePressed ) {
				return;
			}

			hasBackspacePressed = false;

			// Disable the mechanism if inside a anchor (`<$text url="foo">F[]oo</$text>` or <$text url="foo">Foo[]</$text>`).
			if ( shouldPreserveAttributes ) {
				return;
			}

			// Use `model.enqueueChange()` in order to execute the callback at the end of the changes process.
			editor.model.enqueueChange( writer => {
				removeAnchorAttributesFromSelection( writer, anchorCommand.manualDecorators );
			} );
		}, { priority: 'low' } );
	}
}

// Make the selection free of anchor-related model attributes.
// All anchor-related model attributes start with "anchor". That includes not only "anchorId"
// but also all decorator attributes (they have dynamic names).
//
// @param {module:engine/model/writer~Writer} writer
// @param {module:utils/collection~Collection} manualDecorators
function removeAnchorAttributesFromSelection( writer, manualDecorators ) {
	writer.removeSelectionAttribute( 'anchorId' );

	for ( const decorator of manualDecorators ) {
		writer.removeSelectionAttribute( decorator.id );
	}
}

// Checks whether selection's attributes should be copied to the new inserted text.
//
// @param {module:engine/model/model~Model} model
// @returns {Boolean}
function shouldCopyAttributes( model ) {
	const selection = model.document.selection;
	const firstPosition = selection.getFirstPosition();
	const lastPosition = selection.getLastPosition();
	const nodeAtFirstPosition = firstPosition.nodeAfter;

	// The text anchor node does not exist...
	if ( !nodeAtFirstPosition ) {
		return false;
	}

	// ...or it isn't the text node...
	if ( !nodeAtFirstPosition.is( '$text' ) ) {
		return false;
	}

	// ...or isn't the anchor.
	if ( !nodeAtFirstPosition.hasAttribute( 'anchorId' ) ) {
		return false;
	}

	// `textNode` = the position is inside the anchor element.
	// `nodeBefore` = the position is at the end of the anchor element.
	const nodeAtLastPosition = lastPosition.textNode || lastPosition.nodeBefore;

	// If both references the same node selection contains a single text node.
	if ( nodeAtFirstPosition === nodeAtLastPosition ) {
		return true;
	}

	// If nodes are not equal, maybe the anchor nodes has defined additional attributes inside.
	// First, we need to find the entire anchor range.
	const anchorRange = findAttributeRange( firstPosition, 'anchorId', nodeAtFirstPosition.getAttribute( 'anchorId' ), model );

	// Then we can check whether selected range is inside the found anchor range. If so, attributes should be preserved.
	return anchorRange.containsRange( model.createRange( firstPosition, lastPosition ), true );
}

// Checks whether provided changes were caused by typing.
//
// @params {module:core/editor/editor~Editor} editor
// @returns {Boolean}
function isTyping( editor ) {
	const input = editor.plugins.get( 'Input' );

	return input.isInput( editor.model.change( writer => writer.batch ) );
}
