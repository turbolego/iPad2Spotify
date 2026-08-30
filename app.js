/* ES5/XHR only: compatible with Safari on iOS 9. */
(function () {
  'use strict';
  var current = null, timer;
  function id(name){return document.getElementById(name)}
  function message(text){id('message').innerHTML=text}
  function request(method,url,body,done){var x=new XMLHttpRequest();x.open(method,url,true);if(body)x.setRequestHeader('Content-Type','application/json');x.onreadystatechange=function(){if(x.readyState===4){var d={};try{d=JSON.parse(x.responseText||'{}')}catch(e){}done(x.status,d)}};x.send(body?JSON.stringify(body):null)}
  function showPlayer(){id('setup').className='card hidden';id('player').className='player';id('status').innerHTML='Connected';poll()}
  function pair(){var code=id('pairing-code').value.replace(/[^a-z0-9]/ig,'').toUpperCase();if(!code){message('Enter the code shown in Safari after Spotify login.');return}message('Pairing this fullscreen app…');request('POST','/api/auth/pair',{code:code},function(status,data){if(status===200){message('');showPlayer()}else message(data.error||'Pairing failed. Try a new code.')})}
  function login(){window.location.href='/api/auth/login'}
  function render(data){var item=data&&data.item;if(!item){id('title').innerHTML='Nothing playing';id('artist').innerHTML='Start Spotify on another device';id('album').innerHTML='';id('art').style.display='none';id('placeholder').className='';id('play').innerHTML='▶';current=null;return}current=data;id('title').innerHTML=item.name;id('artist').innerHTML=item.artists.map(function(a){return a.name}).join(', ');id('album').innerHTML=item.album.name;id('play').innerHTML=data.is_playing?'Ⅱ':'▶';if(item.album.images&&item.album.images.length){id('art').src=item.album.images[0].url;id('art').style.display='block';id('placeholder').className='hidden'}}
  function poll(){request('GET','/api/spotify/currently-playing',null,function(status,data){if(status===200)render(data);else if(status===401){id('status').innerHTML='Not connected';id('player-message').innerHTML=data.error||'Pair again.'}else id('player-message').innerHTML='Waiting for Spotify…'});if(timer)clearTimeout(timer);timer=setTimeout(poll,5000)}
  function command(action){request('POST','/api/spotify/command',{action:action},function(status,data){if(status!==200)id('player-message').innerHTML=data.error||'Command failed';setTimeout(poll,400)})}
  id('login').onclick=login;id('pair').onclick=pair;id('pairing-code').onkeyup=function(e){if(e&&e.keyCode===13)pair()};id('previous').onclick=function(){command('previous')};id('next').onclick=function(){command('next')};id('play').onclick=function(){command(current&&current.is_playing?'pause':'play')};id('disconnect').onclick=function(){location.reload()};
  request('GET','/api/spotify/currently-playing',null,function(status){if(status===200)showPlayer()});
}());
