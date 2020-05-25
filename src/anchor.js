/**
 * @license Copyright (c) 2003-2020, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module anchor/anchor
 */

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import AnchorEditing from './anchorediting';
import AnchorUI from './anchorui';
import AutoAnchor from './autoanchor';

/**
 * The anchor plugin.
 *
 * This is a "glue" plugin that loads the {@link module:anchor/anchorediting~AnchorEditing anchor editing feature}
 * and {@link module:anchor/anchorui~AnchorUI anchor UI feature}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class Anchor extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ AnchorEditing, AnchorUI, AutoAnchor ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'Anchor';
	}
}

/**
 * The configuration of the {@link module:anchor/anchor~Anchor} feature.
 *
 * Read more in {@link module:anchor/anchor~AnchorConfig}.
 *
 * @member {module:anchor/anchor~AnchorConfig} module:core/editor/editorconfig~EditorConfig#anchor
 */

/**
 * The configuration of the {@link module:anchor/anchor~Anchor anchor feature}.
 *
 *		ClassicEditor
 *			.create( editorElement, {
 * 				anchor:  ... // Anchor feature configuration.
 *			} )
 *			.then( ... )
 *			.catch( ... );
 *
 * See {@link module:core/editor/editorconfig~EditorConfig all editor options}.
 * @interface AnchorConfig
 */

/**
 * When set, the editor will add the given protocol to the anchor when the user creates a anchor without one.
 * For example, when the user is creating a anchor and types `ckeditor.com` in the anchor form input, during anchor submission
 * the editor will automatically add the `http://` protocol, so the anchor will look as follows: `http://ckeditor.com`.
 *
 * The feature also provides email address auto-detection. When you submit `hello@example.com`,
 * the plugin will automatically change it to `mailto:hello@example.com`.
 *
 * 		ClassicEditor
 *			.create( editorElement, {
 * 				anchor: {
 * 					defaultProtocol: 'http://'
 * 				}
 *			} )
 *			.then( ... )
 *			.catch( ... );
 *
 * **NOTE:** If no configuration is provided, the editor will not auto-fix the anchors.
 *
 * @member {String} module:anchor/anchor~AnchorConfig#defaultProtocol
 */

/**
 * When set to `true`, the `target="blank"` and `rel="noopener noreferrer"` attributes are automatically added to all external anchors
 * in the editor. "External anchors" are all anchors in the editor content starting with `http`, `https`, or `//`.
 *
 *		ClassicEditor
 *			.create( editorElement, {
 *				anchor: {
 *					addTargetToExternalAnchors: true
 *				}
 *			} )
 *			.then( ... )
 *			.catch( ... );
 *
 * Internally, this option activates a predefined {@link module:anchor/anchor~AnchorConfig#decorators automatic anchor decorator}
 * that extends all external anchors with the `target` and `rel` attributes.
 *
 * **Note**: To control the `target` and `rel` attributes of specific anchors in the edited content, a dedicated
 * {@link module:anchor/anchor~AnchorDecoratorManualDefinition manual} decorator must be defined in the
 * {@link module:anchor/anchor~AnchorConfig#decorators `config.anchor.decorators`} array. In such scenario,
 * the `config.anchor.addTargetToExternalAnchors` option should remain `undefined` or `false` to not interfere with the manual decorator.
 *
 * It is possible to add other {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition automatic}
 * or {@link module:anchor/anchor~AnchorDecoratorManualDefinition manual} anchor decorators when this option is active.
 *
 * More information about decorators can be found in the {@link module:anchor/anchor~AnchorConfig#decorators decorators configuration}
 * reference.
 *
 * @default false
 * @member {Boolean} module:anchor/anchor~AnchorConfig#addTargetToExternalAnchors
 */

/**
 * Decorators provide an easy way to configure and manage additional anchor attributes in the editor content. There are
 * two types of anchor decorators:
 *
 * * {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition Automatic} &ndash; They match anchors against pre–defined rules and
 * manage their attributes based on the results.
 * * {@link module:anchor/anchor~AnchorDecoratorManualDefinition Manual} &ndash; They allow users to control anchor attributes individually,
 *  using the editor UI.
 *
 * Anchor decorators are defined as objects with key-value pairs, where the key is the name provided for a given decorator and the
 * value is the decorator definition.
 *
 * The name of the decorator also corresponds to the {@ganchor framework/guides/architecture/editing-engine#text-attributes text attribute}
 * in the model. For instance, the `isExternal` decorator below is represented as a `anchorIsExternal` attribute in the model.
 *
 *		ClassicEditor
 *			.create( editorElement, {
 *				anchor: {
 *					decorators: {
 *						isExternal: {
 *							mode: 'automatic',
 *							callback: url => url.startsWith( 'http://' ),
 *							attributes: {
 *								target: '_blank',
 *								rel: 'noopener noreferrer'
 *							}
 *						}
 *					}
 *				}
 *			} )
 *			.then( ... )
 *			.catch( ... );
 *
 * To learn more about the configuration syntax, check out the {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition automatic}
 * and {@link module:anchor/anchor~AnchorDecoratorManualDefinition manual} decorator option reference.
 *
 * **Warning:** Currently, anchor decorators work independently of one another and no conflict resolution mechanism exists.
 * For example, configuring the `target` attribute using both an automatic and a manual decorator at the same time could end up with
 * quirky results. The same applies if multiple manual or automatic decorators were defined for the same attribute.
 *
 * **Note**: Since the `target` attribute management for external anchors is a common use case, there is a predefined automatic decorator
 * dedicated for that purpose which can be enabled by turning a single option on. Check out the
 * {@link module:anchor/anchor~AnchorConfig#addTargetToExternalAnchors `config.anchor.addTargetToExternalAnchors`}
 * configuration description to learn more.
 *
 * See also the {@ganchor features/anchor#custom-anchor-attributes-decorators anchor feature guide} for more information.
 *
 * @member {Object.<String, module:anchor/anchor~AnchorDecoratorDefinition>} module:anchor/anchor~AnchorConfig#decorators
 */

/**
 * A anchor decorator definition. Two types implement this defition:
 *
 * * {@link module:anchor/anchor~AnchorDecoratorManualDefinition}
 * * {@link module:anchor/anchor~AnchorDecoratorAutomaticDefinition}
 *
 * Refer to their document for more information about available options or to the
 * {@ganchor features/anchor#custom-anchor-attributes-decorators anchor feature guide} for general information.
 *
 * @interface AnchorDecoratorDefinition
 */

/**
 * Anchor decorator type.
 *
 * Check out the {@ganchor features/anchor#custom-anchor-attributes-decorators anchor feature guide} for more information.
 *
 * @member {'manual'|'automatic'} module:anchor/anchor~AnchorDecoratorDefinition#mode
 */

/**
 * Describes an automatic {@link module:anchor/anchor~AnchorConfig#decorators anchor decorator}. This decorator type matches
 * all anchors in the editor content against a function that decides whether the anchor should receive a pre–defined set of attributes.
 *
 * It takes an object with key-value pairs of attributes and a callback function that must return a Boolean value based on the anchor's
 * `id` (URL). When the callback returns `true`, attributes are applied to the anchor.
 *
 * For example, to add the `target="_blank"` attribute to all anchors in the editor starting with `http://`, the
 * configuration could look like this:
 *
 *		{
 *			mode: 'automatic',
 *			callback: url => url.startsWith( 'http://' ),
 *			attributes: {
 *				target: '_blank'
 *			}
 *		}
 *
 * **Note**: Since the `target` attribute management for external anchors is a common use case, there is a predefined automatic decorator
 * dedicated for that purpose that can be enabled by turning a single option on. Check out the
 * {@link module:anchor/anchor~AnchorConfig#addTargetToExternalAnchors `config.anchor.addTargetToExternalAnchors`}
 * configuration description to learn more.
 *
 * @typedef {Object} module:anchor/anchor~AnchorDecoratorAutomaticDefinition
 * @property {'automatic'} mode Anchor decorator type. It is `'automatic'` for all automatic decorators.
 * @property {Function} callback Takes a `url` as a parameter and returns `true` if the `attributes` should be applied to the anchor.
 * @property {Object} attributes Key-value pairs used as anchor attributes added to the output during the
 * {@ganchor framework/guides/architecture/editing-engine#conversion downcasting}.
 * Attributes should follow the {@link module:engine/view/elementdefinition~ElementDefinition} syntax.
 */
