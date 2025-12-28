#!/usr/bin/env node
/**
 * Bundles backend dependencies for packaging
 * Copies required node_modules to backend/node_modules
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_DEPS = [
  'express',
  'cors',
  'body-parser',
  'jsonwebtoken',
  'bcryptjs',
  'better-sqlite3',
  'serialport',
  '@serialport', // Serialport namespace packages
];

// Critical transitive dependencies for native modules
const TRANSITIVE_DEPS = [
  'bindings',
  'file-uri-to-path',
  'nan',
  'prebuild-install',
  'node-gyp-build',
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Source not found: ${src}`);
    return;
  }

  const stat = fs.statSync(src);
  
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      copyRecursive(srcPath, destPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const rootDir = path.join(__dirname, '..');
  const nodeModulesDir = path.join(rootDir, 'node_modules');
  const backendNodeModulesDir = path.join(rootDir, 'backend', 'node_modules');

  // Create backend/node_modules directory
  if (!fs.existsSync(backendNodeModulesDir)) {
    fs.mkdirSync(backendNodeModulesDir, { recursive: true });
  }

  console.log('Bundling backend dependencies...');

  // Copy main dependencies
  for (const dep of BACKEND_DEPS) {
    const srcPath = path.join(nodeModulesDir, dep);
    const destPath = path.join(backendNodeModulesDir, dep);

    if (fs.existsSync(srcPath)) {
      console.log(`Copying ${dep}...`);
      copyRecursive(srcPath, destPath);
    } else if (dep.startsWith('@')) {
      // Handle scoped packages
      const [scope, pkgName] = dep.split('/');
      const scopeDir = path.join(nodeModulesDir, scope);
      if (fs.existsSync(scopeDir)) {
        const entries = fs.readdirSync(scopeDir);
        for (const entry of entries) {
          if (entry.includes(pkgName) || pkgName === '*') {
            const src = path.join(scopeDir, entry);
            const dest = path.join(backendNodeModulesDir, scope, entry);
            console.log(`Copying ${scope}/${entry}...`);
            copyRecursive(src, dest);
          }
        }
      }
    } else {
      console.warn(`Dependency not found: ${dep}`);
    }
  }

  // Copy transitive dependencies
  for (const dep of TRANSITIVE_DEPS) {
    const srcPath = path.join(nodeModulesDir, dep);
    const destPath = path.join(backendNodeModulesDir, dep);

    if (fs.existsSync(srcPath)) {
      console.log(`Copying transitive dependency ${dep}...`);
      copyRecursive(srcPath, destPath);
    }
  }

  console.log('✅ Backend dependencies bundled successfully!');
}

main();

