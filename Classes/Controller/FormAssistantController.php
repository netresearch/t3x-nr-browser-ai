<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Controller;

use function in_array;
use function is_array;
use function is_bool;
use function is_float;
use function is_int;
use function is_numeric;
use function is_scalar;
use function is_string;
use function max;

use Netresearch\NrBrowserAi\Domain\Form\FormDefinitionLoader;
use Netresearch\NrBrowserAi\Domain\Form\FormSchemaFactory;
use Psr\Http\Message\ResponseInterface;

use function sprintf;
use function trim;

use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

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
    private const SUPPORTED_ACTIONS = ['openMeteo'];

    private static int $renderSequence = 0;

    public function __construct(
        private readonly FormDefinitionLoader $formDefinitionLoader,
        private readonly FormSchemaFactory $formSchemaFactory,
    ) {}

    public function showAction(): ResponseInterface
    {
        $requested      = $this->stringSetting('formIdentifier');
        $definition     = $requested === '' ? [] : $this->formDefinitionLoader->load($requested);
        $formIdentifier = $definition === [] ? self::DEFAULT_FORM_IDENTIFIER : $requested;
        if ($definition === []) {
            $definition = $this->formDefinitionLoader->load(self::DEFAULT_FORM_IDENTIFIER);
        }

        $schema        = $this->formSchemaFactory->create($definition);
        $pluginOptions = $this->pluginOptions($definition);
        $action        = is_string($pluginOptions['action'] ?? null) ? $pluginOptions['action'] : '';

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
            'formSchema'              => $schema->isEmpty() ? '' : $schema->toJson(),
            'toolName'                => $schema->isEmpty() ? '' : 'nr_browser_ai_' . $formIdentifier,
            'toolDescription'         => $this->text($pluginOptions['toolDescription'] ?? null),
            'action'                  => in_array($action, self::SUPPORTED_ACTIONS, true) ? $action : '',
            'title'                   => $this->stringSetting('title'),
            'introduction'            => $this->stringSetting('introduction'),
            'supplementalInstruction' => $this->stringSetting('supplementalInstruction'),
            'systemPrompt'            => $this->stringSetting('systemPrompt'),
            'showConfiguration'       => $this->booleanSetting('showConfiguration'),
        ]);

        return $this->htmlResponse();
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

    private function text(mixed $value): string
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return '';
        }

        return trim((string) $value);
    }
}
