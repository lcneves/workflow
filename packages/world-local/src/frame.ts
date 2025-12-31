export function frame({
  text,
  contents,
}: {
  text: string;
  contents: string[];
}): string {
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

/**
 * @example
 * inlineExplanation`function ${{text: "hello", explain: "name not allowed bro"}}() {\n  return 666\n}`;
 * =>
 * function hello() {
 *          ──┬──
 *            ╰▶ name not allowed bro
 *   return 666
 * }
 */
export function inlineExplanation(
  text: TemplateStringsArray,
  ...values: Explainish[]
): string {
  type Marker = {
    startCol: number;
    endCol: number;
    explain: string;
    color?: (s: string) => string;
  };
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

    // Calculate midpoints for all markers
    const markerMids = pendingMarkers.map((marker) => {
      const textLen = marker.endCol - marker.startCol;
      const midPoint = Math.floor(textLen / 2);
      return marker.startCol + midPoint;
    });

    // Build single underline with all markers
    const underlineParts: string[] = [];
    let underlinePos = 0;
    for (const marker of pendingMarkers) {
      const textLen = marker.endCol - marker.startCol;
      const midPoint = Math.floor(textLen / 2);

      // Pad to reach this marker's start
      if (marker.startCol > underlinePos) {
        underlineParts.push(' '.repeat(marker.startCol - underlinePos));
        underlinePos = marker.startCol;
      }
      // Draw underline with ┬ in the middle
      const underlineSegment = `${'─'.repeat(midPoint)}┬${'─'.repeat(textLen - midPoint - 1)}`;
      const colorFn = marker.color ?? ((s: string) => s);
      underlineParts.push(colorFn(underlineSegment));
      underlinePos += textLen;
    }
    resultLines.push(underlineParts.join(''));

    // Build explanation lines - each one draws through subsequent markers
    for (let i = 0; i < pendingMarkers.length; i++) {
      const midCol = markerMids[i];
      let explanationLine = '╰';

      // Draw through remaining markers
      let pos = midCol + 1;
      for (let j = i + 1; j < pendingMarkers.length; j++) {
        const nextMid = markerMids[j];
        // Fill with ─ until we reach the next marker's midpoint
        while (pos < nextMid) {
          explanationLine += '─';
          pos++;
        }
        // At the next marker's midpoint, use ┼
        explanationLine += '┼';
        pos++;
      }

      // Add the final arrow and explanation
      // Single marker: ╰▶, multiple markers: always ─▶
      if (pendingMarkers.length === 1) {
        explanationLine += `▶ ${pendingMarkers[i].explain}`;
      } else {
        explanationLine += `─▶ ${pendingMarkers[i].explain}`;
      }
      const colorFn = pendingMarkers[i].color ?? ((s: string) => s);
      resultLines.push(' '.repeat(midCol) + colorFn(explanationLine));
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
