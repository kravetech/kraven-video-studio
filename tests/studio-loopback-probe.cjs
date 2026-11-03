// Test preload, loaded beneath the guard. It sees Node's final bind request and refuses a nonlocal one,
// so a guard failure is observed without opening a wildcard socket. Loopback, pipes and handles really bind.
const net = require('node:net');
const util = require('node:util');

const binds = [];
const local = new net.BlockList();
local.addSubnet('127.0.0.0', 8, 'ipv4');
local.addAddress('::1', 'ipv6');
const isLocal = address => net.isIP(address) !== 0 && local.check(address, `ipv${net.isIP(address)}`);
const refused = (address, port, addressType, fd) => !(typeof fd === 'number' && fd >= 0) && !(port === -1 && addressType === -1) && !isLocal(address);
const EACCES = [...util.getSystemErrorMap()].find(([, [name]]) => name === 'EACCES')[0];

const listen2 = net.Server.prototype._listen2;
net.Server.prototype._listen2 = function (address, port, addressType, backlog, fd, flags) {
  const adopted = Boolean(this._handle);
  binds.push({address, port, addressType, backlog, fd, flags, adopted});
  if (!adopted && refused(address, port, addressType, fd)) {
    process.nextTick(() => this.emit('error', Object.assign(new Error(`Nonlocal bind to ${address}`), {code: 'PROBE_NONLOCAL'})));
    return;
  }
  return listen2.call(this, address, port, addressType, backlog, fd, flags);
};
const createServerHandle = net._createServerHandle;
net._createServerHandle = function (address, port, addressType, fd, flags) {
  return refused(address, port, addressType, fd) ? EACCES : createServerHandle(address, port, addressType, fd, flags);
};

async function attempt(expression) {
  const server = net.createServer();
  const base = expression.includes('base') ? net.createServer() : null;
  if (base) await new Promise(resolve => base.listen(0, '127.0.0.1', resolve));
  const outcome = {expression, callbacks: 0, basePort: base?.address().port};
  binds.length = 0;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', resolve);
      new Function('server', 'cb', 'base', `return ${expression}`)(server, () => outcome.callbacks++, base);
    });
    outcome.address = server.address();
  } catch (error) {
    outcome.error = error.code ?? error.name;
  }
  [outcome.bind] = binds;
  if (base && outcome.address) base._handle = null;
  await Promise.all([server, base].filter(item => item?.listening).map(item => new Promise(resolve => item.close(resolve))));
  return outcome;
}

async function run(expressions) {
  const outcomes = [];
  for (const expression of expressions) outcomes.push(await attempt(expression));
  console.log(JSON.stringify(outcomes));
}

module.exports = {run};
