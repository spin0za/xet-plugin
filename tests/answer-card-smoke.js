const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('src/content/answer-card.css','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json','utf8'));
assert.ok(manifest.content_scripts[0].css.includes('src/content/answer-card.css'));
assert.match(css,/grid-template-columns: repeat\(5, 32px\)/);
assert.match(css,/grid-auto-rows: 44px/);
assert.match(css,/gap: 12px !important/);
assert.match(css,/padding: 10px 16px 64px !important/);
assert.match(css,/outline: 4px solid #202833 !important/);
assert.match(css,/@media \(forced-colors: active\)/);
assert.match(css,/-webkit-mask:/,'Chrome 119 needs the prefixed mask fallback');
assert.doesNotMatch(css,/forced-color-adjust:\s*none/);
function luminance(hex) {
  const c=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
function contrast(a,b) {const aa=luminance(a),bb=luminance(b);return (Math.max(aa,bb)+.05)/(Math.min(aa,bb)+.05);}
const colors=[];
for(const [name,pattern] of [['default',/\.info-item__block\) \{([^}]+)\}/],['correct',/\.success \{([^}]+)\}/],['wrong',/\.error \{([^}]+)\}/]]) {
  const block=css.match(pattern)?.[1];assert.ok(block,name);
  const get=key=>block.match(new RegExp(`--xet-answer-${key}: (#[a-f\\d]+)`,'i'))?.[1];
  const bg=get('background'),border=get('border'),icon=get('symbol');
  assert.ok(contrast('#242c36',bg)>=4.5,`${name} number contrast`);
  assert.ok(contrast(border,bg)>=3,`${name} border contrast`);
  assert.ok(contrast(icon,bg)>=3,`${name} icon contrast`);
  colors.push({name,text:contrast('#242c36',bg).toFixed(2),icon:contrast(icon,bg).toFixed(2)});
}
assert.match(css,/\.answered \{[^}]+circle/,'Answered is a dot, not a correct check');
assert.match(css,/Unknown \/ manually graded/,'Unknown outcomes must not be guessed');
assert.match(css,/:not\(:has\(\.default, \.unanswered, \.essay\)\)/,'Do not overflow the native three-item exam legend with a fourth item');
console.log('V2 answer-card sizes, status cues, contrast and high-contrast policy passed', colors);
