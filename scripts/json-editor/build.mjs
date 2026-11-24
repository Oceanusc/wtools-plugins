import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const worker = await build({ entryPoints: [path.join(here, 'src/filter-worker.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'chrome100', legalComments: 'eof' });
const runner = (await readFile(path.join(here, 'src/filter-runner.txt'), 'utf8'))
  .replace('__WTOOLS_FILTER_WORKER__', JSON.stringify(worker.outputFiles[0].text))
  .replace(/<\/script/gi, '<\\/script');
await build({ entryPoints: [path.join(here, 'src/app.js')], bundle: true, minify: true, plugins: [{ name: 'filter-runner', setup(builder) {
  builder.onLoad({ filter: /filter-runner\.txt$/ }, () => ({ contents: `export default ${JSON.stringify(runner)}`, loader: 'js' }));
} }], outfile: path.join(here, '../../plugins/wtools-json-editor/app.js'), target: 'chrome100', legalComments: 'eof' });
const packages = ['@codemirror/state','@codemirror/view','@codemirror/language','@codemirror/commands','@codemirror/search','@codemirror/autocomplete','@codemirror/lint','@codemirror/lang-json','@codemirror/lang-javascript','@codemirror/lang-xml','@lezer/common','@lezer/highlight','@lezer/lr','@lezer/json','@lezer/javascript','@lezer/xml','@marijn/find-cluster-break','codemirror','crelt','style-mod','w3c-keyname','yaml','sval','acorn'];
const notices = [];
for (const name of packages) {
  const root = path.join(here, 'node_modules', name);
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
  notices.push(`${name} ${pkg.version}\n${license}`);
}
await writeFile(path.join(here, '../../plugins/wtools-json-editor/THIRD-PARTY-LICENSES.txt'), notices.join('\n\n--------\n\n'));
