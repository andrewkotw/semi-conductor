const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const config = path.join(src, 'config.js');
const buildConfig = path.join(src, 'config.build.js');
const prodConfig = path.join(src, 'config.prod.js');

function rename(from, to) {
  fs.renameSync(from, to);
}

function restoreConfig() {
  if (fs.existsSync(buildConfig)) {
    if (fs.existsSync(config)) rename(config, prodConfig);
    rename(buildConfig, config);
  }
}

try {
  if (fs.existsSync(dist)) {
    fs.rmdirSync(dist, { recursive: true });
  }

  rename(config, buildConfig);
  rename(prodConfig, config);

  childProcess.execFileSync(
    path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'parcel.cmd' : 'parcel'),
    ['build', 'src/index.html', '--out-dir', 'dist/static/', '--public-url', '/static/'],
    { cwd: root, stdio: 'inherit' }
  );

  rename(path.join(dist, 'static', 'index.html'), path.join(dist, 'index.html'));
  fs.copyFileSync(path.join(src, 'app.yaml'), path.join(dist, 'app.yaml'));
} finally {
  restoreConfig();
}
