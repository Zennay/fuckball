'use strict';
// Fail-closed CI admission of intentionally RED product acceptance suites.
// A diagnostic marker alone is never evidence of the expected failed assertion.
const fs = require('node:fs');
const {AssertionError} = require('node:assert');
const {isTrackedRed} = require('./qa-known-red-classifier.cjs');

const inputLabels = new Set([
  ...[50,100,200].map(ms=>'speculative direction affects movement at '+ms+'ms'),
  'future-stamped direction is applied after its scheduled frame',
  'speculative fresh kick predicts a real native ball impulse'
]);
const greenMessages = {
  roster: 'PASS #31 4v4 roster acceptance:',
  input: 'PASS #28 input replay acceptance:'
};

function evaluate(kind, exitCode, output) {
  if (!Object.hasOwn(greenMessages,kind)) throw Error('Unknown QA suite: '+kind);
  if (!Number.isSafeInteger(exitCode) || exitCode < 0) throw Error('Invalid child exit status');
  if (typeof output !== 'string') throw Error('Missing captured test output');
  const lines=output.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const green=lines.some(line=>line.startsWith(greenMessages[kind]));
  const bad=lines.some(line=>/UNEXPECTED QA FAILURE|(?:^|\s)(?:TypeError|ReferenceError|SyntaxError|RangeError):|(?:^|\s)(?:Timed out|Timeout:|Error:)/.test(line));
  if (bad) throw Error('Unexpected runtime error in acceptance output');
  if (exitCode===0) {
    if (!green) throw Error('Zero exit code without completed acceptance success');
    if (lines.some(line=>/^RED |^#28 still RED|^KNOWN_RED_31_ACTIVE_OVERFLOW|^AssertionError \[ERR_ASSERTION\]:/.test(line)))
      throw Error('Green output contains a RED or assertion diagnostic');
    return 'GREEN';
  }
  if (exitCode!==1 || green) throw Error('Expected RED must exit with code 1 and no success banner');
  if (kind==='roster') {
    const markers=lines.filter(line=>line.startsWith('KNOWN_RED_31_ACTIVE_OVERFLOW'));
    if (markers.length!==1) throw Error('Expected exactly one 12-client roster-overflow proof');
    const m=/^KNOWN_RED_31_ACTIVE_OVERFLOW red=(\d+) blue=(\d+) connected=12$/.exec(markers[0]);
    if (!m) throw Error('Malformed 12-client roster-overflow proof');
    const red=Number(m[1]),blue=Number(m[2]);
    if (red+blue>12 || (red<=4 && blue<=4)) throw Error('No valid four-a-side overflow');
    const firstOverflow=red>4?'red':'blue';
    const assertions=lines.filter(line=>line.startsWith('AssertionError [ERR_ASSERTION]:'));
    if (assertions.length!==1 ||
      assertions[0] !== 'AssertionError [ERR_ASSERTION]: 12-person lobby: exactly four active '+firstOverflow+' players')
      throw Error('Roster marker not accompanied by the expected active-team assertion');
    if (lines.some(line=>/^RED |^#28 still RED/.test(line)))
      throw Error('Mixed acceptance suites in roster output');
    return 'KNOWN_RED';
  }
  const summaries=lines.map((line,i)=>/^#28 still RED \((\d+)\):$/.exec(line)?i:-1).filter(i=>i!==-1);
  if (summaries.length!==1) throw Error('Expected one completed input acceptance summary');
  const at=summaries[0], n=Number(/^#28 still RED \((\d+)\):$/.exec(lines[at])[1]);
  const failures=lines.slice(at+1);
  const earlier=lines.slice(0,at).filter(line=>line.startsWith('RED '));
  if (n<1 || n>inputLabels.size || n!==failures.length || n!==earlier.length)
    throw Error('Input RED count or final summary does not match observed scenarios');
  const seen=new Set();
  for(let i=0;i<n;i++){
    if (!failures[i].startsWith('- ') || earlier[i]!=='RED '+failures[i].slice(2))
      throw Error('Input RED summary does not match emitted diagnostics');
    const actual=failures[i].slice(2);
    const found=[...inputLabels].find(label=>actual.startsWith(label+': '));
    if(!found || seen.has(found)) throw Error('Unknown or duplicate input RED scenario');
    seen.add(found);
    const error=new AssertionError({message:actual.slice(found.length+2)});
    if(!isTrackedRed(error)) throw Error('Unrecognized input RED assertion');
  }
  if (lines.some(line=>/^KNOWN_RED_31_ACTIVE_OVERFLOW|^AssertionError \[ERR_ASSERTION\]:/.test(line)))
    throw Error('Mixed acceptance suites in input output');
  return 'KNOWN_RED';
}

if(require.main===module){
  try{
    const [kind, rawCode, logPath]=process.argv.slice(2);
    const code=Number(rawCode);
    if(rawCode===undefined || !logPath) throw Error('Usage: node qa-known-red-log-gate.cjs roster|input exit-code log-file');
    const result=evaluate(kind,code,fs.readFileSync(logPath,'utf8'));
    console.log('PASS '+kind+' acceptance CI log integrity: '+result);
  }catch(error){console.error('FAIL acceptance log integrity: '+error.message);process.exitCode=1;}
}
module.exports={evaluate};
