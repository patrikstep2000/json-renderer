#!/usr/bin/env node

import { type Dirent, promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildTailwindSafelistFromTemplateJsonList } from './tailwind';

interface CliArgs {
  inputPaths: string[];
  outputPath: string | null;
}

function printHelp(): void {
  process.stdout.write(`Usage: json-renderer-tailwind-safelist --input <path> [--input <path>] [--output <file>]\n`);
}

function parseArgs(argv: string[]): CliArgs {
  const inputPaths: string[] = [];
  let outputPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--input' || arg === '-i') {
      if (!next) {
        throw new Error('Missing value for --input');
      }
      inputPaths.push(next);
      index += 1;
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      if (!next) {
        throw new Error('Missing value for --output');
      }
      outputPath = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (inputPaths.length === 0) {
    throw new Error('At least one --input path is required');
  }

  return { inputPaths, outputPath };
}

async function collectJsonFiles(targetPath: string): Promise<string[]> {
  const absolutePath = path.resolve(targetPath);
  const stats = await fs.stat(absolutePath);

  if (stats.isFile()) {
    if (!absolutePath.endsWith('.json')) {
      return [];
    }
    return [absolutePath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry: Dirent) => {
      const entryPath = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFiles(entryPath);
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        return [entryPath];
      }
      return [];
    }),
  );

  return nestedFiles.flat();
}

async function loadTemplateJsonFromFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

async function run(): Promise<void> {
  const { inputPaths, outputPath } = parseArgs(process.argv.slice(2));

  const collected = await Promise.all(inputPaths.map((inputPath) => collectJsonFiles(inputPath)));
  const jsonFiles = Array.from(new Set(collected.flat())).sort((left, right) => left.localeCompare(right));
  const templateJsonList = await Promise.all(jsonFiles.map((filePath) => loadTemplateJsonFromFile(filePath)));

  const safelist = buildTailwindSafelistFromTemplateJsonList(templateJsonList);
  const output = safelist.length > 0 ? `${safelist}\n` : '';

  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
    await fs.writeFile(resolvedOutput, output, 'utf8');
    process.stdout.write(`Generated Tailwind safelist from ${jsonFiles.length} template file(s): ${resolvedOutput}\n`);
    return;
  }

  process.stdout.write(output);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown CLI error';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
