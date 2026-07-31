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
use function preg_match;

use Netresearch\NrBrowserAi\Service\FallbackContentRenderer;
use Psr\Http\Message\ResponseInterface;

use function trim;

use TYPO3\CMS\Extbase\Mvc\Controller\ActionController;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;

final class AssistantController extends ActionController
{
    private const DEFAULT_CONTEXT_SELECTOR    = 'main';
    private const DEFAULT_CONTEXT_USAGE_LIMIT = 0.8;
    private const MAX_CONTEXT_SELECTOR_LENGTH = 256;

    private ?FallbackContentRenderer $fallbackContentRenderer = null;

    public function injectFallbackContentRenderer(FallbackContentRenderer $fallbackContentRenderer): void
    {
        $this->fallbackContentRenderer = $fallbackContentRenderer;
    }

    public function showAction(): ResponseInterface
    {
        $settings = $this->normalizedSettings();
        $currentContentObject = $this->currentContentObject();
        $currentContentUid = $currentContentObject instanceof ContentObjectRenderer
            ? $this->normalizeContentUid($currentContentObject->data['uid'] ?? null)
            : 0;
        if ($this->fallbackContentRenderer instanceof FallbackContentRenderer) {
            $settings['fallbackContent'] = $this->fallbackContentRenderer->render(
                $settings['fallbackMode'],
                $this->normalizeContentUid($this->settings['fallbackContent'] ?? null),
                $currentContentUid,
                $currentContentObject,
            );
        }

        $this->view->assignMultiple($settings);

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
            'fallbackContent'         => '',
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

    private function currentContentObject(): ?ContentObjectRenderer
    {
        if (!isset($this->request)) {
            return null;
        }

        $contentObject = $this->request->getAttribute('currentContentObject');

        return $contentObject instanceof ContentObjectRenderer ? $contentObject : null;
    }

    private function normalizeContentUid(mixed $value): int
    {
        if (is_int($value)) {
            return $value > 0 ? $value : 0;
        }
        if (!is_string($value)) {
            return 0;
        }

        $value = trim($value);
        if (preg_match('/^(?:tt_content_)?([1-9][0-9]*)$/D', $value, $matches) !== 1) {
            return 0;
        }

        $uid = filter_var($matches[1], FILTER_VALIDATE_INT);

        return is_int($uid) && $uid > 0 ? $uid : 0;
    }
}
