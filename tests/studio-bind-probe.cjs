// Test-only observation of actual bindings in an isolated Studio process tree.
const net=require('node:net');
const fs=require('node:fs');
const original=net.Server.prototype.listen;
net.Server.prototype.listen=function(...args){
  this.once('listening',()=>{
    const address=this.address();
    if(address&&typeof address==='object'&&process.env.KVS_TEST_LISTENERS)fs.appendFileSync(process.env.KVS_TEST_LISTENERS,JSON.stringify({pid:process.pid,...address})+'\n');
  });
  return Reflect.apply(original,this,args);
};
