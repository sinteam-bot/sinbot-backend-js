import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.js'],
            exclude: [
                'src/index.js',
                'src/deploy-commands.js',
                'src/dumpDiscord.js',
                'src/db/schema/**',
            ],
        },
    },
});
