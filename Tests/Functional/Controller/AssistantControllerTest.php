<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Functional\Controller;

use function call_user_func;
use function class_exists;
use function is_callable;

use Netresearch\NrBrowserAi\Controller\AssistantController;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use ReflectionMethod;
use ReflectionProperty;

use function str_repeat;

use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Core\View\ViewFactoryData;
use TYPO3\CMS\Core\View\ViewFactoryInterface;
use TYPO3\TestingFramework\Core\Functional\FunctionalTestCase;

final class AssistantControllerTest extends FunctionalTestCase
{
    protected array $coreExtensionsToLoad = [
        'extbase',
        'fluid',
        'frontend',
    ];

    protected array $testExtensionsToLoad = [
        'netresearch/nr-browser-ai',
    ];

    #[Test]
    public function pluginIsConfiguredAndRendersProgressiveRootContract(): void
    {
        $typo3Configuration = $GLOBALS['TYPO3_CONF_VARS'] ?? null;
        self::assertIsArray($typo3Configuration);
        $extensionConfiguration = $typo3Configuration['EXTCONF'] ?? null;
        self::assertIsArray($extensionConfiguration);
        $extbaseConfiguration = $extensionConfiguration['extbase'] ?? null;
        self::assertIsArray($extbaseConfiguration);
        $extensions = $extbaseConfiguration['extensions'] ?? null;
        self::assertIsArray($extensions);
        $nrBrowserAiConfiguration = $extensions['NrBrowserAi'] ?? null;
        self::assertIsArray($nrBrowserAiConfiguration);
        $plugins = $nrBrowserAiConfiguration['plugins'] ?? null;
        self::assertIsArray($plugins);
        $pluginConfiguration = $plugins['Assistant'] ?? null;

        self::assertIsArray($pluginConfiguration);
        $controllers = $pluginConfiguration['controllers'] ?? null;
        self::assertIsArray($controllers);
        self::assertArrayHasKey(AssistantController::class, $controllers);
        $assistantControllerConfiguration = $controllers[AssistantController::class];
        self::assertIsArray($assistantControllerConfiguration);
        self::assertSame(
            ['show'],
            $assistantControllerConfiguration['actions'],
        );
        self::assertSame(
            [],
            $assistantControllerConfiguration['nonCacheableActions'] ?? [],
        );

        $tca = $GLOBALS['TCA'] ?? null;
        self::assertIsArray($tca);
        $contentElementTca = $tca['tt_content'] ?? null;
        self::assertIsArray($contentElementTca);
        $contentElementTypes = $contentElementTca['types'] ?? null;
        self::assertIsArray($contentElementTypes);
        self::assertArrayHasKey('nrbrowserai_assistant', $contentElementTypes);
        $assistantContentElementType = $contentElementTypes['nrbrowserai_assistant'];
        self::assertIsArray($assistantContentElementType);
        $columnsOverrides = $assistantContentElementType['columnsOverrides'] ?? null;
        self::assertIsArray($columnsOverrides);
        $flexFormOverride = $columnsOverrides['pi_flexform'] ?? null;
        self::assertIsArray($flexFormOverride);
        $flexFormConfiguration = $flexFormOverride['config'] ?? null;
        self::assertIsArray($flexFormConfiguration);
        self::assertSame(
            'FILE:EXT:nr_browser_ai/Configuration/FlexForms/Assistant.xml',
            $flexFormConfiguration['ds'],
        );

        $controller = new AssistantController();
        $controller->injectResponseFactory(GeneralUtility::makeInstance(ResponseFactoryInterface::class));
        $controller->injectStreamFactory(GeneralUtility::makeInstance(StreamFactoryInterface::class));

        $this->setControllerProperty($controller, 'view', $this->createAssistantView());
        $this->setControllerProperty($controller, 'settings', [
            'contextSelector'         => '   ',
            'contextUsageLimit'       => '0.8',
            'systemPrompt'            => 'Use only the supplied source.',
            'supplementalInstruction' => '',
        ]);

        $body = (string) $controller->showAction()->getBody();

        self::assertStringContainsString('data-nr-browser-ai-root', $body);
        self::assertStringContainsString('data-context-selector="main"', $body);
        self::assertStringContainsString('data-nr-browser-ai-fallback', $body);
        self::assertMatchesRegularExpression(
            '/<[^>]+data-nr-browser-ai-assistant[^>]+hidden(?:="hidden")?[^>]*>/',
            $body,
        );
    }

    #[Test]
    public function selectorAndInstructionsAreNormalizedAndEscaped(): void
    {
        $body = $this->renderAssistant([
            'contextSelector'         => str_repeat('a', 257),
            'contextUsageLimit'       => '2',
            'systemPrompt'            => '"source" & source only',
            'supplementalInstruction' => '<strong>untrusted</strong>',
        ]);

        self::assertStringContainsString('data-context-selector="main"', $body);
        self::assertStringContainsString('data-context-usage-limit="0.8"', $body);
        self::assertStringContainsString(
            'data-system-prompt="&quot;source&quot; &amp; source only"',
            $body,
        );
        self::assertStringContainsString(
            'data-supplemental-instruction="&lt;strong&gt;untrusted&lt;/strong&gt;"',
            $body,
        );

        $escapedSelectorBody = $this->renderAssistant([
            'contextSelector' => 'main[data-label="x&y"]',
        ]);
        self::assertStringContainsString(
            'data-context-selector="main[data-label=&quot;x&amp;y&quot;]"',
            $escapedSelectorBody,
        );
    }

    /**
     * @param array<string, mixed> $settings
     */
    private function renderAssistant(array $settings): string
    {
        $controller = new AssistantController();
        $controller->injectResponseFactory(GeneralUtility::makeInstance(ResponseFactoryInterface::class));
        $controller->injectStreamFactory(GeneralUtility::makeInstance(StreamFactoryInterface::class));

        $this->setControllerProperty($controller, 'view', $this->createAssistantView());
        $this->setControllerProperty($controller, 'settings', $settings);

        return (string) $controller->showAction()->getBody();
    }

    private function createAssistantView(): object
    {
        $templateFile = GeneralUtility::getFileAbsFileName(
            'EXT:nr_browser_ai/Resources/Private/Templates/Assistant/Show.html',
        );

        if (class_exists(ViewFactoryData::class)) {
            return GeneralUtility::makeInstance(ViewFactoryInterface::class)->create(
                new ViewFactoryData(null, null, null, $templateFile),
            );
        }

        $standaloneViewClass = 'TYPO3\\CMS\\Fluid\\View\\StandaloneView';
        if (!class_exists($standaloneViewClass)) {
            self::fail('The TYPO3 Fluid standalone view is not available.');
        }
        $makeInstanceMethod = new ReflectionMethod(GeneralUtility::class, 'makeInstance');
        $view               = $makeInstanceMethod->invoke(null, $standaloneViewClass);
        self::assertIsObject($view);
        if (!is_callable([$view, 'setTemplatePathAndFilename'])) {
            self::fail('The TYPO3 Fluid standalone view cannot accept a template file.');
        }
        call_user_func([$view, 'setTemplatePathAndFilename'], $templateFile);

        return $view;
    }

    private function setControllerProperty(
        AssistantController $controller,
        string $property,
        mixed $value,
    ): void {
        $reflectionProperty = new ReflectionProperty($controller, $property);
        $reflectionProperty->setValue($controller, $value);
    }
}
