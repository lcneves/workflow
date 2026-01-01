import chalk from 'chalk';

const styles = {
  info: chalk.blue,
  help: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
};

export function help(messages: string | string[]) {
  const message = Array.isArray(messages) ? messages.join('\n') : messages;
  return styles.help(`${chalk.bold('help:')} ${message}`);
}

export function hint(messages: string | string[]) {
  const message = Array.isArray(messages) ? messages.join('\n') : messages;
  return styles.info(`${chalk.bold('hint:')} ${message}`);
}

export function note(messages: string | string[]) {
  const message = Array.isArray(messages) ? messages.join('\n') : messages;
  return styles.info(`${chalk.bold('note:')} ${message}`);
}

export function code(str: string) {
  return chalk.italic(`${chalk.dim('`')}${str}${chalk.dim('`')}`);
}

export function frame(text: string, contents: string[]): string {
  const result = [text];

  contents.forEach((content, index) => {
    const lines = content.split('\n');
    const isLastContent = index === contents.length - 1;

    const firstLinePrefix = isLastContent ? '╰▶ ' : '├▶ ';
    const continuationPrefix = isLastContent ? '   ' : '│  ';

    const framedLines = lines.map((line, lineIndex) => {
      const prefix = lineIndex === 0 ? firstLinePrefix : continuationPrefix;
      return `${prefix}${line}`;
    });

    result.push(...framedLines);
  });

  return result.join('\n');
}

interface Explain {
  text: string;
  explain: string;
  /** adds ansi coloring */
  color?: (s: string) => string;
}

type Explainish =
  | Explain
  | [text: string, explain: string, opts?: { color: Explain['color'] }];

type Marker = {
  startCol: number;
  endCol: number;
  explain: string;
  color?: (s: string) => string;
};

const identity = (s: string) => s;

function getMarkerMidpoint(marker: Marker): number {
  const textLen = marker.endCol - marker.startCol;
  return marker.startCol + Math.floor(textLen / 2);
}

function buildUnderline(markers: Marker[]): string {
  const parts: string[] = [];
  let pos = 0;
  for (const marker of markers) {
    const textLen = marker.endCol - marker.startCol;
    const midPoint = Math.floor(textLen / 2);

    if (marker.startCol > pos) {
      parts.push(' '.repeat(marker.startCol - pos));
      pos = marker.startCol;
    }
    const segment = `${'─'.repeat(midPoint)}┬${'─'.repeat(textLen - midPoint - 1)}`;
    const colorFn = marker.color ?? identity;
    parts.push(colorFn(segment));
    pos += textLen;
  }
  return parts.join('');
}

function buildExplanationLine(
  marker: Marker,
  midCol: number,
  remainingMids: number[],
  isOnlyMarker: boolean
): string {
  let line = '╰';
  let pos = midCol + 1;

  for (const nextMid of remainingMids) {
    while (pos < nextMid) {
      line += '─';
      pos++;
    }
    line += '┼';
    pos++;
  }

  const arrow = isOnlyMarker ? '▶ ' : '─▶ ';
  line += arrow + marker.explain;

  const colorFn = marker.color ?? identity;
  return ' '.repeat(midCol) + colorFn(line);
}

/**
 * @example
 * inline`function ${{text: "hello", explain: "name not allowed bro"}}() {\n  return 666\n}`;
 * =>
 * function hello() {
 *          ──┬──
 *            ╰▶ name not allowed bro
 *   return 666
 * }
 */
export function inline(
  text: TemplateStringsArray,
  ...values: Explainish[]
): string {
  const resultLines: string[] = [];
  let currentLine = '';
  let currentLineVisualLen = 0;
  let pendingMarkers: Marker[] = [];

  const flushLine = () => {
    resultLines.push(currentLine);
    if (pendingMarkers.length === 0) {
      currentLine = '';
      currentLineVisualLen = 0;
      return;
    }

    const markerMids = pendingMarkers.map(getMarkerMidpoint);

    resultLines.push(buildUnderline(pendingMarkers));

    for (let i = 0; i < pendingMarkers.length; i++) {
      const line = buildExplanationLine(
        pendingMarkers[i],
        markerMids[i],
        markerMids.slice(i + 1),
        pendingMarkers.length === 1
      );
      resultLines.push(line);
    }

    pendingMarkers = [];
    currentLine = '';
    currentLineVisualLen = 0;
  };

  for (let i = 0; i < text.length; i++) {
    const segment = text[i];
    const lines = segment.split('\n');

    for (let j = 0; j < lines.length; j++) {
      if (j > 0) {
        flushLine();
      }
      currentLine += lines[j];
      currentLineVisualLen += lines[j].length;
    }

    if (i < values.length) {
      const val = values[i];
      const value: Explain = !Array.isArray(val)
        ? val
        : { text: val[0], explain: val[1], ...val[2] };
      const startCol = currentLineVisualLen;
      const colorFn = value.color ?? ((s: string) => s);
      currentLine += colorFn(value.text);
      currentLineVisualLen += value.text.length;
      const endCol = currentLineVisualLen;
      pendingMarkers.push({
        startCol,
        endCol,
        explain: value.explain,
        color: value.color,
      });
    }
  }

  if (currentLine || pendingMarkers.length > 0) {
    flushLine();
  }

  return resultLines.join('\n');
}
