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
use function is_float;
use function is_int;
use function is_numeric;
use function is_string;
use function mb_strlen;

use Psr\Http\Message\ResponseInterface;

use function trim;

use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;

final class AssistantController extends ActionController
{
    private const DEFAULT_CONTEXT_SELECTOR    = 'main';
    private const DEFAULT_CONTEXT_USAGE_LIMIT = 0.8;
    private const MAX_CONTEXT_SELECTOR_LENGTH = 256;

    public function showAction(): ResponseInterface
    {
        $this->view->assignMultiple($this->normalizedSettings());

        return $this->htmlResponse();
    }

    /**
     * @return array{
     *     contextSelector: string,
     *     contextUsageLimit: float,
     *     systemPrompt: string,
     *     supplementalInstruction: string,
     *     fallbackMode: 'none'|'contentElement',
     *     fallbackContent: string,
     *     title: string,
     *     introduction: string
     * }
     */
    private function normalizedSettings(): array
    {
        $contextSelector = $this->stringSetting('contextSelector');
        if ($contextSelector === '' || mb_strlen($contextSelector) > self::MAX_CONTEXT_SELECTOR_LENGTH) {
            $contextSelector = self::DEFAULT_CONTEXT_SELECTOR;
        }

        $rawContextUsageLimit = $this->settings['contextUsageLimit'] ?? null;
        $contextUsageLimit    = is_numeric($rawContextUsageLimit)
            ? (float) $rawContextUsageLimit
            : self::DEFAULT_CONTEXT_USAGE_LIMIT;
        if ($contextUsageLimit <= 0.0 || $contextUsageLimit > 1.0) {
            $contextUsageLimit = self::DEFAULT_CONTEXT_USAGE_LIMIT;
        }

        $fallbackMode = $this->stringSetting('fallbackMode', 'none');
        if (!in_array($fallbackMode, ['none', 'contentElement'], true)) {
            $fallbackMode = 'none';
        }

        return [
            'contextSelector'         => $contextSelector,
            'contextUsageLimit'       => $contextUsageLimit,
            'systemPrompt'            => $this->stringSetting('systemPrompt'),
            'supplementalInstruction' => $this->stringSetting('supplementalInstruction'),
            'fallbackMode'            => $fallbackMode,
            'fallbackContent'         => $this->stringSetting('fallbackContent'),
            'title'                   => $this->stringSetting('title'),
            'introduction'            => $this->stringSetting('introduction'),
        ];
    }

    private function stringSetting(string $name, string $default = ''): string
    {
        $value = $this->settings[$name] ?? null;
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return $default;
        }

        return trim((string) $value);
    }
}
