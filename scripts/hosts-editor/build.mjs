import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { transform } from 'esbuild';
const root = new URL('../../plugins/wtools-hosts/vendor/', import.meta.url);
await mkdir(root, { recursive: true });
const parts = ['lib/codemirror.js', 'addon/dialog/dialog.js', 'addon/selection/active-line.js', 'keymap/vim.js'];
const source = (await Promise.all(parts.map(p => readFile(new URL(`node_modules/codemirror/${p}`, import.meta.url), 'utf8')))).join('\n;\n');
await writeFile(new URL('editor.js', root), (await transform(source, { minify: true, target: 'es2020', legalComments: 'none' })).code);
await writeFile(new URL('editor.css', root), await readFile(new URL('node_modules/codemirror/lib/codemirror.css', import.meta.url)));
await writeFile(new URL('CodeMirror-LICENSE.txt', root), await readFile(new URL('node_modules/codemirror/LICENSE', import.meta.url)));
