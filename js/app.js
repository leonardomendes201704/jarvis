/**
 * InicializaÃ§Ã£o: Iniciar/Parar, microfone, espectro, status, tela cheia
 */
(function () {
  var canvas = document.getElementById('spectrum-canvas');
  var micBtn = document.getElementById('mic-btn');
  var micStatus = document.getElementById('mic-status');
  var btnStart = document.getElementById('btn-start');
  var btnStop = document.getElementById('btn-stop');
  var spectrumResponseEl = document.getElementById('spectrum-response');
  var responseAreaEl = document.getElementById('response-area');
  var pendingController = null;
  var sessionId = null;
  var wasSpeechActive = false;
  var youtubePlayer = document.getElementById('yt-player');
  var playerModal = document.getElementById('player-modal');
  var playerClose = document.getElementById('player-close');
  var playerUnmute = document.getElementById('player-unmute');
  var noiseToleranceSlider = document.getElementById('noise-tolerance');
  var noiseToleranceValue = document.getElementById('noise-tolerance-value');
  var voiceRateSlider = document.getElementById('voice-rate');
  var voiceRateValue = document.getElementById('voice-rate-value');
  var voicePitchSlider = document.getElementById('voice-pitch');
  var voicePitchValue = document.getElementById('voice-pitch-value');
  var voiceVolumeSlider = document.getElementById('voice-volume');
  var voiceVolumeValue = document.getElementById('voice-volume-value');
  if (micStatus) micStatus.textContent = 'Pronto. Clique em Iniciar.';

  function tryFullscreen() {
    if (document.fullscreenElement) return;
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  }

  document.addEventListener('click', function fullscreenOnFirstClick() {
    document.removeEventListener('click', fullscreenOnFirstClick);
    tryFullscreen();
  }, { once: true });

  function setResponseText(text) {
    if (!responseAreaEl) return;
    if (!text || !text.trim()) {
      responseAreaEl.innerHTML = '<span class="placeholder">A resposta do Jarvis aparecerÃ¡ aqui...</span>';
      return;
    }
    responseAreaEl.textContent = text;
  }

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = localStorage.getItem('jarvis_session_id') || '';
    } catch (e) {}
    return sessionId;
  }

  function setSessionId(id) {
    if (!id) return;
    sessionId = id;
    try {
      localStorage.setItem('jarvis_session_id', id);
    } catch (e) {}
  }

  function requestAssistantResponse(text) {
    if (pendingController) pendingController.abort();
    if (!text || !text.trim()) return;
    pendingController = new AbortController();
    setResponseText('Pensando...');
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, sessionId: getSessionId() }),
      signal: pendingController.signal
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (body) {
            throw new Error(body || 'Falha na resposta do servidor.');
          });
        }
        return res.json();
      })
      .then(function (data) {
        var responseText = (data && data.text) ? String(data.text) : '';
        if (data && data.sessionId) setSessionId(String(data.sessionId));
        setResponseText(responseText || 'Sem resposta.');
        if (responseText && window.TtsModule) window.TtsModule.speak(responseText);
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        var msg = err && err.message ? String(err.message) : 'Erro ao obter resposta.';
        setResponseText(msg);
        console.error(err);
      })
      .finally(function () {
        pendingController = null;
      });
  }

  document.addEventListener('jarvis-transcription-final', function (e) {
    var text = e.detail.text;
    if (spectrumResponseEl) spectrumResponseEl.textContent = 'Entendido: ' + text;
    if (handlePlayerCommand(text)) return;
    if (!handleVoiceCommand(text)) requestAssistantResponse(text);
  });

  document.addEventListener('jarvis-speech-start', function () {
    setStatus('Reconhecendo...');
  });

  document.addEventListener('jarvis-speech-audio-start', function () {
    setStatus('Microfone ativo.');
  });

  document.addEventListener('jarvis-speech-speech-start', function () {
    setStatus('Detectando fala...');
  });

  document.addEventListener('jarvis-speech-speech-end', function () {
    setStatus('Fala detectada. Processando...');
  });

  document.addEventListener('jarvis-speech-end', function () {
    if (window.AudioModule && window.AudioModule.isActive()) setStatus('Ouvindo...');
  });

  document.addEventListener('jarvis-speech-error', function (e) {
    var error = e && e.detail ? e.detail.error : 'unknown';
    setStatus('Erro no reconhecimento de voz: ' + error);
    setResponseText('Erro no reconhecimento de voz: ' + error);
  });

  document.addEventListener('jarvis-tts-start', function () {
    if (window.SpeechModule && window.SpeechModule.isActive()) {
      wasSpeechActive = true;
      window.SpeechModule.stop();
    } else {
      wasSpeechActive = false;
    }
  });

  document.addEventListener('jarvis-tts-end', function () {
    if (wasSpeechActive && window.SpeechModule) {
      window.SpeechModule.start();
    }
    wasSpeechActive = false;
  });

  function setStatus(text) {
    if (micStatus) micStatus.textContent = text;
  }

  function setListening(active) {
    if (micBtn) {
      if (active) micBtn.classList.add('active');
      else micBtn.classList.remove('active');
    }
    if (btnStart) btnStart.disabled = !!active;
    if (btnStop) btnStop.disabled = !active;
  }

  function start() {
    if (!window.AudioModule || !window.SpectrumModule) {
      setStatus('Erro: módulos de áudio não carregados.');
      setResponseText('Falha ao carregar scripts de áudio.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Erro: navegador sem getUserMedia.');
      setResponseText('Seu navegador não permite microfone via getUserMedia.');
      return;
    }
    setStatus('Iniciando microfone...');
    var permissionTimer = setTimeout(function () {
      setStatus('Aguardando permissão do microfone...');
      setResponseText('Verifique o ícone de microfone ao lado da URL e permita o acesso.');
    }, 2500);
    window.AudioModule.start()
      .then(function () {
        clearTimeout(permissionTimer);
        setStatus('Ouvindo...');
        setListening(true);
        window.SpectrumModule.start(canvas);
        if (window.SpeechModule) {
          var speechOk = window.SpeechModule.start();
          if (speechOk === false) {
            setStatus('Reconhecimento de voz nÃ£o suportado neste navegador.');
            setResponseText('Seu navegador nÃ£o suporta reconhecimento de voz.');
          }
        }
      })
      .catch(function (err) {
        clearTimeout(permissionTimer);
        setStatus('Erro: ' + (err.message || 'NÃ£o foi possÃ­vel acessar o microfone.'));
        setListening(false);
        console.error(err);
      });
  }

  function stop() {
    if (!window.AudioModule || !window.SpectrumModule) return;
    window.SpectrumModule.stop();
    if (window.SpeechModule) window.SpeechModule.stop();
    if (window.TtsModule) window.TtsModule.stop();
    window.AudioModule.stop();
    if (spectrumResponseEl) spectrumResponseEl.textContent = '';
    setResponseText('');
    if (pendingController) pendingController.abort();
    setStatus('Parado. Clique em Iniciar para continuar.');
    setListening(false);
  }

  if (noiseToleranceSlider && noiseToleranceValue && window.SpectrumModule) {
    noiseToleranceSlider.addEventListener('input', function () {
      var val = noiseToleranceSlider.value;
      noiseToleranceValue.textContent = val;
      window.SpectrumModule.setNoiseFloor(parseInt(val, 10));
    });
  }

  function loadVoiceSetting(key, fallback) {
    try {
      var val = localStorage.getItem(key);
      return val !== null ? Number(val) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveVoiceSetting(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (e) {}
  }

  if (voiceRateSlider && voiceRateValue) {
    var rate = loadVoiceSetting('jarvis_tts_rate', Number(voiceRateSlider.value));
    voiceRateSlider.value = String(rate);
    voiceRateValue.textContent = String(rate);
    voiceRateSlider.addEventListener('input', function () {
      var val = Number(voiceRateSlider.value);
      voiceRateValue.textContent = String(val);
      saveVoiceSetting('jarvis_tts_rate', val);
    });
  }

  if (voicePitchSlider && voicePitchValue) {
    var pitch = loadVoiceSetting('jarvis_tts_pitch', Number(voicePitchSlider.value));
    voicePitchSlider.value = String(pitch);
    voicePitchValue.textContent = String(pitch);
    voicePitchSlider.addEventListener('input', function () {
      var val = Number(voicePitchSlider.value);
      voicePitchValue.textContent = String(val);
      saveVoiceSetting('jarvis_tts_pitch', val);
    });
  }

  if (voiceVolumeSlider && voiceVolumeValue) {
    var volume = loadVoiceSetting('jarvis_tts_volume', Number(voiceVolumeSlider.value));
    voiceVolumeSlider.value = String(volume);
    voiceVolumeValue.textContent = String(volume);
    voiceVolumeSlider.addEventListener('input', function () {
      var val = Number(voiceVolumeSlider.value);
      voiceVolumeValue.textContent = String(val);
      saveVoiceSetting('jarvis_tts_volume', val);
    });
  }

  if (btnStart) btnStart.addEventListener('click', start);
  if (btnStop) btnStop.addEventListener('click', stop);
  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (window.AudioModule && window.AudioModule.isActive()) stop();
      else start();
    });
  }

  function handleVoiceCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    var patterns = ['abrir video', 'abrir vídeo', 'tocar video', 'tocar vídeo', 'reproduzir video', 'reproduzir vídeo'];
    var matched = patterns.find(function (p) { return normalized.startsWith(p); });
    if (!matched) return false;
    var query = text.slice(matched.length).trim();
    if (!query) {
      setResponseText('Qual vídeo você quer abrir?');
      if (window.TtsModule) window.TtsModule.speak('Qual vídeo você quer abrir?');
      return true;
    }
    openYoutubeSearch(query);
    var reply = 'Abrindo vídeo: ' + query;
    setResponseText(reply);
    if (window.TtsModule) window.TtsModule.speak(reply);
    return true;
  }

  function handlePlayerCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    if (normalized === 'ativar som' || normalized === 'ligar som' || normalized === 'desmutar') {
      unmutePlayer();
      var reply = 'Som ativado.';
      setResponseText(reply);
      if (window.TtsModule) window.TtsModule.speak(reply);
      return true;
    }
    if (normalized === 'fechar vídeo' || normalized === 'fechar video') {
      closePlayerModal();
      var replyClose = 'Player fechado.';
      setResponseText(replyClose);
      if (window.TtsModule) window.TtsModule.speak(replyClose);
      return true;
    }
    return false;
  }

  function openYoutubeSearch(query) {
    if (!youtubePlayer) return;
    fetch('/api/youtube-search?q=' + encodeURIComponent(query))
      .then(function (res) {
        if (!res.ok) throw new Error('Falha ao buscar vídeo.');
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.videoId) throw new Error('Nenhum vídeo embutível encontrado.');
        youtubePlayer.src = 'https://www.youtube.com/embed/' + data.videoId + '?autoplay=1&mute=1&enablejsapi=1';
        openPlayerModal();
        pauseListening();
        var notice = 'Para ouvir o áudio do vídeo, clique em ativar som.';
        setResponseText(notice);
        if (window.TtsModule) window.TtsModule.speak(notice);
      })
      .catch(function (err) {
        setResponseText('Não consegui abrir um vídeo embutível.');
        if (window.TtsModule) window.TtsModule.speak('Não consegui abrir um vídeo embutível.');
        console.error(err);
      });
  }

  function openPlayerModal() {
    if (!playerModal) return;
    playerModal.classList.add('active');
    playerModal.setAttribute('aria-hidden', 'false');
  }

  function closePlayerModal() {
    if (!playerModal) return;
    playerModal.classList.remove('active');
    playerModal.setAttribute('aria-hidden', 'true');
    if (youtubePlayer) youtubePlayer.src = '';
    resumeListening();
  }

  if (playerClose) {
    playerClose.addEventListener('click', closePlayerModal);
  }

  function unmutePlayer() {
    if (!youtubePlayer || !youtubePlayer.contentWindow) return;
    try {
      youtubePlayer.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'unMute', args: [] }),
        '*'
      );
      youtubePlayer.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      );
    } catch (e) {}
  }

  function pauseListening() {
    if (window.SpeechModule && window.SpeechModule.isActive()) {
      window.SpeechModule.stop();
      wasSpeechActive = true;
    }
  }

  function resumeListening() {
    if (wasSpeechActive && window.SpeechModule) {
      window.SpeechModule.start();
      wasSpeechActive = false;
    }
  }

  if (playerUnmute) {
    playerUnmute.addEventListener('click', function () {
      unmutePlayer();
    });
  }

  if (playerModal) {
    playerModal.addEventListener('click', function (event) {
      if (event.target === playerModal) closePlayerModal();
    });
  }
})();
