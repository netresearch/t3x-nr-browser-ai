<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 * SPDX-FileCopyrightText: Netresearch DTT GmbH
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Controller;

use Netresearch\NrBrowserAi\Domain\Form\DataSourceEndpoint;
use Netresearch\NrBrowserAi\Domain\Form\FormDefinitionLoader;
use Netresearch\NrBrowserAi\Domain\Form\FormSchemaFactory;
use Netresearch\NrBrowserAi\Domain\Form\StorageFormLoader;
use Psr\Http\Message\ResponseInterface;
use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

use function in_array;
use function is_array;
use function is_bool;
use function is_float;
use function is_int;
use function is_numeric;
use function is_scalar;
use function is_string;
use function max;
use function preg_replace;
use function sprintf;
use function substr;
use function trim;

/**
 * Renders a parameter-rich form together with the tool that fills and runs it.
 *
 * The chain this plugin demonstrates is intent, structured output, tool call,
 * real action. Everything the browser needs for it is put on the plugin root as
 * data attributes, the same transport the page assistant uses: the schema the
 * model's output is constrained to, the name and description the tool is
 * registered under, and which action carries the call out.
 */
final class FormAssistantController extends ActionController
{
    private const DEFAULT_FORM_IDENTIFIER = 'weatherQuery';

    /**
     * Actions a client bundle knows how to carry out. An unknown value leaves
     * the plugin as a plain form rather than registering a tool that cannot act.
     */
    private const SUPPORTED_ACTIONS = ['openMeteo', 'jsonEndpoint'];

    /**
     * Allowed heading levels for the plugin's own title, first entry being the
     * default. Mirrors the items in Configuration/FlexForms/FormAssistant.xml.
     */
    private const HEADING_LEVELS = ['h2', 'h3', 'h4'];

    private const TOOL_NAME_LIMIT = 64;

    private static int $renderSequence = 0;

    public function __construct(
        private readonly FormDefinitionLoader $formDefinitionLoader,
        private readonly StorageFormLoader $storageFormLoader,
        private readonly FormSchemaFactory $formSchemaFactory,
    ) {}

    public function showAction(): ResponseInterface
    {
        $definition = $this->definition();

        $schema        = $this->formSchemaFactory->create($definition);
        $pluginOptions = $this->pluginOptions($definition);
        $action        = $this->stringSetting('dataSource');
        if ($action === '') {
            $action = is_string($pluginOptions['action'] ?? null) ? $pluginOptions['action'] : '';
        }

        $formIdentifier = is_string($definition['identifier'] ?? null) ? $definition['identifier'] : '';
        $action         = in_array($action, self::SUPPORTED_ACTIONS, true) ? $action : '';
        // The built-in data source reads the element named "place"; without one
        // every call would fail, so the form stays a plain form instead.
        if ($action === 'openMeteo' && !in_array('place', $schema->propertyNames(), true)) {
            $action = '';
        }

        $endpoint = '';
        if ($action === 'jsonEndpoint') {
            // A data source that cannot be validated leaves a plain form: no
            // tool is registered for a destination nobody approved.
            $configured = $this->stringSetting('dataSourceEndpoint');
            $endpoint   = DataSourceEndpoint::validate(
                $configured !== '' ? $configured : ($pluginOptions['endpoint'] ?? null),
                $this->stringSetting('allowedDataSourceHosts'),
            );
            $action = $endpoint === '' ? '' : $action;
        }

        $currentContentObject = $this->request->getAttribute('currentContentObject');
        $currentContentUid    = $currentContentObject instanceof ContentObjectRenderer
            ? $this->contentUid($currentContentObject->data['uid'] ?? null)
            : 0;

        $this->view->assignMultiple([
            'instanceId' => sprintf(
                'nr-browser-ai-form-%d-%d',
                $currentContentUid,
                ++self::$renderSequence,
            ),
            'formIdentifier'          => $formIdentifier,
            'formDefinition'          => $definition,
            'formSchema'              => $schema->isEmpty() ? '' : $schema->toJson(),
            'toolName'                => $schema->isEmpty() ? '' : $this->toolName($formIdentifier),
            'toolDescription'         => $this->toolDescription($definition, $pluginOptions),
            'action'                  => $action,
            'dataSourceEndpoint'      => $endpoint,
            'title'                   => $this->stringSetting('title'),
            'headingLevel'            => $this->headingLevelSetting(),
            'introduction'            => $this->stringSetting('introduction'),
            'supplementalInstruction' => $this->stringSetting('supplementalInstruction'),
            'systemPrompt'            => $this->stringSetting('systemPrompt'),
            'showConfiguration'       => $this->booleanSetting('showConfiguration'),
        ]);

        return $this->htmlResponse();
    }

    /**
     * The form to render, as the one array both the controls and the schema are
     * built from. An editor-chosen form from the EXT:form storage wins over the
     * bundled one; when it cannot be loaded the plugin renders nothing rather
     * than a different form than the one chosen.
     *
     * @return array<string, mixed>
     */
    private function definition(): array
    {
        $persistenceIdentifier = $this->stringSetting('persistenceIdentifier');
        if ($persistenceIdentifier !== '') {
            return $this->storageFormLoader->load($persistenceIdentifier, $this->request);
        }

        $requested  = $this->stringSetting('formIdentifier');
        $definition = $requested === '' ? [] : $this->formDefinitionLoader->load($requested);
        if ($definition === []) {
            $definition = $this->formDefinitionLoader->load(self::DEFAULT_FORM_IDENTIFIER);
        }

        return $definition;
    }

    /**
     * Identifiers an editor gets from the form editor contain hyphens ("text-1"),
     * and a tool name is a token an agent has to be able to address.
     */
    private function toolName(string $formIdentifier): string
    {
        $safe = preg_replace('/\W/', '_', $formIdentifier) ?? '';

        return substr('nr_browser_ai_' . $safe, 0, self::TOOL_NAME_LIMIT);
    }

    /**
     * The plugin setting wins, then the definition, then a sentence derived from
     * the form's own label so a form nobody described still has a usable tool.
     *
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $pluginOptions
     */
    private function toolDescription(array $definition, array $pluginOptions): string
    {
        $configured = $this->stringSetting('toolDescription');
        if ($configured === '') {
            $configured = $this->text($pluginOptions['toolDescription'] ?? null);
        }

        if ($configured !== '' || $definition === []) {
            return $configured;
        }

        $label = $this->text($definition['label'] ?? null);

        return sprintf(
            'Fills in the form "%s" from the request and runs it. Set only the parameters the request names.',
            $label === '' ? $this->text($definition['identifier'] ?? null) : $label,
        );
    }

    /**
     * The form declares how it acts and how the tool describes itself, so that
     * the two travel with the definition instead of being configured beside it.
     *
     * @param array<string, mixed> $definition
     *
     * @return array<string, mixed>
     */
    private function pluginOptions(array $definition): array
    {
        $renderingOptions = $definition['renderingOptions'] ?? null;
        if (!is_array($renderingOptions)) {
            return [];
        }

        $options = $renderingOptions['nrBrowserAi'] ?? null;
        if (!is_array($options)) {
            return [];
        }

        $pluginOptions = [];
        foreach ($options as $key => $value) {
            if (is_string($key)) {
                $pluginOptions[$key] = $value;
            }
        }

        return $pluginOptions;
    }

    private function contentUid(mixed $value): int
    {
        return is_numeric($value) ? max((int) $value, 0) : 0;
    }

    /**
     * A FlexForm checkbox arrives as the string '0' or '1', which is truthy
     * either way, so the value is read rather than cast.
     */
    private function booleanSetting(string $name): bool
    {
        $value = $this->settings[$name] ?? null;
        if (is_bool($value)) {
            return $value;
        }

        return is_scalar($value) && in_array((string) $value, ['1', 'true', 'on'], true);
    }

    private function stringSetting(string $name): string
    {
        return $this->text($this->settings[$name] ?? null);
    }

    /**
     * The heading level reaches the template as a tag name, so it is checked
     * against the allow-list rather than passed through. A record written
     * before this setting existed, or edited around the FlexForm, would
     * otherwise put an arbitrary string where an element name belongs.
     */
    private function headingLevelSetting(): string
    {
        $value = $this->text($this->settings['headingLevel'] ?? null);

        return in_array($value, self::HEADING_LEVELS, true) ? $value : self::HEADING_LEVELS[0];
    }

    private function text(mixed $value): string
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return '';
        }

        return trim((string) $value);
    }
}
