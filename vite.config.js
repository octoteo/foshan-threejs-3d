import { resolve } from 'node:path';
import { defineConfig } from 'vite';
const root=process.cwd();
export default defineConfig({base:'./',build:{target:'es2022',sourcemap:true,assetsInlineLimit:0,rollupOptions:{input:{main:resolve(root,'index.html'),legacy:resolve(root,'legacy.html')}}}});
