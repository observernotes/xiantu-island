import { defineConfig } from 'vite';
import { findRoot } from './scripts/root.mjs';
// @xt 指向项目根目录，主工作区和各 worktree 都能读到同一份 balance/ maps/ design/
export default defineConfig({ base: './', build: { outDir: 'dist' }, resolve: { alias: { '@xt': findRoot(__dirname) } } });
