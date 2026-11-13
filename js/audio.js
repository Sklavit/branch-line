/* Branch Line sound: generated in the browser with Web Audio, no audio files.
   Exposes window.Snd = { start, setOn, clack, whistle }. */
(function(){
"use strict";
var AC=window.AudioContext||window.webkitAudioContext;
var c=null,on=true,music,sfx,send,noise,nextChord=0,nextNote=0,chordI=0,noteI=4,lastClack=0,lastWhistle=0,timer=0;
/* D major: pads move D, Bm, G, Asus; the melody wanders over the pentatonic scale */
var CHORDS=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,66],[45,52,57,62,64]];
var SCALE=[62,64,66,69,71,74,76,78,81];
function hz(m){return 440*Math.pow(2,(m-69)/12)}
function tone(f,t,dur,type,g,att,rel,dest){
  var o=c.createOscillator(),v=c.createGain();o.type=type;o.frequency.value=f;
  v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(g,t+att);v.gain.setValueAtTime(g,t+Math.max(att,dur-rel));v.gain.linearRampToValueAtTime(0,t+dur);
  o.connect(v);v.connect(dest);o.start(t);o.stop(t+dur+0.05);return v}
function build(){
  c=new AC();
  var comp=c.createDynamicsCompressor(),master=c.createGain();master.gain.value=0.9;master.connect(comp);comp.connect(c.destination);
  music=c.createGain();music.gain.value=0.55;music.connect(master);
  sfx=c.createGain();sfx.gain.value=0.6;sfx.connect(master);
  var d=c.createDelay(1),fb=c.createGain(),lp=c.createBiquadFilter();d.delayTime.value=0.46;fb.gain.value=0.38;lp.type='lowpass';lp.frequency.value=1800;
  send=c.createGain();send.gain.value=0.5;send.connect(d);d.connect(lp);lp.connect(fb);fb.connect(d);lp.connect(music);
  var b=c.createBuffer(1,Math.floor(c.sampleRate*0.25),c.sampleRate),ch=b.getChannelData(0);for(var i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;noise=b;
  nextChord=c.currentTime+0.3;nextNote=c.currentTime+2.5;
  timer=setInterval(tick,400)}
function tick(){
  if(!c||c.state!=='running')return;var now=c.currentTime,L=9;
  if(nextChord<now-1)nextChord=now+0.2;if(nextNote<now-1)nextNote=now+1;
  while(nextChord<now+1.5){var ch=CHORDS[chordI%4];chordI++;
    for(var i=0;i<ch.length;i++){tone(hz(ch[i]),nextChord+i*0.15,L+2.5,i<2?'triangle':'sine',i<2?0.05:0.035,3,4,music);tone(hz(ch[i])*1.003,nextChord+i*0.15,L+2.5,'sine',0.02,3.5,4,music)}
    nextChord+=L}
  while(nextNote<now+1.5){
    noteI=Math.max(0,Math.min(SCALE.length-1,noteI+[-2,-1,-1,1,1,2][Math.floor(Math.random()*6)]));
    tone(hz(SCALE[noteI]),nextNote,1.8,'sine',0.06,0.03,1.5,music).connect(send);
    nextNote+=[0.9,1.35,1.8,2.7,3.6][Math.floor(Math.random()*5)]}}
function ready(){return c&&on&&c.state==='running'}
function click(t,g){var s=c.createBufferSource(),f=c.createBiquadFilter(),v=c.createGain();s.buffer=noise;f.type='bandpass';f.frequency.value=1700;f.Q.value=1.4;
  v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(0.0005,t+0.05);s.connect(f);f.connect(v);v.connect(sfx);s.start(t);s.stop(t+0.07)}
window.Snd={
  /* call from a tap or key press: browsers only allow sound after one */
  start:function(){if(!on||!AC)return;try{if(!c)build();if(c.state!=='running')c.resume()}catch(e){}},
  setOn:function(v){on=!!v;try{if(c){if(on)c.resume();else c.suspend()}}catch(e){}},
  clack:function(){if(!ready())return;var t=c.currentTime;if(t-lastClack<0.16)return;lastClack=t;click(t,0.07);click(t+0.09,0.05)},
  whistle:function(){if(!ready())return;var t=c.currentTime;if(t-lastWhistle<4)return;lastWhistle=t;
    [587.3,740].forEach(function(f){var o=c.createOscillator(),v=c.createGain(),lp=c.createBiquadFilter();o.type='triangle';lp.type='lowpass';lp.frequency.value=2200;
      o.frequency.setValueAtTime(f*0.97,t);o.frequency.linearRampToValueAtTime(f,t+0.08);
      v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(0.04,t+0.05);v.gain.setValueAtTime(0.04,t+0.32);v.gain.linearRampToValueAtTime(0,t+0.55);
      o.connect(lp);lp.connect(v);v.connect(sfx);v.connect(send);o.start(t);o.stop(t+0.6)})}
};
document.addEventListener('visibilitychange',function(){try{if(c){if(document.hidden)c.suspend();else if(on)c.resume()}}catch(e){}});
})();
