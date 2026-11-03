import fs from 'node:fs';
import path from 'node:path';

export interface CustomLensDef {
  name: string;
  description?: string;
  matchCommand?: string;
  matchOutput?: string;
  errorPattern: string;
  fileGroup?: number;
  lineGroup?: number;
  colGroup?: number;
  codeGroup?: number;
  messageGroup?: number;
}

export interface TermlensConfig {
  quietSuccess?: boolean;
  defaultLens?: string;
  tailLines?: number;
  maxErrors?: number;
  clusterErrors?: boolean;
  ciAnnotations?: boolean;
  ignorePatterns?: string[];
  customLenses?: CustomLensDef[];
}

const DEFAULT_CONFIG: TermlensConfig = {
  quietSuccess: false,
  tailLines: 8,
  maxErrors: 8,
  clusterErrors: true,
  ciAnnotations: false,
  ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
  customLenses: []
};

/**
 * Searches for and loads a termlens configuration file from the specified directory or current working directory.
 * Looks for: termlens.config.json, .termlensrc, .termlensrc.json, or package.json ["termlens"]
 */
export function loadConfig(searchDir: string = process.cwd()): TermlensConfig {
  const candidateFiles = [
    'termlens.config.json',
    '.termlensrc.json',
    '.termlensrc',
    'package.json'
  ];

  for (const filename of candidateFiles) {
    const fullPath = path.join(searchDir, filename);
    if (fs.existsSync(fullPath)) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);

        if (filename === 'package.json') {
          if (parsed && typeof parsed === 'object' && parsed.termlens) {
            return { ...DEFAULT_CONFIG, ...parsed.termlens };
          }
        } else if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_CONFIG, ...parsed };
        }
      } catch {
        // Fall back to default on parse failure
      }
    }
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * Generates default starter configuration JSON for `termlens --init`.
 */
export function generateStarterConfig(): string {
  const starter: TermlensConfig = {
    quietSuccess: false,
    tailLines: 8,
    maxErrors: 8,
    clusterErrors: true,
    ciAnnotations: false,
    ignorePatterns: ['node_modules/**', 'dist/**', '.git/**'],
    customLenses: [
      {
        name: 'custom-build',
        description: 'Example custom lens for internal build tool',
        matchCommand: 'mybuild',
        matchOutput: 'BUILD FAILED',
        errorPattern: '([a-zA-Z0-9_.-]+):(\\d+):(\\d+):\\s+error:\\s+(.*)',
        fileGroup: 1,
        lineGroup: 2,
        colGroup: 3,
        messageGroup: 4
      }
    ]
  };

  return JSON.stringify(starter, null, 2) + '\n';
}
