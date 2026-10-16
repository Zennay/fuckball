/* Small dependency-free WebSocket transport for the same-origin room server.
   Supports browser text messages, masking, pings, close, and RFC 6455 frame lengths.
   Not a general-purpose websocket implementation (no fragmentation/extensions). */
'use strict';
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const MAGIC='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WebSocket extends EventEmitter {
  static OPEN=1;
  constructor(socket,maxPayload){
    super();this.socket=socket;socket.setNoDelay?.(true); // small input/snapshot frames must not wait for Nagle
    this.readyState=1;this.buf=Buffer.alloc(0);this.maxPayload=maxPayload;
    socket.on('data',data=>this.readData(data));
    socket.on('close',()=>this.closed());socket.on('end',()=>this.closed());socket.on('error',()=>this.closed());
  }
  closed(){if(this.readyState===3)return;this.readyState=3;this.emit('close');}
  frame(opcode,payload){
    if(this.readyState!==1)return;
    const data=Buffer.isBuffer(payload)?payload:Buffer.from(String(payload));
    let head;
    if(data.length<126){head=Buffer.from([0x80|opcode,data.length]);}
    else if(data.length<=65535){head=Buffer.alloc(4);head[0]=0x80|opcode;head[1]=126;head.writeUInt16BE(data.length,2);}
    else{head=Buffer.alloc(10);head[0]=0x80|opcode;head[1]=127;head.writeBigUInt64BE(BigInt(data.length),2);}
    this.socket.write(Buffer.concat([head,data]));
  }
  send(s){this.frame(Buffer.isBuffer(s)?2:1,s);}
  close(code=1000,reason=''){
    if(this.readyState!==1)return;
    const reasonBytes=Buffer.from(String(reason)).subarray(0,123),buf=Buffer.alloc(2+reasonBytes.length);
    buf.writeUInt16BE(code,0);reasonBytes.copy(buf,2);
    this.frame(8,buf);this.readyState=2;this.socket.end();
    // On abnormal peer disconnect do not leave a socket hanging indefinitely.
    this.socket.setTimeout(1000,()=>this.socket.destroy());
  }
  readData(data){
    if(this.readyState!==1)return;
    this.buf=Buffer.concat([this.buf,data]);
    if(this.buf.length>this.maxPayload+4096){this.close(1009,'Too large');return;}
    while(this.buf.length>=2&&this.readyState===1){
      const a=this.buf[0],b=this.buf[1],opcode=a&15,fin=(a&128)!==0,masked=(b&128)!==0;
      if(!fin||!masked||(a&0x70)){this.close(1002,'Unsupported frame');return;}
      let len=b&127,pos=2;
      if(len===126){if(this.buf.length<4)return;len=this.buf.readUInt16BE(2);pos=4;}
      else if(len===127){if(this.buf.length<10)return;const size=this.buf.readBigUInt64BE(2);if(size>BigInt(this.maxPayload)){this.close(1009,'Too large');return;}len=Number(size);pos=10;}
      // RFC 6455 section 5.5: ALL control frames (close, ping, pong) are
      // limited to 125 bytes. Do not emit invalid oversized pong replies.
      if((opcode&8)&&len>125){this.close(1002,'Invalid control frame');return;}
      if(len>this.maxPayload){this.close(1009,'Too large');return;}
      if(this.buf.length<pos+4+len)return;
      const key=this.buf.subarray(pos,pos+4),payload=Buffer.from(this.buf.subarray(pos+4,pos+4+len));
      this.buf=this.buf.subarray(pos+4+len);
      for(let i=0;i<payload.length;i++)payload[i]^=key[i&3];
      if(opcode===1){this.emit('message',payload,false);}
      else if(opcode===2){this.emit('message',payload,true);}
      else if(opcode===8){if(payload.length===1){this.close(1002,'Invalid close frame');return;}this.close(1000);return;}
      else if(opcode===9){this.frame(10,payload);}
      else if(opcode!==10){this.close(1003,'Unsupported opcode');return;}
    }
  }
}
class WebSocketServer extends EventEmitter{
  constructor({server,maxPayload=2048}){
    super();this.maxPayload=maxPayload;
    server.on('upgrade',(req,socket,head)=>{
      const key=req.headers['sec-websocket-key'],version=req.headers['sec-websocket-version'];
      const origin=req.headers.origin;
      let allowedOrigin=true;
      if(origin&&process.env.ALLOW_CROSS_ORIGIN!=='1'){
        try{allowedOrigin=new URL(origin).host===req.headers.host;}catch{allowedOrigin=false;}
      }
      if(req.url?.split('?')[0]!=='/ws'||req.headers.upgrade?.toLowerCase()!=='websocket'||version!=='13'||
        typeof key!=='string'||!/^[-\w+/]{22}==$/.test(key)||!allowedOrigin){
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
      }
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(key+MAGIC).digest('base64')+'\r\n\r\n');
      // Small frames (inputs, pongs, 30 Hz snapshots) must not wait for Nagle batching.
      socket.setNoDelay?.(true);socket.setKeepAlive?.(true,15000);
      const ws=new WebSocket(socket,this.maxPayload);this.emit('connection',ws,req);
      if(head&&head.length)ws.readData(head);
    });
  }
}
module.exports={WebSocketServer,WebSocket};