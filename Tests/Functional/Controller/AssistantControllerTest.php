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
use function file_get_contents;
use function is_callable;

use Netresearch\NrBrowserAi\Controller\AssistantController;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use ReflectionMethod;
use ReflectionProperty;

use function str_repeat;

use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Core\View\ViewFactoryData;
use TYPO3\CMS\Core\View\ViewFactoryInterface;
use TYPO3\TestingFramework\Core\Functional\Framework\Frontend\InternalRequest;
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

    protected array $pathsToLinkInTestInstance = [
        'typo3conf/ext/nr_browser_ai/Tests/Functional/Fixtures/Sites' => 'typo3conf/sites',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        $this->importCSVDataSet(__DIR__ . '/../Fixtures/Frontend/Content.csv');
        $this->setUpFrontendRootPage(
            1,
            [
                'constants' => [
                    'EXT:nr_browser_ai/Configuration/TypoScript/constants.typoscript',
                ],
                'setup' => [
                    'EXT:nr_browser_ai/Configuration/TypoScript/setup.typoscript',
                    'EXT:nr_browser_ai/Tests/Functional/Fixtures/Frontend/setup.typoscript',
                ],
            ],
        );
    }

    #[Test]
    public function pluginIsConfiguredAsContentElement(): void
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
        self::assertSame(
            'FILE:EXT:nr_browser_ai/Configuration/FlexForms/Assistant.xml',
            $this->flexFormDataStructureReference($contentElementTca),
        );
    }

    #[Test]
    public function frontendRequestDispatchesPluginAndRendersEscapedProgressiveRootContract(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/'))->withPageId(1),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertStringContainsString('data-nr-browser-ai-root', $body);
        self::assertStringContainsString('data-context-selector="main"', $body);
        self::assertStringContainsString('data-context-usage-limit="0.8"', $body);
        self::assertStringContainsString(
            'data-system-prompt="&quot;Configured&quot; &amp; trusted"',
            $body,
        );
        self::assertStringContainsString(
            'data-supplemental-instruction="&lt;strong&gt;untrusted &amp; &quot;quoted&quot;&lt;/strong&gt;"',
            $body,
        );
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

    #[Test]
    public function configuredFlexFormDataStructureResolvesToSupportedSheetStructure(): void
    {
        $tca = $GLOBALS['TCA'] ?? null;
        self::assertIsArray($tca);
        $contentElementTca = $tca['tt_content'] ?? null;
        self::assertIsArray($contentElementTca);

        $reference = $this->flexFormDataStructureReference($contentElementTca);
        self::assertStringStartsWith('FILE:', $reference);
        $file = GeneralUtility::getFileAbsFileName(substr($reference, 5));
        self::assertFileExists($file);
        $xml = file_get_contents($file);
        self::assertIsString($xml);
        $dataStructure = GeneralUtility::xml2array($xml);

        self::assertIsArray($dataStructure);
        $sheets = $dataStructure['sheets'] ?? null;
        self::assertIsArray($sheets);
        $defaultSheet = $sheets['sDEF'] ?? null;
        self::assertIsArray($defaultSheet);
        $root = $defaultSheet['ROOT'] ?? null;
        self::assertIsArray($root);
        self::assertSame('Assistant', $root['sheetTitle'] ?? null);
        self::assertArrayNotHasKey('TCEforms', $root);
        self::assertArrayHasKey('settings.contextSelector', $root['el']);
    }

    /**
     * @param array<string, mixed> $contentElementTca
     */
    private function flexFormDataStructureReference(array $contentElementTca): string
    {
        if ((new Typo3Version())->getMajorVersion() >= 14) {
            $reference = $contentElementTca['types']['nrbrowserai_assistant']
                ['columnsOverrides']['pi_flexform']['config']['ds'] ?? null;
        } else {
            $reference = $contentElementTca['columns']['pi_flexform']['config']['ds']
                ['*,nrbrowserai_assistant'] ?? null;
        }

        self::assertIsString($reference);

        return $reference;
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
