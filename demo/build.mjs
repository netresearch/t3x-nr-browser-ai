/**
 * Assembles the GitHub Pages artifact for the demo page.
 *
 * The demo runs the real distributable bundle. Everything it loads is copied
 * here and served same-origin, so the published page makes no third-party
 * request — including for fonts.
 *
 * Run `npm run build && npm run build:css` first; this script copies the
 * committed output rather than rebuilding it.
 */

import {cp, mkdir, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public');

/** @type {ReadonlyArray<readonly [string, string]>} */
const FILES = [
    ['demo/index.html', 'index.html'],
    ['demo/demo.css', 'assets/demo.css'],
    ['Resources/Public/JavaScript/Assistant.js', 'assets/Assistant.js'],
    ['Resources/Public/Css/Assistant.css', 'assets/Assistant.css'],
    ['Resources/Public/Icons/Extension.svg', 'assets/icon.svg'],
    ['node_modules/@fontsource/raleway/files/raleway-latin-600-normal.woff2', 'fonts/raleway-latin-600-normal.woff2'],
    ['node_modules/@fontsource/raleway/files/raleway-latin-700-normal.woff2', 'fonts/raleway-latin-700-normal.woff2'],
    ['node_modules/@fontsource/open-sans/files/open-sans-latin-400-normal.woff2', 'fonts/open-sans-latin-400-normal.woff2'],
    ['node_modules/@fontsource/open-sans/files/open-sans-latin-600-normal.woff2', 'fonts/open-sans-latin-600-normal.woff2'],
];

await rm(output, {recursive: true, force: true});

for (const [source, target] of FILES) {
    const destination = resolve(output, target);
    await mkdir(dirname(destination), {recursive: true});
    await cp(resolve(root, source), destination);
}

process.stdout.write(`Assembled ${FILES.length} files into ${output}\n`);
