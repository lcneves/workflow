import chalk from 'chalk';

const styles = {
  info: chalk.blue,
  help: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
};

const prefix = chalk.dim(`[world-local] `);

export function write(level: keyof typeof styles, message: string | string[]) {
  const text = Array.isArray(message) ? message.join('\n') : message;
  console.error(styles[level](prefix + text));
}
