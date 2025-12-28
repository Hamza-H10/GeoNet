#!/usr/bin/env node
/**
 * Downloads portable Node.js runtime for Windows x64
 * This script downloads Node.js and extracts it to resources/nodejs/
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NODE_VERSION = '20.18.0'; // LTS version
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const TARGET_DIR = path.join(__dirname, '..', 'resources', 'nodejs');
const ZIP_FILE = path.join(__dirname, '..', 'resources', 'node.zip');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;
      
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = ((downloaded / totalSize) * 100).toFixed(1);
        process.stdout.write(`\rProgress: ${percent}%`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
    }).on('error', (err) => {
      try {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
      } catch (unlinkErr) {
        // Ignore unlink errors
      }
      reject(err);
    });
  });
}

async function extractZip(zipPath, extractTo) {
  console.log('Extracting Node.js...');
  
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  
  // Find the node.exe entry
  const nodeEntry = entries.find(e => e.entryName.includes('node.exe'));
  if (!nodeEntry) {
    throw new Error('node.exe not found in zip file');
  }
  
  // Extract only node.exe and npm.cmd (if needed)
  const nodeDir = path.dirname(nodeEntry.entryName);
  const extractEntries = entries.filter(e => 
    e.entryName.startsWith(nodeDir) && 
    (e.entryName.endsWith('node.exe') || 
     e.entryName.endsWith('npm.cmd') ||
     e.entryName.endsWith('npx.cmd'))
  );
  
  // Create target directory
  if (!fs.existsSync(extractTo)) {
    fs.mkdirSync(extractTo, { recursive: true });
  }
  
  extractEntries.forEach(entry => {
    if (!entry.isDirectory) {
      const targetPath = path.join(extractTo, path.basename(entry.entryName));
      const content = zip.readFile(entry);
      fs.writeFileSync(targetPath, content);
      console.log(`Extracted: ${path.basename(entry.entryName)}`);
    }
  });
  
  console.log('Extraction complete!');
}

async function main() {
  try {
    // Check if already downloaded
    const nodeExe = path.join(TARGET_DIR, 'node.exe');
    if (fs.existsSync(nodeExe)) {
      console.log('Node.js already downloaded. Skipping...');
      return;
    }
    
    // Create resources directory
    const resourcesDir = path.dirname(TARGET_DIR);
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }
    
    // Download Node.js
    await downloadFile(NODE_URL, ZIP_FILE);
    
    // Extract
    await extractZip(ZIP_FILE, TARGET_DIR);
    
    // Clean up zip file
    try {
      if (fs.existsSync(ZIP_FILE)) {
        fs.unlinkSync(ZIP_FILE);
      }
    } catch (err) {
      console.warn('Warning: Could not delete zip file:', err.message);
    }
    
    console.log(`\n✅ Node.js ${NODE_VERSION} downloaded successfully to ${TARGET_DIR}`);
    console.log(`   node.exe location: ${nodeExe}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

