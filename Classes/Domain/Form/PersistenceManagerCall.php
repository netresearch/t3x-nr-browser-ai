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

namespace Netresearch\NrBrowserAi\Domain\Form;

use ReflectionMethod;
use TYPO3\CMS\Form\Mvc\Persistence\FormPersistenceManagerInterface;

/**
 * Calls a method of EXT:form's persistence manager whose signature differs
 * between the supported majors.
 *
 * `load()` and `listForms()` take different arguments in 12.4, 13.4 and 14.3,
 * and the caller assembles them per major. A direct call would be checked by
 * static analysis against whichever major is installed and rejected for the
 * other two, so the invocation goes through reflection, which analysis does not
 * follow into.
 */
final class PersistenceManagerCall
{
    /**
     * @param list<mixed> $arguments
     */
    public static function invoke(FormPersistenceManagerInterface $manager, string $method, array $arguments): mixed
    {
        return (new ReflectionMethod($manager, $method))->invokeArgs($manager, $arguments);
    }
}
