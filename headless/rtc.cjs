'use strict';
// Optional UDP-style transport for room clients: a WebRTC data channel that is
// unordered and never retransmits, so one lost packet never holds back the
// snapshots and inputs behind it (TCP head-of-line blocking). Signalling runs
// over the existing WebSocket, which also stays the fallback and carries all
// reliable control messages. Needs the optional `node-datachannel` package;
// without it the server simply keeps using WebSockets.
let lib=null;try{lib=require('node-datachannel');}catch{}
const available=!!lib;
function iceServers(){return (process.env.FUCKBALL_STUN??'stun:stun.l.google.com:19302').split(',').map(s=>s.trim()).filter(Boolean);}
function portRange(){const m=/^(\d+)-(\d+)$/.exec(process.env.FUCKBALL_RTC_PORTS||'');return m?{portRangeBegin:+m[1],portRangeEnd:+m[2]}:{};}
let nextId=0;
/* Starts a peer for one WebSocket client. signal(msg) sends signalling JSON over the
   WebSocket; onMessage(buffer) receives data-channel messages. */
function open(signal,onMessage,onState){
 if(!lib)return null;
 const pc=new lib.PeerConnection('fb'+(++nextId),{iceServers:iceServers(),...portRange()});
 const peer={pc,dc:null,ready:false,closed:false,
  send(data){const dc=peer.dc;if(!peer.ready||!dc)return false;try{if(dc.bufferedAmount()>65536)return true;return Buffer.isBuffer(data)?dc.sendMessageBinary(Buffer.from(data)):dc.sendMessage(data);}catch{return false;}},
  remote(d){try{if(d.description&&typeof d.description.sdp==='string'&&d.description.type==='answer')pc.setRemoteDescription(d.description.sdp,'answer');
   else if(d.candidate&&typeof d.candidate.candidate==='string')pc.addRemoteCandidate(d.candidate.candidate,String(d.candidate.mid??'0'));}catch{}},
  close(){if(peer.closed)return;peer.closed=true;peer.ready=false;try{peer.dc?.close();}catch{}try{pc.close();}catch{}}};
 pc.onLocalDescription((sdp,type)=>signal({type:'rtcSignal',description:{sdp,type:type.toLowerCase()}}));
 pc.onLocalCandidate((candidate,mid)=>signal({type:'rtcSignal',candidate:{candidate,mid}}));
 const dc=pc.createDataChannel('game',{unordered:true,maxRetransmits:0});peer.dc=dc;
 dc.onOpen(()=>{if(peer.closed)return;peer.ready=true;onState?.(true);});
 dc.onClosed(()=>{peer.ready=false;onState?.(false);});
 dc.onMessage(msg=>{if(!peer.closed)onMessage(Buffer.isBuffer(msg)?msg:Buffer.from(String(msg)));});
 return peer;
}
module.exports={available,open};
