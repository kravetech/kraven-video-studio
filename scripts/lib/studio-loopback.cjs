// Remotion Studio and webpack lazy compilation listen on every interface and offer no host option.
// Preloaded by start-studio.mjs. Both wrapped steps run after Node has resolved every listen() form, so
// mixed, nested or ignored options cannot disguise a new TCP listener. Pipes, handles and descriptors pass through.
const net = require('node:net');

const LOOPBACK = '127.0.0.1';
const loopback = new net.BlockList();
loopback.addSubnet('127.0.0.0', 8, 'ipv4');
loopback.addAddress('::1', 'ipv6');

const isLoopback = address => net.isIP(address) !== 0 && loopback.check(address, `ipv${net.isIP(address)}`);
const isDescriptor = fd => typeof fd === 'number' && fd >= 0;
const isPipe = (address, port, addressType) => Boolean(address) && port === -1 && addressType === -1;
const stays = (address, port, addressType, fd) => isDescriptor(fd) || isPipe(address, port, addressType) || isLoopback(address);

// Without either step this Node dispatches differently from the one audited, so Studio must not start.
const listen2 = net.Server.prototype._listen2;
const createServerHandle = net._createServerHandle;
if (typeof listen2 !== 'function' || typeof createServerHandle !== 'function') throw new Error('Studio loopback guard does not support this Node.js version.');

// Node's single-process path. It names this step so code like this can wrap it. An adopted handle is already bound.
net.Server.prototype._listen2 = function (address, port, addressType, backlog, fd, flags) {
  if (this._handle || stays(address, port, addressType, fd)) return listen2.call(this, address, port, addressType, backlog, fd, flags);
  return listen2.call(this, LOOPBACK, port, 4, backlog, fd, flags);
};

// Windows cluster workers skip the step above: the primary creates their shared handle here.
net._createServerHandle = function (address, port, addressType, fd, flags) {
  if (stays(address, port, addressType, fd)) return createServerHandle(address, port, addressType, fd, flags);
  return createServerHandle(LOOPBACK, port, 4, fd, flags);
};
