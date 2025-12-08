import module from 'node:module';

module.register('./loader.ts', import.meta.url);
