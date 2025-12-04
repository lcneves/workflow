import ts from 'typescript';
import { source } from '../lib/geistdocs/source';

interface SyntaxError {
  file: string;
  codeBlockLine: number;
  lineInBlock: number;
  message: string;
  code: string;
}

const CODE_BLOCK_REGEX =
  /```(ts|tsx|js|jsx|typescript|javascript)(?:\s+([^\n]*))?\n([\s\S]*?)```/g;

function extractCodeBlocks(
  content: string
): Array<{ code: string; language: string; startLine: number; meta: string }> {
  const blocks: Array<{
    code: string;
    language: string;
    startLine: number;
    meta: string;
  }> = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
    const language = match[1];
    const meta = match[2] || '';
    const code = match[3];
    // Calculate line number where this code block starts
    const beforeMatch = content.slice(0, match.index);
    const startLine = beforeMatch.split('\n').length;

    blocks.push({ code, language, startLine, meta });
  }

  // Reset regex state
  CODE_BLOCK_REGEX.lastIndex = 0;

  return blocks;
}

function cleanCode(code: string): string {
  // Remove fumadocs annotations - remove the entire comment including any text after the annotation
  // e.g., "// [!code highlight] Full history from client" -> ""
  return code
    .replace(/\s*\/\/\s*\[!code[^\]]*\].*$/gm, '')
    .replace(/\s*\/\*\s*\[!code[^\]]*\]\s*\*\//g, '');
}

// Detect if code contains JSX syntax
function containsJsx(code: string): boolean {
  // Look for JSX patterns: <Component, </tag>, or JSX expressions like {value}
  // within what looks like JSX context
  return (
    /<[A-Z][a-zA-Z]*[\s/>]/.test(code) || // <Component or <Component>
    /<\/[a-zA-Z]+>/.test(code) || // </tag>
    /return\s*\(?\s*</.test(code)
  ); // return ( <...
}

function checkSyntax(
  code: string,
  language: string,
  meta: string
): Array<{ line: number; message: string }> {
  // Determine script kind based on language, title metadata, OR JSX content detection
  // e.g., title="app/page.tsx" should be parsed as TSX even if language is "ts"
  const isTsx =
    language === 'tsx' ||
    language === 'jsx' ||
    meta.includes('.tsx') ||
    meta.includes('.jsx') ||
    containsJsx(code);
  const isJs = language === 'js' || language === 'javascript';

  const scriptKind = isTsx
    ? ts.ScriptKind.TSX
    : isJs
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    `example.${isTsx ? 'tsx' : language}`,
    code,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  // parseDiagnostics contains only syntax errors
  return sourceFile.parseDiagnostics.map((d) => {
    const pos =
      d.start !== undefined
        ? sourceFile.getLineAndCharacterOfPosition(d.start)
        : { line: 0 };

    return {
      line: pos.line + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    };
  });
}

async function checkTsExamples() {
  const allErrors: SyntaxError[] = [];

  const pages = source.getPages();

  for (const page of pages) {
    const content = await page.data.getText('raw');
    const blocks = extractCodeBlocks(content);

    for (const block of blocks) {
      // Skip blocks marked with lint-nocheck
      if (block.meta.includes('lint-nocheck')) {
        continue;
      }

      const cleanedCode = cleanCode(block.code);
      const syntaxErrors = checkSyntax(cleanedCode, block.language, block.meta);

      for (const error of syntaxErrors) {
        allErrors.push({
          file: page.absolutePath,
          codeBlockLine: block.startLine,
          lineInBlock: error.line,
          message: error.message,
          code: getCodeContext(cleanedCode, error.line),
        });
      }
    }
  }

  // Deduplicate errors by file + block + line (TS can report multiple diagnostics per issue)
  const seen = new Set<string>();
  const uniqueErrors = allErrors.filter((error) => {
    const key = `${error.file}:${error.codeBlockLine}:${error.lineInBlock}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueErrors.length > 0) {
    console.error('\n❌ Found syntax errors in code blocks:\n');

    for (const error of uniqueErrors) {
      console.error(`  ${error.file}`);
      console.error(
        `    Code block starting at line ${error.codeBlockLine}, error at line ${error.lineInBlock}:`
      );
      console.error(`    ${error.message}`);
      if (error.code) {
        console.error(`    > ${error.code}`);
      }
      console.error();
    }

    console.error(`\n${uniqueErrors.length} syntax error(s) found.\n`);
    process.exit(1);
  } else {
    console.log('✅ All code blocks have valid syntax.');
  }
}

function getCodeContext(code: string, line: number): string {
  const lines = code.split('\n');
  const targetLine = lines[line - 1];
  return targetLine ? targetLine.trim() : '';
}

void checkTsExamples();
