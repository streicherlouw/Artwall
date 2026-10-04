"use strict";
const { execFileSync } = require('node:child_process');
const { download } = require('../lib/sources');
const config = require("./config.json");
const { pages } = require('../lib/board');
const palette = { '.':' ', O:'🟧', Y:'🟨', W:'⬜', P:'🟪', B:'🟦', R:'🟥', G:'🟩' };
const animals = [
  { name: 'CAT', rows: [
    '..O......O..', '..OO....OO..', '..OOOOOOOO..', '..OWOOWOWO..', '..OOOOOOOO..', '...WWRWWW...', '....OOOO....', '...OOOOOO...', '..OO....OO..'
  ] },
  { name: 'DOG', rows: [
    '..OO....OO..', '.OOOOOOOOOO.', '.OOWWWWWWOO.', '.OOW.WW.WOO.', '.OOWWWWWWOO.', '..WWW..WWW..', '...WWRRWW...', '....WWWW....', '...WW..WW...'
  ] },
  { name: 'OWL', rows: [
    '..P......P..', '..PPPPPPPP..', '.PPWWPPWWPP.', '.PW.WPPW.WP.', '.PPWWYYWWPP.', '..PPPYYPPP..', '..PPWWWWPP..', '...PWWWWP...', '....Y..Y....'
  ] }
];
function pixelArt(animal) {
  return animal.rows.map(row => {
    if (row.length !== 12) throw new Error('Invalid pixel-art width');
    return ' '.repeat(Math.floor((config.columns-12)/2)) + Array.from(row, c => palette[c]).join('') + ' '.repeat(Math.ceil((config.columns-12)/2));
  }).join('\n');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = (type, text) => {
  const args = ['standalone/send.js', type]; if (text) args.push(text);
  const result = execFileSync(process.execPath, args, { cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8', timeout: 45000 });
  console.log(result.trim());
};
(async () => {
  const batch = JSON.parse(await download('https://zenquotes.io/api/quotes'));
  const quotes = batch.filter(q => q.q && q.a && q.a !== 'zenquotes.io' && q.q.length < 95 && pages(`${q.q}\n- ${q.a}\nZENQUOTES.IO`,config.columns,config.rows).length === 1).slice(0,3);
  if (quotes.length !== 3) throw new Error('Not enough short quotes');
  const sequence = animals.flatMap((animal, i) => [
    { label: animal.name, text: pixelArt(animal) },
    { label: `QUOTE - ${quotes[i].a}`, text: `${quotes[i].q}\n- ${quotes[i].a}\nZENQUOTES.IO` }
  ]);
  let began;
  try {
    for (let i=0; i<sequence.length; i++) {
      if(i) await sleep(Math.max(0, began+i*10000-Date.now()));
      send('message',sequence[i].text);
      if(!i) began=Date.now();
      console.log(`${new Date().toISOString()} ${i+1}/${sequence.length}: ${sequence[i].label}`);
    }
    await sleep(Math.max(0,began+sequence.length*10000-Date.now()));
  } finally { send('deactivate'); console.log('Animal/quote test complete; display released.'); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
