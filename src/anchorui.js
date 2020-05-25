/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorui
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import ClickObserver from '@ckeditor/ckeditor5-engine/src/view/observer/clickobserver';
import { addAnchorProtocolIfApplicable, isAnchorElement, LINK_KEYSTROKE } from './utils';

import ContextualBalloon from '@ckeditor/ckeditor5-ui/src/panel/balloon/contextualballoon';

import clickOutsideHandler from '@ckeditor/ckeditor5-ui/src/bindings/clickoutsidehandler';

import ButtonView from '@ckeditor/ckeditor5-ui/src/button/buttonview';
import AnchorFormView from './ui/anchorformview';
import AnchorActionsView from './ui/anchoractionsview';

import anchorIcon from '../theme/icons/anchor.svg';

const VISUAL_SELECTION_MARKER_NAME = 'anchor-ui';

/**
 * The anchor UI plugin. It introduces the `'anchor'` and `'unanchor'` buttons and support for the <kbd>Ctrl+M</kbd> keystroke.
 *
 * It uses the
 * {@link module:ui/panel/balloon/contextualballoon~ContextualBalloon contextual balloon plugin}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorUI extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ ContextualBalloon ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorUI';
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		editor.editing.view.addObserver( ClickObserver );

		/**
		 * The actions view displayed inside of the balloon.
		 *
		 * @member {module:anchor/ui/anchoractionsview~AnchorActionsView}
		 */
		this.actionsView = this._createActionsView();

		/**
		 * The form view displayed inside the balloon.
		 *
		 * @member {module:anchor/ui/anchorformview~AnchorFormView}
		 */
		this.formView = this._createFormView();

		/**
		 * The contextual balloon plugin instance.
		 *
		 * @private
		 * @member {module:ui/panel/balloon/contextualballoon~ContextualBalloon}
		 */
		this._balloon = editor.plugins.get( ContextualBalloon );

		// Create toolbar buttons.
		this._createToolbarAnchorButton();

		// Attach lifecycle actions to the the balloon.
		this._enableUserBalloonInteractions();

		// Renders a fake visual selection marker on an expanded selection.
		editor.conversion.for( 'editingDowncast' ).markerToHighlight( {
			model: VISUAL_SELECTION_MARKER_NAME,
			view: {
				classes: [ 'ck-fake-anchor-selection' ]
			}
		} );

		// Renders a fake visual selection marker on a collapsed selection.
		editor.conversion.for( 'editingDowncast' ).markerToElement( {
			model: VISUAL_SELECTION_MARKER_NAME,
			view: {
				name: 'span',
				classes: [ 'ck-fake-anchor-selection', 'ck-fake-anchor-selection_collapsed' ]
			}
		} );
	}

	/**
	 * @inheritDoc
	 */
	destroy() {
		super.destroy();

		// Destroy created UI components as they are not automatically destroyed (see ckeditor5#1341).
		this.formView.destroy();
	}

	/**
	 * Creates the {@link module:anchor/ui/anchoractionsview~AnchorActionsView} instance.
	 *
	 * @private
	 * @returns {module:anchor/ui/anchoractionsview~AnchorActionsView} The anchor actions view instance.
	 */
	_createActionsView() {
		const editor = this.editor;
		const actionsView = new AnchorActionsView( editor.locale );
		const anchorCommand = editor.commands.get( 'anchor' );
		const unanchorCommand = editor.commands.get( 'unanchor' );

		actionsView.bind( 'id' ).to( anchorCommand, 'value' );
		actionsView.editButtonView.bind( 'isEnabled' ).to( anchorCommand );
		actionsView.unanchorButtonView.bind( 'isEnabled' ).to( unanchorCommand );

		// Execute unanchor command after clicking on the "Edit" button.
		this.listenTo( actionsView, 'edit', () => {
			this._addFormView();
		} );

		// Execute unanchor command after clicking on the "Unanchor" button.
		this.listenTo( actionsView, 'unanchor', () => {
			editor.execute( 'unanchor' );
			this._hideUI();
		} );

		// Close the panel on esc key press when the **actions have focus**.
		actionsView.keystrokes.set( 'Esc', ( data, cancel ) => {
			this._hideUI();
			cancel();
		} );

		// Open the form view on Ctrl+M when the **actions have focus**..
		actionsView.keystrokes.set( LINK_KEYSTROKE, ( data, cancel ) => {
			this._addFormView();
			cancel();
		} );

		return actionsView;
	}

	/**
	 * Creates the {@link module:anchor/ui/anchorformview~AnchorFormView} instance.
	 *
	 * @private
	 * @returns {module:anchor/ui/anchorformview~AnchorFormView} The anchor form view instance.
	 */
	_createFormView() {
		const editor = this.editor;
		const anchorCommand = editor.commands.get( 'anchor' );
		const defaultProtocol = editor.config.get( 'anchor.defaultProtocol' );

		const formView = new AnchorFormView( editor.locale, anchorCommand );

		formView.urlInputView.fieldView.bind( 'value' ).to( anchorCommand, 'value' );

		// Form elements should be read-only when corresponding commands are disabled.
		formView.urlInputView.bind( 'isReadOnly' ).to( anchorCommand, 'isEnabled', value => !value );
		formView.saveButtonView.bind( 'isEnabled' ).to( anchorCommand );

		// Execute anchor command after clicking the "Save" button.
		this.listenTo( formView, 'submit', () => {
			const { value } = formView.urlInputView.fieldView.element;
			const parsedUrl = addAnchorProtocolIfApplicable( value, defaultProtocol );
			editor.execute( 'anchor', parsedUrl, formView.getDecoratorSwitchesState() );
			this._closeFormView();
		} );

		// Hide the panel after clicking the "Cancel" button.
		this.listenTo( formView, 'cancel', () => {
			this._closeFormView();
		} );

		// Close the panel on esc key press when the **form has focus**.
		formView.keystrokes.set( 'Esc', ( data, cancel ) => {
			this._closeFormView();
			cancel();
		} );

		return formView;
	}

	/**
	 * Creates a toolbar Anchor button. Clicking this button will show
	 * a {@link #_balloon} attached to the selection.
	 *
	 * @private
	 */
	_createToolbarAnchorButton() {
		const editor = this.editor;
		const anchorCommand = editor.commands.get( 'anchor' );
		const t = editor.t;

		// Handle the `Ctrl+M` keystroke and show the panel.
		editor.keystrokes.set( LINK_KEYSTROKE, ( keyEvtData, cancel ) => {
			// Prevent focusing the search bar in FF, Chrome and Edge. See https://github.com/ckeditor/ckeditor5/issues/4811.
			cancel();

			if ( anchorCommand.isEnabled ) {
				this._showUI( true );
			}
		} );

		editor.ui.componentFactory.add( 'anchor', locale => {
			const button = new ButtonView( locale );

			button.isEnabled = true;
			button.label = t( 'Anchor' );
			button.icon = anchorIcon;
			button.keystroke = LINK_KEYSTROKE;
			button.tooltip = true;
			button.isToggleable = true;

			// Bind button to the command.
			button.bind( 'isEnabled' ).to( anchorCommand, 'isEnabled' );
			button.bind( 'isOn' ).to( anchorCommand, 'value', value => !!value );

			// Show the panel on button click.
			this.listenTo( button, 'execute', () => this._showUI( true ) );

			return button;
		} );
	}

	/**
	 * Attaches actions that control whether the balloon panel containing the
	 * {@link #formView} is visible or not.
	 *
	 * @private
	 */
	_enableUserBalloonInteractions() {
		const viewDocument = this.editor.editing.view.document;

		// Handle click on view document and show panel when selection is placed inside the anchor element.
		// Keep panel open until selection will be inside the same anchor element.
		this.listenTo( viewDocument, 'click', () => {
			const parentAnchor = this._getSelectedAnchorElement();

			if ( parentAnchor ) {
				// Then show panel but keep focus inside editor editable.
				this._showUI();
			}
		} );

		// Focus the form if the balloon is visible and the Tab key has been pressed.
		this.editor.keystrokes.set( 'Tab', ( data, cancel ) => {
			if ( this._areActionsVisible && !this.actionsView.focusTracker.isFocused ) {
				this.actionsView.focus();
				cancel();
			}
		}, {
			// Use the high priority because the anchor UI navigation is more important
			// than other feature's actions, e.g. list indentation.
			// https://github.com/ckeditor/ckeditor5-anchor/issues/146
			priority: 'high'
		} );

		// Close the panel on the Esc key press when the editable has focus and the balloon is visible.
		this.editor.keystrokes.set( 'Esc', ( data, cancel ) => {
			if ( this._isUIVisible ) {
				this._hideUI();
				cancel();
			}
		} );

		// Close on click outside of balloon panel element.
		clickOutsideHandler( {
			emitter: this.formView,
			activator: () => this._isUIInPanel,
			contextElements: [ this._balloon.view.element ],
			callback: () => this._hideUI()
		} );
	}

	/**
	 * Adds the {@link #actionsView} to the {@link #_balloon}.
	 *
	 * @protected
	 */
	_addActionsView() {
		if ( this._areActionsInPanel ) {
			return;
		}

		this._balloon.add( {
			view: this.actionsView,
			position: this._getBalloonPositionData()
		} );
	}

	/**
	 * Adds the {@link #formView} to the {@link #_balloon}.
	 *
	 * @protected
	 */
	_addFormView() {
		if ( this._isFormInPanel ) {
			return;
		}

		const editor = this.editor;
		const anchorCommand = editor.commands.get( 'anchor' );

		this.formView.disableCssTransitions();

		this._balloon.add( {
			view: this.formView,
			position: this._getBalloonPositionData()
		} );

		// Select input when form view is currently visible.
		if ( this._balloon.visibleView === this.formView ) {
			this.formView.urlInputView.fieldView.select();
		}

		this.formView.enableCssTransitions();

		// Make sure that each time the panel shows up, the URL field remains in sync with the value of
		// the command. If the user typed in the input, then canceled the balloon (`urlInputView.fieldView#value` stays
		// unaltered) and re-opened it without changing the value of the anchor command (e.g. because they
		// clicked the same anchor), they would see the old value instead of the actual value of the command.
		// https://github.com/ckeditor/ckeditor5-anchor/issues/78
		// https://github.com/ckeditor/ckeditor5-anchor/issues/123
		this.formView.urlInputView.fieldView.element.value = anchorCommand.value || '';
	}

	/**
	 * Closes the form view. Decides whether the balloon should be hidden completely or if the action view should be shown. This is
	 * decided upon the anchor command value (which has a value if the document selection is in the anchor).
	 *
	 * Additionally, if any {@link module:anchor/anchor~AnchorConfig#decorators} are defined in the editor configuration, the state of
	 * switch buttons responsible for manual decorator handling is restored.
	 *
	 * @private
	 */
	_closeFormView() {
		const anchorCommand = this.editor.commands.get( 'anchor' );

		// Restore manual decorator states to represent the current model state. This case is important to reset the switch buttons
		// when the user cancels the editing form.
		anchorCommand.restoreManualDecoratorStates();

		if ( anchorCommand.value !== undefined ) {
			this._removeFormView();
		} else {
			this._hideUI();
		}
	}

	/**
	 * Removes the {@link #formView} from the {@link #_balloon}.
	 *
	 * @protected
	 */
	_removeFormView() {
		if ( this._isFormInPanel ) {
			// Blur the input element before removing it from DOM to prevent issues in some browsers.
			// See https://github.com/ckeditor/ckeditor5/issues/1501.
			this.formView.saveButtonView.focus();

			this._balloon.remove( this.formView );

			// Because the form has an input which has focus, the focus must be brought back
			// to the editor. Otherwise, it would be lost.
			this.editor.editing.view.focus();

			this._hideFakeVisualSelection();
		}
	}

	/**
	 * Shows the correct UI type. It is either {@link #formView} or {@link #actionsView}.
	 *
	 * @param {Boolean} forceVisible
	 * @private
	 */
	_showUI( forceVisible = false ) {
		// When there's no anchor under the selection, go straight to the editing UI.
		if ( !this._getSelectedAnchorElement() ) {
			// Show visual selection on a text without a anchor when the contextual balloon is displayed.
			// See https://github.com/ckeditor/ckeditor5/issues/4721.
			this._showFakeVisualSelection();

			this._addActionsView();

			// Be sure panel with anchor is visible.
			if ( forceVisible ) {
				this._balloon.showStack( 'main' );
			}

			this._addFormView();
		}
		// If there's a anchor under the selection...
		else {
			// Go to the editing UI if actions are already visible.
			if ( this._areActionsVisible ) {
				this._addFormView();
			}
			// Otherwise display just the actions UI.
			else {
				this._addActionsView();
			}

			// Be sure panel with anchor is visible.
			if ( forceVisible ) {
				this._balloon.showStack( 'main' );
			}
		}

		// Begin responding to ui#update once the UI is added.
		this._startUpdatingUI();
	}

	/**
	 * Removes the {@link #formView} from the {@link #_balloon}.
	 *
	 * See {@link #_addFormView}, {@link #_addActionsView}.
	 *
	 * @protected
	 */
	_hideUI() {
		if ( !this._isUIInPanel ) {
			return;
		}

		const editor = this.editor;

		this.stopListening( editor.ui, 'update' );
		this.stopListening( this._balloon, 'change:visibleView' );

		// Make sure the focus always gets back to the editable _before_ removing the focused form view.
		// Doing otherwise causes issues in some browsers. See https://github.com/ckeditor/ckeditor5-anchor/issues/193.
		editor.editing.view.focus();

		// Remove form first because it's on top of the stack.
		this._removeFormView();

		// Then remove the actions view because it's beneath the form.
		this._balloon.remove( this.actionsView );

		this._hideFakeVisualSelection();
	}

	/**
	 * Makes the UI react to the {@link module:core/editor/editorui~EditorUI#event:update} event to
	 * reposition itself when the editor UI should be refreshed.
	 *
	 * See: {@link #_hideUI} to learn when the UI stops reacting to the `update` event.
	 *
	 * @protected
	 */
	_startUpdatingUI() {
		const editor = this.editor;
		const viewDocument = editor.editing.view.document;

		let prevSelectedAnchor = this._getSelectedAnchorElement();
		let prevSelectionParent = getSelectionParent();

		const update = () => {
			const selectedAnchor = this._getSelectedAnchorElement();
			const selectionParent = getSelectionParent();

			// Hide the panel if:
			//
			// * the selection went out of the EXISTING anchor element. E.g. user moved the caret out
			//   of the anchor,
			// * the selection went to a different parent when creating a NEW anchor. E.g. someone
			//   else modified the document.
			// * the selection has expanded (e.g. displaying anchor actions then pressing SHIFT+Right arrow).
			//
			// Note: #_getSelectedAnchorElement will return a anchor for a non-collapsed selection only
			// when fully selected.
			if ( ( prevSelectedAnchor && !selectedAnchor ) ||
				( !prevSelectedAnchor && selectionParent !== prevSelectionParent ) ) {
				this._hideUI();
			}
			// Update the position of the panel when:
			//  * anchor panel is in the visible stack
			//  * the selection remains in the original anchor element,
			//  * there was no anchor element in the first place, i.e. creating a new anchor
			else if ( this._isUIVisible ) {
				// If still in a anchor element, simply update the position of the balloon.
				// If there was no anchor (e.g. inserting one), the balloon must be moved
				// to the new position in the editing view (a new native DOM range).
				this._balloon.updatePosition( this._getBalloonPositionData() );
			}

			prevSelectedAnchor = selectedAnchor;
			prevSelectionParent = selectionParent;
		};

		function getSelectionParent() {
			return viewDocument.selection.focus.getAncestors()
				.reverse()
				.find( node => node.is( 'element' ) );
		}

		this.listenTo( editor.ui, 'update', update );
		this.listenTo( this._balloon, 'change:visibleView', update );
	}

	/**
	 * Returns `true` when {@link #formView} is in the {@link #_balloon}.
	 *
	 * @readonly
	 * @protected
	 * @type {Boolean}
	 */
	get _isFormInPanel() {
		return this._balloon.hasView( this.formView );
	}

	/**
	 * Returns `true` when {@link #actionsView} is in the {@link #_balloon}.
	 *
	 * @readonly
	 * @protected
	 * @type {Boolean}
	 */
	get _areActionsInPanel() {
		return this._balloon.hasView( this.actionsView );
	}

	/**
	 * Returns `true` when {@link #actionsView} is in the {@link #_balloon} and it is
	 * currently visible.
	 *
	 * @readonly
	 * @protected
	 * @type {Boolean}
	 */
	get _areActionsVisible() {
		return this._balloon.visibleView === this.actionsView;
	}

	/**
	 * Returns `true` when {@link #actionsView} or {@link #formView} is in the {@link #_balloon}.
	 *
	 * @readonly
	 * @protected
	 * @type {Boolean}
	 */
	get _isUIInPanel() {
		return this._isFormInPanel || this._areActionsInPanel;
	}

	/**
	 * Returns `true` when {@link #actionsView} or {@link #formView} is in the {@link #_balloon} and it is
	 * currently visible.
	 *
	 * @readonly
	 * @protected
	 * @type {Boolean}
	 */
	get _isUIVisible() {
		const visibleView = this._balloon.visibleView;

		return visibleView == this.formView || this._areActionsVisible;
	}

	/**
	 * Returns positioning options for the {@link #_balloon}. They control the way the balloon is attached
	 * to the target element or selection.
	 *
	 * If the selection is collapsed and inside a anchor element, the panel will be attached to the
	 * entire anchor element. Otherwise, it will be attached to the selection.
	 *
	 * @private
	 * @returns {module:utils/dom/position~Options}
	 */
	_getBalloonPositionData() {
		const view = this.editor.editing.view;
		const model = this.editor.model;
		const viewDocument = view.document;
		let target = null;

		if ( model.markers.has( VISUAL_SELECTION_MARKER_NAME ) ) {
			// There are cases when we highlight selection using a marker (#7705, #4721).
			const markerViewElements = Array.from( this.editor.editing.mapper.markerNameToElements( VISUAL_SELECTION_MARKER_NAME ) );
			const newRange = view.createRange(
				view.createPositionBefore( markerViewElements[ 0 ] ),
				view.createPositionAfter( markerViewElements[ markerViewElements.length - 1 ] )
			);

			target = view.domConverter.viewRangeToDom( newRange );
		} else {
			const targetAnchor = this._getSelectedAnchorElement();
			const range = viewDocument.selection.getFirstRange();

			target = targetAnchor ?
				// When selection is inside anchor element, then attach panel to this element.
				view.domConverter.mapViewToDom( targetAnchor ) :
				// Otherwise attach panel to the selection.
				view.domConverter.viewRangeToDom( range );
		}

		return { target };
	}

	/**
	 * Returns the anchor {@link module:engine/view/attributeelement~AttributeElement} under
	 * the {@link module:engine/view/document~Document editing view's} selection or `null`
	 * if there is none.
	 *
	 * **Note**: For a non–collapsed selection, the anchor element is only returned when **fully**
	 * selected and the **only** element within the selection boundaries.
	 *
	 * @private
	 * @returns {module:engine/view/attributeelement~AttributeElement|null}
	 */
	_getSelectedAnchorElement() {
		const view = this.editor.editing.view;
		const selection = view.document.selection;

		if ( selection.isCollapsed ) {
			return findAnchorElementAncestor( selection.getFirstPosition() );
		} else {
			// The range for fully selected anchor is usually anchored in adjacent text nodes.
			// Trim it to get closer to the actual anchor element.
			const range = selection.getFirstRange().getTrimmed();
			const startAnchor = findAnchorElementAncestor( range.start );
			const endAnchor = findAnchorElementAncestor( range.end );

			if ( !startAnchor || startAnchor != endAnchor ) {
				return null;
			}

			// Check if the anchor element is fully selected.
			if ( view.createRangeIn( startAnchor ).getTrimmed().isEqual( range ) ) {
				return startAnchor;
			} else {
				return null;
			}
		}
	}

	/**
	 * Displays a fake visual selection when the contextual balloon is displayed.
	 *
	 * This adds a 'anchor-ui' marker into the document that is rendered as a highlight on selected text fragment.
	 *
	 * @private
	 */
	_showFakeVisualSelection() {
		const model = this.editor.model;

		model.change( writer => {
			const range = model.document.selection.getFirstRange();

			if ( model.markers.has( VISUAL_SELECTION_MARKER_NAME ) ) {
				writer.updateMarker( VISUAL_SELECTION_MARKER_NAME, { range } );
			} else {
				if ( range.start.isAtEnd ) {
					const focus = model.document.selection.focus;
					const nextValidRange = getNextValidRange( range, focus, writer );

					writer.addMarker( VISUAL_SELECTION_MARKER_NAME, {
						usingOperation: false,
						affectsData: false,
						range: nextValidRange
					} );
				} else {
					writer.addMarker( VISUAL_SELECTION_MARKER_NAME, {
						usingOperation: false,
						affectsData: false,
						range
					} );
				}
			}
		} );
	}

	/**
	 * Hides the fake visual selection created in {@link #_showFakeVisualSelection}.
	 *
	 * @private
	 */
	_hideFakeVisualSelection() {
		const model = this.editor.model;

		if ( model.markers.has( VISUAL_SELECTION_MARKER_NAME ) ) {
			model.change( writer => {
				writer.removeMarker( VISUAL_SELECTION_MARKER_NAME );
			} );
		}
	}
}

// Returns a anchor element if there's one among the ancestors of the provided `Position`.
//
// @private
// @param {module:engine/view/position~Position} View position to analyze.
// @returns {module:engine/view/attributeelement~AttributeElement|null} Anchor element at the position or null.
function findAnchorElementAncestor( position ) {
	return position.getAncestors().find( ancestor => isAnchorElement( ancestor ) );
}

// Returns next valid range for the fake visual selection marker.
//
// @private
// @param {module:engine/model/range~Range} range Current range.
// @param {module:engine/model/position~Position} focus Selection focus.
// @param {module:engine/model/writer~Writer} writer Writer.
// @returns {module:engine/model/range~Range} New valid range for the fake visual selection marker.
function getNextValidRange( range, focus, writer ) {
	const nextStartPath = [ range.start.path[ 0 ] + 1, 0 ];
	const nextStartPosition = writer.createPositionFromPath( range.start.root, nextStartPath, 'toNext' );
	const nextRange = writer.createRange( nextStartPosition, range.end );

	// Block creating a potential next valid range over the current range end.
	if ( nextRange.start.path[ 0 ] > range.end.path[ 0 ] ) {
		return writer.createRange( focus );
	}

	if ( nextStartPosition.isAtStart && nextStartPosition.isAtEnd ) {
		return getNextValidRange( nextRange, focus, writer );
	}

	return nextRange;
}
