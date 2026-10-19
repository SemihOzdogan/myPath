const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const deployment = process.argv[2];

if (!['Staging', 'Production'].includes(deployment)) {
  throw new Error('Deployment must be Staging or Production.');
}

async function release() {
  const terminal = createInterface({ input: stdin, output: stdout });
  const description = (await terminal.question('Güncelleme açıklaması: ')).trim();
  terminal.close();

  const args = ['release-react', 'myPath', 'ios', '-d', deployment, '--force'];
  if (description) {
    args.push('--description', description);
  }

  const command = spawn('revopush', args, { stdio: 'inherit' });
  command.on('error', error => {
    console.error(`Revopush başlatılamadı: ${error.message}`);
    process.exitCode = 1;
  });
  command.on('exit', code => {
    process.exitCode = code ?? 1;
  });
}

release().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
