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

export function help(messages: string | string[]) {
  const message = Array.isArray(messages) ? messages.join('\n') : messages;
  return styles.help(`${chalk.bold('help:')} ${message}`);
}

export function hint(messages: string | string[]) {
  const message = Array.isArray(messages) ? messages.join('\n') : messages;
  return styles.info(`${chalk.bold('hint:')} ${message}`);
}

export function code(str: string) {
  return chalk.italic(`${chalk.dim('`')}${str}${chalk.dim('`')}`);
}
