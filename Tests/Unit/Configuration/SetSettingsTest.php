<?php

/*
 * This file is part of the package netresearch/nr-browser-ai.
 *
 * For the full copyright and license information, please read the
 * LICENSE file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Netresearch\NrBrowserAi\Tests\Unit\Configuration;

use function dirname;
use function file_get_contents;
use function is_array;
use function is_file;
use function is_scalar;

use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

use function sprintf;

use Symfony\Component\Yaml\Yaml;
use TYPO3\CMS\Core\EventDispatcher\NoopEventDispatcher;
use TYPO3\CMS\Core\TypoScript\AST\AstBuilder;
use TYPO3\CMS\Core\TypoScript\AST\Node\NodeInterface;
use TYPO3\CMS\Core\TypoScript\AST\Node\RootNode;
use TYPO3\CMS\Core\TypoScript\Tokenizer\LosslessTokenizer;

/**
 * The plugin's defaults are stated in two files, because the two configuration
 * mechanisms this extension supports read different ones:
 *
 * - TYPO3 12.4 and 13.4 sites include Configuration/TypoScript via
 *   ExtensionManagementUtility::addStaticFile(), which reads constants.typoscript.
 * - TYPO3 13.4 and 14.3 sites that have moved to site sets include the
 *   netresearch/browser-ai set, which reads settings.definitions.yaml.
 *
 * Both feed the same {$plugin.tx_nrbrowserai_assistant.settings.*} constants into
 * the one shared setup.typoscript, so a default corrected in only one of them
 * would silently take effect for only half the installations. This test is what
 * makes that a build failure instead.
 */
final class SetSettingsTest extends TestCase
{
    private const SET_PATH = 'Configuration/Sets/NrBrowserAi/settings.definitions.yaml';

    private const CONSTANTS_PATH = 'Configuration/TypoScript/constants.typoscript';

    #[Test]
    public function setSettingDefaultsMatchTheStaticIncludeConstants(): void
    {
        self::assertSame(
            $this->readTypoScriptConstants(),
            $this->readSetSettingDefaults(),
        );
    }

    /**
     * @return array<string, string>
     */
    private function readTypoScriptConstants(): array
    {
        $ast = (new AstBuilder(new NoopEventDispatcher()))->build(
            (new LosslessTokenizer())->tokenize($this->read(self::CONSTANTS_PATH)),
            new RootNode(),
        );

        $constants = [];
        $this->collectValues($ast, '', $constants);

        return $constants;
    }

    /**
     * @param array<string, string> $collected
     */
    private function collectValues(NodeInterface $node, string $path, array &$collected): void
    {
        foreach ($node->getNextChild() as $child) {
            $childPath = $path === '' ? $child->getName() : $path . '.' . $child->getName();

            if (!$child->isValueNull()) {
                $collected[$childPath] = (string) $child->getValue();
            }

            $this->collectValues($child, $childPath, $collected);
        }
    }

    /**
     * @return array<string, string>
     */
    private function readSetSettingDefaults(): array
    {
        $parsed = Yaml::parse($this->read(self::SET_PATH));
        if (!is_array($parsed) || !is_array($parsed['settings'] ?? null)) {
            self::fail(sprintf('%s declares no settings', self::SET_PATH));
        }

        $defaults = [];
        foreach ($parsed['settings'] as $key => $definition) {
            if (!is_array($definition) || !is_scalar($definition['default'] ?? null)) {
                self::fail(sprintf('Setting "%s" declares no scalar default', (string) $key));
            }

            $defaults[(string) $key] = (string) $definition['default'];
        }

        return $defaults;
    }

    private function read(string $relativePath): string
    {
        $absolutePath = dirname(__DIR__, 3) . '/' . $relativePath;
        if (!is_file($absolutePath)) {
            self::fail(sprintf('%s is missing', $relativePath));
        }

        $contents = file_get_contents($absolutePath);
        if ($contents === false) {
            self::fail(sprintf('%s is unreadable', $relativePath));
        }

        return $contents;
    }
}
