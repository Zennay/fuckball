'use strict';
const assert=require('node:assert/strict'),t=require('../dist/room-server-time.js');
const link={},epoch=1760000000000;
assert.equal(t.observe(link,epoch,1200),true);
for(const skew of [-360000,0,360000]){
 assert.equal(t.now(link,1200,epoch+skew),epoch);
 assert.equal(t.now(link,6200,epoch+skew),epoch+5000);
 assert.equal(t.now(link,61200,epoch+skew),epoch+60000);
}
assert.equal(t.observe(link,'unknown',6200),false,'invalid server clock rejected');
assert.equal(t.now(link,6200,epoch+360000),epoch+5000,'invalid message does not invalidate last good receipt');
assert.equal(t.now({},6200,1234567890),1234567890,'older servers use bounded compatibility clock');
assert.equal(t.now(link,0,epoch+360000),epoch,'monotonic nonnegative elapsed');
console.log('PASS room server mute deadline monotonic under +/-6 minute wall clock skew and invalid receipt');
