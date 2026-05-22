import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';
import { EOL } from 'node:os';

function toCommandValue(value: string): string {
  return value;
}

function escapeData(value: string): string {
  return toCommandValue(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
  return escapeData(value)
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');
}

function issueCommand(command: string, properties: Record<string, string>, message: string): void {
  const propertyText = Object.entries(properties)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${escapeProperty(value)}`)
    .join(',');
  const separator = propertyText === '' ? '' : ` ${propertyText}`;

  process.stdout.write(`::${command}${separator}::${escapeData(message)}${EOL}`);
}

function prepareKeyValueMessage(key: string, value: string): string {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  if (key.includes(delimiter)) {
    throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
  }
  if (value.includes(delimiter)) {
    throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
  }

  return `${key}<<${delimiter}${EOL}${value}${EOL}${delimiter}`;
}

function issueFileCommand(command: string, message: string): void {
  const filePath = process.env[`GITHUB_${command}`];
  if (filePath === undefined || filePath === '') {
    throw new Error(`Unable to find environment variable for file command ${command}`);
  }
  if (!existsSync(filePath)) {
    throw new Error(`Missing file at path: ${filePath}`);
  }

  appendFileSync(filePath, `${message}${EOL}`, { encoding: 'utf8' });
}

export function getInput(name: string): string {
  return (process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? '').trim();
}

export function setOutput(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT !== undefined && process.env.GITHUB_OUTPUT !== '') {
    issueFileCommand('OUTPUT', prepareKeyValueMessage(name, value));
    return;
  }

  issueCommand('set-output', { name }, value);
}

export function setFailed(message: string): void {
  process.exitCode = 1;
  issueCommand('error', {}, message);
}
