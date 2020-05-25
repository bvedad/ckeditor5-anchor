/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchorimageediting
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import ImageEditing from '@ckeditor/ckeditor5-image/src/image/imageediting';
import Matcher from '@ckeditor/ckeditor5-engine/src/view/matcher';
import toMap from '@ckeditor/ckeditor5-utils/src/tomap';
import AnchorEditing from './anchorediting';

import anchorIcon from '../theme/icons/anchor.svg';

/**
 * The anchor image engine feature.
 *
 * It accepts the `anchorId="url"` attribute in the model for the {@link module:image/image~Image `<image>`} element
 * which allows anchoring images.
 *
 * @extends module:core/plugin~Plugin
 */
export default class AnchorImageEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ ImageEditing, AnchorEditing ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'AnchorImageEditing';
	}

	init() {
		const editor = this.editor;

		editor.model.schema.extend( 'image', { allowAttributes: [ 'anchorId' ] } );

		editor.conversion.for( 'upcast' ).add( upcastAnchor() );
		editor.conversion.for( 'editingDowncast' ).add( downcastImageAnchor( { attachIconIndicator: true } ) );
		editor.conversion.for( 'dataDowncast' ).add( downcastImageAnchor( { attachIconIndicator: false } ) );

		// Definitions for decorators are provided by the `anchor` command and the `AnchorEditing` plugin.
		this._enableAutomaticDecorators();
		this._enableManualDecorators();
	}

	/**
	 * Processes {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition automatic decorators} definitions and
	 * attaches proper converters that will work when anchoring an image.`
	 *
	 * @private
	 */
	_enableAutomaticDecorators() {
		const editor = this.editor;
		const command = editor.commands.get( 'anchor' );
		const automaticDecorators = command.automaticDecorators;

		if ( automaticDecorators.length ) {
			editor.conversion.for( 'downcast' ).add( automaticDecorators.getDispatcherForAnchoredImage() );
		}
	}

	/**
	 * Processes transformed {@link module:anchor/utils~ManualDecorator} instances and attaches proper converters
	 * that will work when anchoring an image.
	 *
	 * @private
	 */
	_enableManualDecorators() {
		const editor = this.editor;
		const command = editor.commands.get( 'anchor' );
		const manualDecorators = command.manualDecorators;

		for ( const decorator of command.manualDecorators ) {
			editor.model.schema.extend( 'image', { allowAttributes: decorator.id } );
			editor.conversion.for( 'downcast' ).add( downcastImageAnchorManualDecorator( manualDecorators, decorator ) );
			editor.conversion.for( 'upcast' ).add( upcastImageAnchorManualDecorator( manualDecorators, decorator ) );
		}
	}
}

// Returns a converter that consumes the 'id' attribute if a anchor contains an image.
//
// @private
// @returns {Function}
function upcastAnchor() {
	return dispatcher => {
		dispatcher.on( 'element:a', ( evt, data, conversionApi ) => {
			const viewAnchor = data.viewItem;
			const imageInAnchor = getFirstImage( viewAnchor );

			if ( !imageInAnchor ) {
				return;
			}

			// There's an image inside an <a> element - we consume it so it won't be picked up by the Anchor plugin.
			const consumableAttributes = { attributes: [ 'id' ] };

			// Consume the `id` attribute so the default one will not convert it to $text attribute.
			if ( !conversionApi.consumable.consume( viewAnchor, consumableAttributes ) ) {
				// Might be consumed by something else - i.e. other converter with priority=highest - a standard check.
				return;
			}

			const anchorId = viewAnchor.getAttribute( 'id' );

			// Missing the 'id' attribute.
			if ( !anchorId ) {
				return;
			}

			// A full definition of the image feature.
			// figure > a > img: parent of the view anchor element is an image element (figure).
			let modelElement = data.modelCursor.parent;

			if ( !modelElement.is( 'element', 'image' ) ) {
				// a > img: parent of the view anchor is not the image (figure) element. We need to convert it manually.
				const conversionResult = conversionApi.convertItem( imageInAnchor, data.modelCursor );

				// Set image range as conversion result.
				data.modelRange = conversionResult.modelRange;

				// Continue conversion where image conversion ends.
				data.modelCursor = conversionResult.modelCursor;

				modelElement = data.modelCursor.nodeBefore;
			}

			if ( modelElement && modelElement.is( 'element', 'image' ) ) {
				// Set the anchorId attribute from anchor element on model image element.
				conversionApi.writer.setAttribute( 'anchorId', anchorId, modelElement );
			}
		}, { priority: 'high' } );
		// Using the same priority that `upcastImageAnchorManualDecorator()` converter guarantees
		// that manual decorators will decorate the proper element.
	};
}

// Return a converter that adds the `<a>` element to data.
//
// @private
// @params {Object} options
// @params {Boolean} options.attachIconIndicator=false If set to `true`, an icon that informs about the anchored image will be added.
// @returns {Function}
function downcastImageAnchor( options ) {
	return dispatcher => {
		dispatcher.on( 'attribute:anchorId:image', ( evt, data, conversionApi ) => {
			// The image will be already converted - so it will be present in the view.
			const viewFigure = conversionApi.mapper.toViewElement( data.item );
			const writer = conversionApi.writer;

			// But we need to check whether the anchor element exists.
			const anchorInImage = Array.from( viewFigure.getChildren() ).find( child => child.name === 'a' );

			let anchorIconIndicator;

			if ( options.attachIconIndicator ) {
				// Create an icon indicator for a anchored image.
				anchorIconIndicator = writer.createUIElement( 'span', { class: 'ck ck-anchor-image_icon' }, function( domDocument ) {
					const domElement = this.toDomElement( domDocument );
					domElement.innerHTML = anchorIcon;

					return domElement;
				} );
			}

			// If so, update the attribute if it's defined or remove the entire anchor if the attribute is empty.
			if ( anchorInImage ) {
				if ( data.attributeNewValue ) {
					writer.setAttribute( 'id', data.attributeNewValue, anchorInImage );
				} else {
					const viewImage = Array.from( anchorInImage.getChildren() ).find( child => child.name === 'img' );

					writer.move( writer.createRangeOn( viewImage ), writer.createPositionAt( viewFigure, 0 ) );
					writer.remove( anchorInImage );
				}
			} else {
				// But if it does not exist. Let's wrap already converted image by newly created anchor element.
				// 1. Create an empty anchor element.
				const anchorElement = writer.createContainerElement( 'a', { id: data.attributeNewValue } );

				// 2. Insert anchor inside the associated image.
				writer.insert( writer.createPositionAt( viewFigure, 0 ), anchorElement );

				// 3. Move the image to the anchor.
				writer.move( writer.createRangeOn( viewFigure.getChild( 1 ) ), writer.createPositionAt( anchorElement, 0 ) );

				// 4. Inset the anchored image icon indicator while downcast to editing.
				if ( anchorIconIndicator ) {
					writer.insert( writer.createPositionAt( anchorElement, 'end' ), anchorIconIndicator );
				}
			}
		} );
	};
}

// Returns a converter that decorates the `<a>` element when the image is the anchor label.
//
// @private
// @returns {Function}
function downcastImageAnchorManualDecorator( manualDecorators, decorator ) {
	return dispatcher => {
		dispatcher.on( `attribute:${ decorator.id }:image`, ( evt, data, conversionApi ) => {
			const attributes = manualDecorators.get( decorator.id ).attributes;

			const viewFigure = conversionApi.mapper.toViewElement( data.item );
			const anchorInImage = Array.from( viewFigure.getChildren() ).find( child => child.name === 'a' );

			for ( const [ key, val ] of toMap( attributes ) ) {
				conversionApi.writer.setAttribute( key, val, anchorInImage );
			}
		} );
	};
}

// Returns a converter that checks whether manual decorators should be applied to the anchor.
//
// @private
// @returns {Function}
function upcastImageAnchorManualDecorator( manualDecorators, decorator ) {
	return dispatcher => {
		dispatcher.on( 'element:a', ( evt, data, conversionApi ) => {
			const viewAnchor = data.viewItem;
			const imageInAnchor = getFirstImage( viewAnchor );

			// We need to check whether an image is inside a anchor because the converter handles
			// only manual decorators for anchored images. See #7975.
			if ( !imageInAnchor ) {
				return;
			}

			const consumableAttributes = {
				attributes: manualDecorators.get( decorator.id ).attributes
			};

			const matcher = new Matcher( consumableAttributes );
			const result = matcher.match( viewAnchor );

			// The anchor element does not have required attributes or/and proper values.
			if ( !result ) {
				return;
			}

			// Check whether we can consume those attributes.
			if ( !conversionApi.consumable.consume( viewAnchor, result.match ) ) {
				return;
			}

			// At this stage we can assume that we have the `<image>` element.
			// `nodeBefore` comes after conversion: `<a><img></a>`.
			// `parent` comes with full image definition: `<figure><a><img></a></figure>.
			// See the body of the `upcastAnchor()` function.
			const modelElement = data.modelCursor.nodeBefore || data.modelCursor.parent;

			conversionApi.writer.setAttribute( decorator.id, true, modelElement );
		}, { priority: 'high' } );
		// Using the same priority that `upcastAnchor()` converter guarantees that the anchored image was properly converted.
	};
}

// Returns the first image in a given view element.
//
// @private
// @param {module:engine/view/element~Element}
// @returns {module:engine/view/element~Element|undefined}
function getFirstImage( viewElement ) {
	return Array.from( viewElement.getChildren() ).find( child => child.name === 'img' );
}
