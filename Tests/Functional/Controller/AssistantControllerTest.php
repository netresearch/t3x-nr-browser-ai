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

use DOMDocument;
use DOMElement;
use DOMXPath;

use function file_get_contents;
use function is_array;
use function is_callable;

use Netresearch\NrBrowserAi\Controller\AssistantController;
use Netresearch\NrBrowserAi\Service\FallbackContentRenderer;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use ReflectionMethod;
use ReflectionProperty;

use function str_repeat;

use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Schema\Struct\SelectItem;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Core\View\ViewFactoryData;
use TYPO3\CMS\Core\View\ViewFactoryInterface;
use TYPO3\CMS\Extbase\Mvc\RequestInterface;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;
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

        $contentTypeItems = $contentElementTca['columns']['CType']['config']['items'] ?? null;
        self::assertIsArray($contentTypeItems);
        $assistantItem = null;
        foreach ($contentTypeItems as $item) {
            if (is_array($item)) {
                $item = SelectItem::fromTcaItemArray($item);
            }
            if ($item instanceof SelectItem && $item->getValue() === 'nrbrowserai_assistant') {
                $assistantItem = $item;
                break;
            }
        }
        self::assertInstanceOf(SelectItem::class, $assistantItem);
        self::assertSame(
            'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:plugin.assistant.title',
            $assistantItem->getLabel(),
        );
        self::assertSame(
            'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:plugin.assistant.description',
            $assistantItem->getDescription(),
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
        self::assertSame(1, preg_match('/id="(nr-browser-ai-1-[1-9][0-9]*)"/', $body, $instanceMatches));
        $instanceId = $instanceMatches[1];
        self::assertStringContainsString('aria-label="Browser AI assistant"', $body);
        self::assertStringContainsString('for="' . $instanceId . '-question"', $body);
        self::assertStringContainsString('id="' . $instanceId . '-question"', $body);
        self::assertStringNotContainsString('aria-live=', $body);
        self::assertStringContainsString('aria-atomic="true"', $body);
        self::assertStringContainsString('Netresearch DTT GmbH', $body);
        self::assertStringContainsString('/typo3conf/ext/nr_browser_ai/Resources/Public/Icons/Extension.svg', $body);
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
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*'
            . '<p data-fallback-output>Rendered fallback content<\\/p>\\s*<\\/div>/',
            $body,
        );
        self::assertMatchesRegularExpression(
            '/<[^>]+data-nr-browser-ai-assistant[^>]+hidden(?:="hidden")?[^>]*>/',
            $body,
        );
        self::assertMatchesRegularExpression(
            '/<script(?=[^>]*type="module")(?=[^>]*src="[^"]*\/typo3conf\/ext\/nr_browser_ai\/Resources\/Public\/JavaScript\/Assistant\.js[^"]*")[^>]*><\/script>/',
            $body,
        );
        self::assertMatchesRegularExpression(
            '/<link(?=[^>]*rel="stylesheet")(?=[^>]*href="[^"]*\/typo3conf\/ext\/nr_browser_ai\/Resources\/Public\/Css\/Assistant\.css[^"]*")[^>]*>/',
            $body,
        );
    }

    #[Test]
    public function noneModeRendersAnEmptyFallbackThroughFrontendDispatch(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/none'))->withPageId(2),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
            $body,
        );
        self::assertStringNotContainsString('Rendered fallback content', $body);
    }

    #[Test]
    public function selfReferenceFailsClosedWithoutRenderingThePluginRecursively(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/self-reference'))->withPageId(3),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(1, substr_count($body, 'data-nr-browser-ai-root'));
        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
            $body,
        );
    }

    #[Test]
    public function nonScalarUidExpressionIsRejectedThroughFrontendDispatch(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/invalid-fallback'))->withPageId(4),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
            $body,
        );
        self::assertStringNotContainsString('Rendered fallback content', $body);
    }

    #[Test]
    public function indirectFallbackCycleIsBoundedThroughFrontendDispatch(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/indirect-cycle'))->withPageId(5),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(2, substr_count($body, 'data-nr-browser-ai-root'));
        preg_match_all('/<section[^>]+id="(nr-browser-ai-[^"]+)"[^>]+data-nr-browser-ai-root/', $body, $matches);
        self::assertCount(2, array_unique($matches[1] ?? []));
        self::assertLessThan(15_000, strlen($body));
    }

    #[Test]
    public function visibleCrossPageContentElementIsRenderedAsFallback(): void
    {
        $response = $this->executeFrontendSubRequest(
            (new InternalRequest('https://website.local/cross-page'))->withPageId(6),
        );
        $body = (string) $response->getBody();

        self::assertSame(200, $response->getStatusCode());
        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*'
            . '<p data-cross-page-fallback>Cross-page fallback<\\/p>\\s*<\\/div>/',
            $body,
        );
    }

    #[Test]
    public function hiddenAndDeletedCrossPageContentElementsRemainUnavailable(): void
    {
        foreach ([8 => 'hidden', 9 => 'deleted'] as $pageId => $marker) {
            $response = $this->executeFrontendSubRequest(
                (new InternalRequest('https://website.local/' . $marker . '-fallback'))->withPageId($pageId),
            );
            $body = (string) $response->getBody();

            self::assertSame(200, $response->getStatusCode());
            self::assertMatchesRegularExpression(
                '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
                $body,
            );
            self::assertStringNotContainsString('data-' . $marker . '-fallback', $body);
        }
    }

    #[Test]
    public function missingCurrentContentRecordFailsClosed(): void
    {
        $body = $this->renderAssistant([
            'fallbackMode'    => 'contentElement',
            'fallbackContent' => 'tt_content_2',
        ]);

        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
            $body,
        );
    }

    #[Test]
    public function missingFallbackRendererInjectionFailsClosed(): void
    {
        $body = $this->renderAssistant(
            [
                'fallbackMode'    => 'contentElement',
                'fallbackContent' => 'tt_content_2',
            ],
            false,
        );

        self::assertMatchesRegularExpression(
            '/<div[^>]+data-nr-browser-ai-fallback[^>]*>\\s*<\\/div>/',
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
    public function repeatedRenderingOfSameContentRecordUsesGloballyUniqueMatchingIds(): void
    {
        $bodies = [
            $this->renderAssistant([], true, 42),
            $this->renderAssistant([], true, 42),
        ];
        $instanceIds = [];
        $allIds      = [];

        foreach ($bodies as $body) {
            self::assertSame(1, preg_match('/<section\s+id="(nr-browser-ai-42-[1-9][0-9]*)"/', $body, $matches));
            $instanceId    = $matches[1];
            $instanceIds[] = $instanceId;
            self::assertStringContainsString('id="' . $instanceId . '-title"', $body);
            self::assertStringContainsString('id="' . $instanceId . '-status"', $body);
            self::assertStringContainsString('id="' . $instanceId . '-question"', $body);
            self::assertStringContainsString('for="' . $instanceId . '-question"', $body);
            self::assertStringContainsString('aria-describedby="' . $instanceId . '-status"', $body);
            self::assertSame(4, preg_match_all('/\sid="([^"]+)"/', $body, $idMatches));
            array_push($allIds, ...$idMatches[1]);
        }

        self::assertCount(2, array_unique($instanceIds));
        self::assertCount(8, array_unique($allIds));
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
        self::assertSame(
            'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:flexform.sheet.assistant',
            $root['sheetTitle'] ?? null,
        );
        self::assertArrayNotHasKey('TCEforms', $root);
        $fields = $root['el'] ?? null;
        self::assertIsArray($fields);
        foreach ([
            'settings.title'                   => 'flexform.field.title',
            'settings.introduction'            => 'flexform.field.introduction',
            'settings.supplementalInstruction' => 'flexform.field.supplementalInstruction',
            'settings.contextSelector'         => 'flexform.field.contextSelector',
            'settings.fallbackMode'            => 'flexform.field.fallbackMode',
            'settings.fallbackContent'         => 'flexform.field.fallbackContent',
        ] as $fieldName => $labelKey) {
            self::assertSame(
                'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:' . $labelKey,
                $fields[$fieldName]['label'] ?? null,
            );
        }
        self::assertSame(
            'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:flexform.item.fallbackMode.none',
            $fields['settings.fallbackMode']['config']['items'][0]['label'] ?? null,
        );
        self::assertSame(
            'LLL:EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf:flexform.item.fallbackMode.contentElement',
            $fields['settings.fallbackMode']['config']['items'][1]['label'] ?? null,
        );
    }

    #[Test]
    public function backendLanguageFileIsValidAndProvidesEveryRegisteredLabel(): void
    {
        $languageFile = GeneralUtility::getFileAbsFileName(
            'EXT:nr_browser_ai/Resources/Private/Language/locallang_db.xlf',
        );
        self::assertFileExists($languageFile);

        $document = new DOMDocument();
        self::assertTrue($document->load($languageFile));
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('xlf', 'urn:oasis:names:tc:xliff:document:1.2');
        $translationUnits = $xpath->query('//xlf:trans-unit');
        self::assertNotFalse($translationUnits);
        $translationKeys = [];
        foreach ($translationUnits as $translationUnit) {
            if ($translationUnit instanceof DOMElement) {
                $translationKeys[] = $translationUnit->getAttribute('id');
            }
        }

        foreach ([
            'plugin.assistant.title',
            'plugin.assistant.description',
            'flexform.sheet.assistant',
            'flexform.field.title',
            'flexform.field.introduction',
            'flexform.field.supplementalInstruction',
            'flexform.field.contextSelector',
            'flexform.field.fallbackMode',
            'flexform.field.fallbackContent',
            'flexform.item.fallbackMode.none',
            'flexform.item.fallbackMode.contentElement',
        ] as $expectedKey) {
            self::assertContains($expectedKey, $translationKeys);
        }
    }

    /**
     * @param array<string, mixed> $contentElementTca
     */
    private function flexFormDataStructureReference(array $contentElementTca): string
    {
        if ((new Typo3Version())->getMajorVersion() >= 14) {
            $reference = $contentElementTca['types']['nrbrowserai_assistant']['columnsOverrides']['pi_flexform']['config']['ds'] ?? null;
        } else {
            $reference = $contentElementTca['columns']['pi_flexform']['config']['ds']['*,nrbrowserai_assistant'] ?? null;
        }

        self::assertIsString($reference);

        return $reference;
    }

    /**
     * @param array<string, mixed> $settings
     */
    private function renderAssistant(
        array $settings,
        bool $injectFallbackContentRenderer = true,
        ?int $contentUid = null,
    ): string {
        $controller = new AssistantController();
        if ($injectFallbackContentRenderer) {
            $controller->injectFallbackContentRenderer(new FallbackContentRenderer());
        }
        $controller->injectResponseFactory(GeneralUtility::makeInstance(ResponseFactoryInterface::class));
        $controller->injectStreamFactory(GeneralUtility::makeInstance(StreamFactoryInterface::class));

        $this->setControllerProperty($controller, 'view', $this->createAssistantView());
        $this->setControllerProperty($controller, 'settings', $settings);
        if ($contentUid !== null) {
            $contentObject       = GeneralUtility::makeInstance(ContentObjectRenderer::class);
            $contentObject->data = ['uid' => $contentUid];
            $request             = $this->createMock(RequestInterface::class);
            $request->expects(self::once())
                ->method('getAttribute')
                ->with('currentContentObject')
                ->willReturn($contentObject);
            $this->setControllerProperty($controller, 'request', $request);
        }

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
