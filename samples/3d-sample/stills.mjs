// 部品の見た目を静止画で確かめる（動画を書き出すより速い）
// node stills.mjs <コンポジション名> <出力フォルダ> <コマ番号,…> [props.json]
//   例: node stills.mjs Catalog-Mid out/mid 172,424,1180
//   props.json は {"data": ShortData, "note": "…"}（実データを fromAnalysis で変換したものなど）
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [id, outDir, framesArg, propsFile] = process.argv.slice(2);
if (!id || !outDir || !framesArg) {
  console.log('node stills.mjs <コンポジション名> <出力フォルダ> <コマ番号,…> [props.json]');
  process.exit(1);
}
const inputProps = propsFile ? JSON.parse(fs.readFileSync(propsFile, 'utf8')) : {};
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id, inputProps, chromiumOptions: { gl: 'angle' } });
fs.mkdirSync(outDir, { recursive: true });
for (const fr of framesArg.split(',').map(Number)) {
  const output = path.join(outDir, `${id}-${String(fr).padStart(5, '0')}.png`);
  try {
    await renderStill({ serveUrl, composition, frame: fr, output, inputProps, chromiumOptions: { gl: 'angle' } });
    console.log(output);
  } catch (e) {
    // 1枚失敗しても止めない（どの部品で落ちたかを出す）
    console.log(`失敗 ${fr}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
