import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as archiverModule from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'dvn-workshop-nov-26', 'backend');
const distDir = path.join(backendDir, 'dist');
const buildDir = path.join(__dirname, 'build');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

function createArchive(format, options) {
  // Compatibilidade com archiver v8 (ESM com ZipArchive) e v7/CJS (factory function)
  if (format === 'zip' && archiverModule.ZipArchive) {
    return new archiverModule.ZipArchive(options);
  }
  const factory = archiverModule.default || archiverModule;
  if (typeof factory === 'function') {
    return factory(format, options);
  }
  throw new Error('Não foi possível inicializar a instância do archiver');
}

function zipFunction(name, folder) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(buildDir, `${name}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = createArchive('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`[ZIP OK] ${name}.zip (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    // 1. Pasta compilada da funcao
    archive.directory(path.join(distDir, folder), folder);

    // 2. Pasta compilada shared
    archive.directory(path.join(distDir, 'shared'), 'shared');

    // 3. package.json da raiz do backend
    archive.file(path.join(backendDir, 'package.json'), { name: 'package.json' });

    // 4. node_modules de producao
    archive.directory(path.join(backendDir, 'node_modules'), 'node_modules');

    archive.finalize();
  });
}

async function main() {
  console.log('--> Gerando pacotes ZIP padrao PKZip para as Lambdas...');
  await zipFunction('lambda-controller', 'lambda-controller');
  await zipFunction('lambda-generator', 'lambda-generator');
  await zipFunction('lambda-processor', 'lambda-processor');
  console.log('--> Todos os pacotes ZIP foram gerados com sucesso!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
