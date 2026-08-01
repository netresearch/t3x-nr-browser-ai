import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: '.',
    fullyParallel: false,
    reporter: 'line',
    use: {
        browserName: 'chromium',
        headless: true,
        baseURL: 'http://127.0.0.1:4173/',
    },
    // The demo suite exercises the published artifact over HTTP, because the page
    // loads an ES module and relative assets that file:// cannot resolve.
    webServer: {
        command: 'npm run build:demo && node demo/serve.mjs',
        url: 'http://127.0.0.1:4173/',
        reuseExistingServer: false,
        timeout: 120_000,
        cwd: '../..',
    },
});
