import chalk from 'chalk';

export class InspectableError extends Error {
  cause: unknown;
  name = 'InspectableError';
  constructor(entity: 'run' | 'step', id: string, cause: unknown) {
    const message = chalk.cyan(
      `${chalk.bold('help:')} to inspect or retry manually run ${code(`wf inspect ${entity} ${id}`)}`
    );
    super(message, { cause: cause });
    this.cause = cause;
  }

  toString() {
    return `${this.cause}\n${this.message}`;
  }
}

function code(text: string) {
  const tick = chalk.dim('`');
  return chalk.italic(`${tick}${text}${tick}`);
}
