import { Chalk } from 'chalk';
import { describe, expect, test } from 'vitest';
import { frame, inline } from './ansi.js';

test('frames', () => {
  const output = frame('text text text text\ntext text text text', [
    'contents0 contents0 contents0\ncontents0 contents0 contents0',
    'contents1 contents1 contents1\ncontents1 contents1 contents1',
  ]);

  expect(`\n${output}\n`).toMatchInlineSnapshot(`
    "
    text text text text
    text text text text
    ├▶ contents0 contents0 contents0
    │  contents0 contents0 contents0
    ╰▶ contents1 contents1 contents1
       contents1 contents1 contents1
    "
  `);
});

test('composable', () => {
  const output = frame('text text text text\ntext text text text', [
    frame('whatever\nwhenever', ['inner0\ninner0']),
    frame('whatever2\nwhenever2', ['inner1\ninner1']),
  ]);
  expect(`\n${output}\n`).toMatchInlineSnapshot(`
    "
    text text text text
    text text text text
    ├▶ whatever
    │  whenever
    │  ╰▶ inner0
    │     inner0
    ╰▶ whatever2
       whenever2
       ╰▶ inner1
          inner1
    "
  `);
});

describe('inline', () => {
  test('single odd-length explanation', () => {
    const value = inline`function ${{ text: 'hello', explain: 'name not allowed bro' }}() {\n  return 666\n}`;
    expect(value).toEqual(
      `
function hello() {
         ──┬──
           ╰▶ name not allowed bro
  return 666
}
`.trim()
    );
  });

  test('single even-length explanation', () => {
    const value = inline`function ${{ text: 'name', explain: 'name not allowed bro' }}() {\n  return 666\n}`;
    expect(value).toEqual(
      `
function name() {
         ──┬─
           ╰▶ name not allowed bro
  return 666
}
`.trim()
    );
  });

  test('two explanations', () => {
    const value = inline`function ${{ text: 'name', explain: 'name not allowed bro' }}(${{ text: 'arg', explain: 'unused' }}) {\n  return 666\n}`;
    expect(value).toEqual(
      `
function name(arg) {
         ──┬─ ─┬─
           ╰───┼─▶ name not allowed bro
               ╰─▶ unused
  return 666
}
`.trim()
    );
  });

  test('three explanations', () => {
    const value = inline`
${{ text: 'fun', explain: 'nothing fun about it' }}ction ${{ text: 'name', explain: 'name not allowed bro' }}(${{ text: 'arg', explain: 'unused' }}) {
  return 666
}`;
    expect(value).toEqual(
      `
function name(arg) {
─┬─      ──┬─ ─┬─
 ╰─────────┼───┼─▶ nothing fun about it
           ╰───┼─▶ name not allowed bro
               ╰─▶ unused
  return 666
}`
    );
  });

  test('colored explanations', () => {
    const red = (s: string) => `<R>${s}</R>`;
    const green = (s: string) => `<G>${s}</G>`;
    const value = inline`
function ${['name', 'name not allowed bro', { color: green }]}(${['arg', 'unused', { color: red }]}) {
  return 666
}`;

    const chalk = new Chalk({ level: 3 });
    console.log(inline`
function ${['name', 'name not allowed bro', { color: chalk.green }]}(${['arg', 'unused', { color: chalk.red }]}) {
  return 666
}`);

    expect(value).toEqual(
      `
function <G>name</G>(<R>arg</R>) {
         <G>──┬─</G> <R>─┬─</R>
           <G>╰───┼─▶ name not allowed bro</G>
               <R>╰─▶ unused</R>
  return 666
}`
    );
  });
});
