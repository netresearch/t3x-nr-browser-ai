import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir: '.',
    fullyParallel: false,
    reporter: 'line',
    use: {
        browserName: 'chromium',
        headless: true,
    },
});
