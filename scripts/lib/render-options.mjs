import net from 'node:net';

export function renderPort(env=process.env) {
  const raw=env.KRAVEN_RENDER_PORT??'42177';
  if(!/^[0-9]+$/.test(raw)) throw Error('KRAVEN_RENDER_PORT must be an integer from 1024 to 65535.');
  const port=Number(raw);
  if(!Number.isInteger(port)||port<1024||port>65535||port===3000) throw Error('Choose a render port from 1024 to 65535, excluding Studio port 3000.');
  return port;
}
export async function renderOptions(env=process.env) {
  const port=renderPort(env);
  // Refuse an occupied endpoint rather than allowing renderer reuse of another Studio.
  await new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',()=>reject(Error(`Render port ${port} is unavailable. Select a free KRAVEN_RENDER_PORT; do not stop another studio.`)));
    server.listen({host:'127.0.0.1',port},()=>server.close(resolve));
  });
  return {port};
}
