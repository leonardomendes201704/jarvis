/**
 * InicializaÃ§Ã£o: Iniciar/Parar, microfone, espectro, status, tela cheia
 */
(function () {
  var canvas = document.getElementById('spectrum-canvas');
  var micBtn = document.getElementById('mic-btn');
  var micStatus = document.getElementById('mic-status');
  var btnStart = document.getElementById('btn-start');
  var btnStop = document.getElementById('btn-stop');
  var btnOpenAi = document.getElementById('btn-openai');
  var openAiEnabled = true;
  var spectrumResponseEl = document.getElementById('spectrum-response');
  var responseAreaEl = document.getElementById('response-area');
  var pendingController = null;
  var sessionId = null;
  var wasSpeechActive = false;
  var youtubePlayer = document.getElementById('yt-player');
  var playerModal = document.getElementById('player-modal');
  var playerClose = document.getElementById('player-close');
  var playerUnmute = document.getElementById('player-unmute');
  var spectrumLeft = document.getElementById('modal-spectrum-left');
  var spectrumRight = document.getElementById('modal-spectrum-right');
  var spectrumAnimId = null;
  var routeModal = document.getElementById('route-modal');
  var routeClose = document.getElementById('route-close');
  var routeMapEl = document.getElementById('route-map');
  var routeSummaryEl = document.getElementById('route-summary');
  var routeMap = null;
  var routeLayer = null;
  var routeMarkers = [];
  var routeOriginEl = document.getElementById('route-origin');
  var routeDestinationEl = document.getElementById('route-destination');
  var routeTimeEl = document.getElementById('route-time');
  var routeSpinner = document.getElementById('route-spinner');
  var imageModal = document.getElementById('image-modal');
  var imageClose = document.getElementById('image-close');
  var imageTrack = document.getElementById('image-track');
  var imageSpinner = document.getElementById('image-spinner');
  var imageQueryEl = document.getElementById('image-query');
  var imageAttribution = document.getElementById('image-attribution');
  var imageItems = [];
  var imageSwiper = null;
  var agendaModal = document.getElementById('agenda-modal');
  var agendaClose = document.getElementById('agenda-close');
  var agendaGrid = document.getElementById('agenda-grid');
  var agendaModeEl = document.getElementById('agenda-mode');
  var agendaFlow = { active: false, step: 'idle', when: '', start: '', end: '', title: '' };
  var recipeOpenBtn = document.getElementById('recipe-open-btn');
  var lastRecipeUrl = '';
  var recipeModal = document.getElementById('recipe-modal');
  var recipeClose = document.getElementById('recipe-close');
  var recipeIframe = document.getElementById('recipe-iframe');
  var noiseToleranceSlider = document.getElementById('noise-tolerance');
  var noiseToleranceValue = document.getElementById('noise-tolerance-value');
  var voiceRateSlider = document.getElementById('voice-rate');
  var voiceRateValue = document.getElementById('voice-rate-value');
  var voicePitchSlider = document.getElementById('voice-pitch');
  var voicePitchValue = document.getElementById('voice-pitch-value');
  var voiceVolumeSlider = document.getElementById('voice-volume');
  var voiceVolumeValue = document.getElementById('voice-volume-value');
  if (micStatus) micStatus.textContent = 'Pronto. Clique em Iniciar.';
  try {
    var saved = localStorage.getItem('jarvis_openai_enabled');
    if (saved !== null) openAiEnabled = saved === 'true';
    else openAiEnabled = true;
  } catch (e) { openAiEnabled = true; }
  if (btnOpenAi) {
    btnOpenAi.textContent = 'OpenAI: ' + (openAiEnabled ? 'ON' : 'OFF');
    btnOpenAi.classList.toggle('off', !openAiEnabled);
  }

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
    if (handleAgendaFlow(text)) return;
    if (handleCloseCommand(text)) return;
    if (handleAddEventCommand(text)) return;
    if (handleAgendaCommand(text)) return;
    if (handleImagesCommand(text)) return;
    if (handleRouteCommand(text)) return;
    if (handleRecipeCommand(text)) return;
    if (handlePlayerCommand(text)) return;
    if (!handleVoiceCommand(text)) {
      if (openAiEnabled) requestAssistantResponse(text);
      else {
        setResponseText('OpenAI desativada.');
      }
    }
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
  if (btnOpenAi) {
    btnOpenAi.addEventListener('click', function () {
      openAiEnabled = !openAiEnabled;
      btnOpenAi.textContent = 'OpenAI: ' + (openAiEnabled ? 'ON' : 'OFF');
      btnOpenAi.classList.toggle('off', !openAiEnabled);
      try { localStorage.setItem('jarvis_openai_enabled', String(openAiEnabled)); } catch (e) {}
    });
  }
  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (window.AudioModule && window.AudioModule.isActive()) stop();
      else start();
    });
  }

  function handleVoiceCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    console.log('[route] normalized:', normalized);
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
    console.log('[route] normalized:', normalized);
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

  function handleCloseCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    if (normalized !== 'fechar' && normalized !== 'fechar tudo') return false;
    if (imageModal && imageModal.classList.contains('active')) closeImageModal();
    if (routeModal && routeModal.classList.contains('active')) closeRouteModal();
    if (playerModal && playerModal.classList.contains('active')) closePlayerModal();
    if (recipeModal && recipeModal.classList.contains('active')) closeRecipeModal();
    if (agendaModal && agendaModal.classList.contains('active')) closeAgendaModal();
    setResponseText('Fechado.');
    if (window.TtsModule) window.TtsModule.speak('Fechado.');
    return true;
  }

  function handleAddEventCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    var hasTitulo = /t[?i]tulo/i.test(text);
    var hasTime = /(das\s+\d{1,2}|a[s?]\s+\d{1,2})/i.test(text);
    if (!normalized.startsWith('crie um compromisso') && !normalized.startsWith('criar um compromisso') && !normalized.startsWith('adicionar compromisso') && !normalized.startsWith('compromisso') && !normalized.startsWith('agendar') && !normalized.startsWith('marcar') && !(hasTitulo && hasTime)) return false;

    // Ex: crie um compromisso para sexta das 9h at? 10h com o titulo reuniao
    var titleMatch = text.match(/t[?i]tulo\s+"?([^"']+)"?/i);
    var title = titleMatch ? titleMatch[1].trim() : '';
    if (!title) {
      var ask = 'Qual o título do compromisso?';
      setResponseText(ask);
      if (window.TtsModule) window.TtsModule.speak(ask);
      return true;
    }

    var timeMatch = text.match(/das\s+([0-9]{1,2}(:[0-9]{2})?|[0-9]{1,2}h)\s+at[e?]\s+([0-9]{1,2}(:[0-9]{2})?|[0-9]{1,2}h)/i);
    if (!timeMatch) {
      timeMatch = text.match(/a[sà]\s+([0-9]{1,2})(:[0-9]{2})?\s+horas?/i);
      if (timeMatch) {
        timeMatch = [timeMatch[0], timeMatch[1], timeMatch[2] || ':00', String(Number(timeMatch[1]) + 1) + ':00'];
      }
    }
    if (!timeMatch) {
      var askTime = 'Qual o horário?';
      setResponseText(askTime);
      if (window.TtsModule) window.TtsModule.speak(askTime);
      return true;
    }

    var start = normalizeTime(timeMatch[1]);
    var end = normalizeTime(timeMatch[3]);
    var dayMatch = text.match(/para\s+([^\n]+?)(\s+das|\s+a[sà])/i);
    var when = dayMatch ? dayMatch[1].trim() : '';

    var data = getAgendaData();
    if (isDayOfWeek(when)) {
      var label = normalizeDayOfWeek(when) + ' ' + start + '-' + end;
      data.semana = data.semana || {};
      data.semana[label] = title;
    } else {
      var key = start;
      var suffix = when ? ' (' + when + ')' : '';
      data.dia = data.dia || {};
      data.dia[key] = title + suffix;
    }

    localStorage.setItem('jarvis_agenda_v1', JSON.stringify(data));
    console.log('[agenda] created:', { title: title, when: when, start: start, end: end });
    console.log('[agenda] data:', data);
    var ok = 'Compromisso criado: ' + title + ' ?s ' + start + '.';
    setResponseText(ok);
    if (window.TtsModule) window.TtsModule.speak(ok);
    return true;
  }

  function normalizeTime(raw) {
    var t = raw.toLowerCase().replace('h', '').trim();
    if (t.indexOf(':') === -1) t = t + ':00';
    var parts = t.split(':');
    var h = parts[0].padStart(2, '0');
    var m = (parts[1] || '00').padStart(2, '0');
    return h + ':' + m;
  }

  function normalizeText(text) {
    return (text || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  function isDayOfWeek(text) {
    var t = normalizeText(text);
    return /(segunda|terca|quarta|quinta|sexta|sabado|domingo)/i.test(t);
  }

  function normalizeDayOfWeek(text) {
    var map = {
      'segunda': 'Seg',
      'terca': 'Ter',
      'quarta': 'Qua',
      'quinta': 'Qui',
      'sexta': 'Sex',
      'sabado': 'S?b',
      'domingo': 'Dom'
    };
    var key = normalizeText(text);
    Object.keys(map).forEach(function (k) {
      if (key.includes(k)) key = k;
    });
    return map[key] || text;
  }

  function resetAgendaFlow() {
    agendaFlow = { active: false, step: 'idle', when: '', start: '', end: '', title: '' };
  }

  function handleAgendaFlow(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();

    if (!agendaFlow.active) {
      if (normalized.startsWith('criar compromisso') || normalized.startsWith('crie um compromisso')) {
        agendaFlow.active = true;
        agendaFlow.step = 'when';
        setResponseText('Para quando?');
        if (window.TtsModule) window.TtsModule.speak('Para quando?');
        return true;
      }
      return false;
    }

    if (agendaFlow.step === 'when') {
      agendaFlow.when = text.trim();
      agendaFlow.step = 'time';
      setResponseText('Que horas?');
      if (window.TtsModule) window.TtsModule.speak('Que horas?');
      return true;
    }

    if (agendaFlow.step === 'time') {
      var timeMatch = text.match(/([0-9]{1,2})(:[0-9]{2})?\s*horas?/i);
      if (!timeMatch) {
        setResponseText('N?o entendi o horario. Pode repetir?');
        if (window.TtsModule) window.TtsModule.speak('N?o entendi o hor?rio. Pode repetir?');
        return true;
      }
      var hour = timeMatch[1];
      var minute = timeMatch[2] ? timeMatch[2].replace(':','') : '00';
      var start = hour.padStart(2, '0') + ':' + minute.padStart(2, '0');
      agendaFlow.start = start;
      agendaFlow.end = String((Number(hour) + 1)).padStart(2, '0') + ':' + minute.padStart(2, '0');
      agendaFlow.step = 'title';
      setResponseText('Qual o titulo do compromisso?');
      if (window.TtsModule) window.TtsModule.speak('Qual o titulo do compromisso?');
      return true;
    }

    if (agendaFlow.step === 'title') {
      agendaFlow.title = text.trim();
      agendaFlow.step = 'confirm';
      var msg = 'Compromisso criado para ' + agendaFlow.when + ' as ' + agendaFlow.start + ' para ' + agendaFlow.title + '. Confirma?';
      setResponseText(msg);
      if (window.TtsModule) window.TtsModule.speak(msg);
      return true;
    }

    if (agendaFlow.step === 'confirm') {
      if (normalized === 'sim' || normalized === 'confirmo' || normalized === 'ok') {
        var data = getAgendaData();
        if (isDayOfWeek(agendaFlow.when)) {
          var label = normalizeDayOfWeek(agendaFlow.when) + ' ' + agendaFlow.start + '-' + agendaFlow.end;
          data.semana = data.semana || {};
          data.semana[label] = agendaFlow.title;
        } else {
          var key = agendaFlow.start;
          var suffix = agendaFlow.when ? ' (' + agendaFlow.when + ')' : '';
          data.dia = data.dia || {};
          data.dia[key] = agendaFlow.title + suffix;
        }
        localStorage.setItem('jarvis_agenda_v1', JSON.stringify(data));
        setResponseText('Compromisso salvo.');
        if (window.TtsModule) window.TtsModule.speak('Compromisso salvo.');
        resetAgendaFlow();
        return true;
      }
      if (normalized === 'n?o' || normalized === 'nao' || normalized === 'cancelar') {
        setResponseText('Compromisso cancelado.');
        if (window.TtsModule) window.TtsModule.speak('Compromisso cancelado.');
        resetAgendaFlow();
        return true;
      }
      setResponseText('Responda sim ou n?o.');
      if (window.TtsModule) window.TtsModule.speak('Responda sim ou nao.');
      return true;
    }

    return false;
  }


  function handleAgendaCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    if (normalized.includes('agenda do dia') || normalized.includes('agenda da dia') || normalized.includes('agenda de hoje') || normalized.includes('agenda do dia')) {
      openAgendaModal('dia');
      return true;
    }
    if (normalized.includes('agenda da semana') || normalized.includes('agenda semanal')) {
      openAgendaModal('semana');
      return true;
    }
    if (normalized.startsWith('me mostre a agenda')) {
      openAgendaModal('dia');
      return true;
    }
    return false;
  }

  function handleImagesCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    var patterns = ['mostrar imagens de', 'mostrar imagens da', 'mostrar imagens do', 'imagens de', 'imagens da', 'imagens do'];
    var matched = patterns.find(function (p) { return normalized.startsWith(p); });
    if (!matched) return false;
    var query = text.slice(matched.length).trim();
    if (!query) {
      var ask = 'De que tema voc? quer imagens?';
      setResponseText(ask);
      if (window.TtsModule) window.TtsModule.speak(ask);
      return true;
    }
    openImageModal(query);
    return true;
  }

  function handleRouteCommand(text) {
    console.log('[route] raw:', text);
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    console.log('[route] normalized:', normalized);
    if (!normalized.startsWith('rota')) return false;
    var cleaned = normalized.replace(/^rota\s+/, '').replace(/^(de|da|do)\s+/, '');
    var cleanedNoAccents = cleaned.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    console.log('[route] cleaned:', cleanedNoAccents);
    var sep = cleanedNoAccents.indexOf(' para ');
    if (sep === -1) sep = cleanedNoAccents.indexOf(' ate ');
    if (sep === -1) {
      var ask = 'Diga: rota de origem para destino.';
      setResponseText(ask);
      if (window.TtsModule) window.TtsModule.speak(ask);
      return true;
    }
    var origin = cleanedNoAccents.slice(0, sep).trim();
    var destination = cleanedNoAccents.slice(sep + 5).trim();
    destination = destination.replace(/^(o|a|os|as)\s+/, '');
    console.log('[route] origin:', origin, 'destination:', destination);
    if (!origin || !destination) return true;
    parseRouteWithAI(origin, destination);
    return true;
  }

  function handleRecipeCommand(text) {
    if (!text) return false;
    var normalized = text.toLowerCase().trim();
    console.log('[route] normalized:', normalized);
    var patterns = ['buscar receita', 'abrir receita', 'receita de', 'procurar receita'];
    var matched = patterns.find(function (p) { return normalized.startsWith(p); });
    if (!matched) return false;
    var query = text.slice(matched.length).trim();
    if (!query) {
      var ask = 'Qual receita voc? quer buscar?';
      setResponseText(ask);
      if (window.TtsModule) window.TtsModule.speak(ask);
      return true;
    }
    openRecipeSearch(query);
    var reply = 'Abrindo receita de ' + query + '.';
    setResponseText(reply);
    if (window.TtsModule) window.TtsModule.speak(reply);
    return true;
  }

  function openRecipeSearch(query) {
    var url = 'https://receitas.globo.com/busca/?q=' + encodeURIComponent(query);
    lastRecipeUrl = url;
    if (recipeOpenBtn) recipeOpenBtn.hidden = false;
    try {
      window.open(url, '_blank', 'noopener');
    } catch (e) {}
  }

  function closeRecipeModal() {
    if (!recipeModal) return;
    recipeModal.classList.remove('active');
    recipeModal.setAttribute('aria-hidden', 'true');
    if (recipeIframe) recipeIframe.src = '';
  }

  if (recipeClose) {
    recipeClose.addEventListener('click', closeRecipeModal);
  }

  if (recipeModal) {
    recipeModal.addEventListener('click', function (event) {
      if (event.target === recipeModal) closeRecipeModal();
    });
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
    startModalSpectrum();
  }

  function closePlayerModal() {
    if (!playerModal) return;
    playerModal.classList.remove('active');
    playerModal.setAttribute('aria-hidden', 'true');
    if (youtubePlayer) youtubePlayer.src = '';
    stopModalSpectrum();
    if (window.AudioModule && window.AudioModule.isActive()) setStatus('Ouvindo...');
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

  if (recipeOpenBtn) {
    recipeOpenBtn.addEventListener('click', function () {
      if (!lastRecipeUrl) return;
      window.open(lastRecipeUrl, '_blank', 'noopener');
    });
  }

  function parseRouteWithAI(origin, destination) {
    var raw = 'rota de ' + origin + ' para ' + destination;
    fetch('/api/parse-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: raw })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Falha ao interpretar a rota.');
        return res.json();
      })
      .then(function (data) {
        var start = data.origin || origin;
        var end = data.destination || destination;
        if (data.city && data.state) {
          start = start + ', ' + data.city + ', ' + data.state;
          end = end + ', ' + data.city + ', ' + data.state;
        } else if (data.city) {
          start = start + ', ' + data.city;
          end = end + ', ' + data.city;
        }
        openRouteModal(start, end);
      })
      .catch(function () {
        openRouteModal(origin, destination);
      });
  }

  function openRouteModal(origin, destination) {
    if (!routeModal || !routeMapEl) return;
    routeModal.classList.add('active');
    routeModal.setAttribute('aria-hidden', 'false');
    if (routeSummaryEl) routeSummaryEl.textContent = 'Buscando rota...';
    if (routeSpinner) routeSpinner.classList.add('active');
    if (routeOriginEl) routeOriginEl.textContent = origin;
    if (routeDestinationEl) routeDestinationEl.textContent = destination;
    if (routeTimeEl) routeTimeEl.textContent = '...';
    if (!routeMap && window.L) {
      routeMap = L.map(routeMapEl, { zoomControl: false, attributionControl: false });
      // Sem tiles: visual "neon" apenas com a rota.
      routeMapEl.classList.add('route-map--neon');
    }
    var routeUrl = '/api/route?start=' + encodeURIComponent(origin) + '&end=' + encodeURIComponent(destination);
    console.log('[route] fetch:', routeUrl);
    fetch(routeUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Falha ao buscar rota.');
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.geometry) throw new Error('Rota indispon?vel.');
        var coords = data.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
        if (routeLayer) { routeMap.removeLayer(routeLayer); }
        routeMarkers.forEach(function (m) { routeMap.removeLayer(m); });
        routeMarkers = [];
        routeLayer = L.polyline(coords, { color: '#00d4ff', weight: 5, opacity: 0.95 });
        routeLayer.addTo(routeMap);
        var startMarker = L.circleMarker(coords[0], { radius: 6, color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 1 }).bindTooltip('In?cio', { permanent: true, direction: 'top', className: 'route-pin-label' });
        var endMarker = L.circleMarker(coords[coords.length - 1], { radius: 6, color: '#00d4ff', fillColor: '#0099cc', fillOpacity: 1 }).bindTooltip('Fim', { permanent: true, direction: 'top', className: 'route-pin-label' });
        startMarker.addTo(routeMap);
        endMarker.addTo(routeMap);
        routeMarkers.push(startMarker, endMarker);
        routeMap.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
        if (routeSummaryEl) {
          var minutes = data.duration ? Math.round(data.duration / 60) : null;
          var km = data.distance ? Math.round(data.distance / 100) / 10 : null;
          var summary = minutes ? ('Tempo estimado: ' + minutes + ' min' + (km ? (', ' + km + ' km') : '') + '.') : 'Rota pronta.';
          routeSummaryEl.textContent = summary;
          if (routeTimeEl) routeTimeEl.textContent = minutes ? (minutes + ' min') : '?';
          if (routeSpinner) routeSpinner.classList.remove('active');
          if (window.TtsModule) window.TtsModule.speak(summary);
        }
      })
      .catch(function (err) {
        if (routeSummaryEl) routeSummaryEl.textContent = 'N?o consegui carregar a rota.';
        if (routeSpinner) routeSpinner.classList.remove('active');
        if (window.TtsModule) window.TtsModule.speak('N?o consegui carregar a rota.');
        console.error(err);
      });
  }

  function closeRouteModal() {
    if (!routeModal) return;
    routeModal.classList.remove('active');
    routeModal.setAttribute('aria-hidden', 'true');
    if (routeSummaryEl) routeSummaryEl.textContent = 'Aguardando rota...';
    if (routeOriginEl) routeOriginEl.textContent = '-';
    if (routeDestinationEl) routeDestinationEl.textContent = '-';
    if (routeTimeEl) routeTimeEl.textContent = '-';
    if (routeSpinner) routeSpinner.classList.remove('active');
    if (routeLayer && routeMap) {
      routeMap.removeLayer(routeLayer);
      routeLayer = null;
    }
    routeMarkers.forEach(function (m) { if (routeMap) routeMap.removeLayer(m); });
    routeMarkers = [];
  }

  if (routeClose) {
    routeClose.addEventListener('click', closeRouteModal);
  }

  if (routeModal) {
    routeModal.addEventListener('click', function (event) {
      if (event.target === routeModal) closeRouteModal();
    });
  }

  function openImageModal(query) {
    if (!imageModal || !imageTrack) return;
    console.log('[images] track ok');
    imageModal.classList.add('active');
    imageModal.classList.add('image-fullscreen');
    document.body.classList.add('image-fullscreen');
    imageModal.setAttribute('aria-hidden', 'false');
    if (imageQueryEl) imageQueryEl.textContent = 'Imagens de: ' + query;
    var speakText = 'Mostrando imagens de ' + query + '.';
    setResponseText(speakText);
    if (window.TtsModule) window.TtsModule.speak(speakText);
    if (imageSpinner) imageSpinner.classList.add('active');
    imageTrack.innerHTML = '';
    var swiperEl = document.querySelector('.image-swiper');
    if (swiperEl) swiperEl.style.display = 'block';
    imageItems = [];
    if (imageAttribution) imageAttribution.textContent = '';
    console.log('[images] query:', query);
    fetch('/api/images?q=' + encodeURIComponent(query))
      .then(function (res) {
        if (!res.ok) throw new Error('Falha ao buscar imagens.');
        return res.json();
      })
      .then(function (data) {
        imageItems = data.photos || [];
        console.log('[images] count:', imageItems.length);
        console.log('[images] urls:', imageItems.map(function (p) { return p.src && p.src.large ? p.src.large : p.src && p.src.original ? p.src.original : ''; }));
        while (imageItems.length && imageItems.length < 8) {
          imageItems = imageItems.concat(imageItems);
        }
        if (!imageItems.length) throw new Error('Sem imagens.');
        renderImageSlides();
        if (imageSpinner) imageSpinner.classList.remove('active');
        startImageAutoplay();
      })
      .catch(function () {
        if (imageSpinner) imageSpinner.classList.remove('active');
      });
  }

  function waitForImages(images) {
    return Promise.all(images.map(function (img) {
      return new Promise(function (resolve) {
        if (img.complete) return resolve();
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }

  function renderImageSlides() {
    console.log('[images] render slides');
    if (!imageTrack) return;
    imageTrack.innerHTML = '';
    var swiperEl = document.querySelector('.image-swiper');
    if (swiperEl) swiperEl.style.display = 'block';
    var imgs = [];
    imageItems.forEach(function (item) {
      var slide = document.createElement('div');
      slide.className = 'swiper-slide';
      var img = document.createElement('img');
      img.src = item.src && item.src.large ? item.src.large : item.src && item.src.original ? item.src.original : '';
      img.alt = item.photographer || 'Imagem';
      slide.appendChild(img);
      imageTrack.appendChild(slide);
      imgs.push(img);
    });

    if (imageSwiper) {
      imageSwiper.destroy(true, true);
      imageSwiper = null;
    }

    waitForImages(imgs).then(function () {
      if (imageSpinner) imageSpinner.classList.remove('active');
      imageSwiper = new Swiper('.image-swiper', {
        effect: 'coverflow',
        centeredSlides: true,
        slidesPerView: 3,
        loop: false,
        grabCursor: true,
        autoplay: imageItems.length >= 2 ? { delay: 2200, disableOnInteraction: false } : false,
        coverflowEffect: { rotate: 0, stretch: 0, depth: 260, modifier: 1.4, slideShadows: false },
        on: {
          slideChange: function () {
            var idx = this.realIndex;
            var item = imageItems[idx];
            if (imageAttribution && item) {
              imageAttribution.textContent = 'Foto: ' + (item.photographer || 'Pexels') + ' · Pexels';
            }
          }
        }
      });
    });
  }

  function closeImageModal() {
    if (!imageModal) return;
    imageModal.classList.remove('active');
    imageModal.classList.remove('image-fullscreen');
    document.body.classList.remove('image-fullscreen');
    imageModal.setAttribute('aria-hidden', 'true');
    if (imageTrack) imageTrack.innerHTML = '';
    if (imageSpinner) imageSpinner.classList.remove('active');
    if (imageAttribution) imageAttribution.textContent = '';
    if (imageSwiper) { imageSwiper.destroy(true, true); imageSwiper = null; }
  }

  if (imageClose) imageClose.addEventListener('click', closeImageModal);
  if (imageModal) {
    imageModal.addEventListener('click', function (event) {
      if (event.target === imageModal) closeImageModal();
    });
  }

  function seedAgendaData() {
    var key = 'jarvis_agenda_v1';
    if (localStorage.getItem(key)) return;
    var data = {
      dia: {
        '07:00': 'Caf? da manh?',
        '09:30': 'Reuni?o com equipe',
        '12:00': 'Almo?o',
        '15:00': 'Revisar projeto',
        '18:30': 'Academia'
      },
      semana: {
        'Seg 09:00': 'Planejamento semanal',
        'Ter 14:00': 'Call com cliente',
        'Qua 11:00': 'Revis?o de design',
        'Qui 16:00': 'Sprint review',
        'Sex 10:00': 'Relat?rio semanal'
      }
    };
    localStorage.setItem(key, JSON.stringify(data));
  }

  function getAgendaData() {
    seedAgendaData();
    var key = 'jarvis_agenda_v1';
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (e) {
      return {};
    }
  }

  function openAgendaModal(mode) {
    if (!agendaModal || !agendaGrid) return;
    agendaModal.classList.add('active');
    agendaModal.setAttribute('aria-hidden', 'false');
    if (agendaModeEl) agendaModeEl.textContent = mode === 'semana' ? 'Semana' : 'Dia';
    renderAgenda(mode);
    var speakText = mode === 'semana' ? 'Mostrando a agenda da semana.' : 'Mostrando a agenda do dia.';
    setResponseText(speakText);
    if (window.TtsModule) window.TtsModule.speak(speakText);
  }

  function renderAgenda(mode) {
    if (!agendaGrid) return;
    agendaGrid.innerHTML = '';
    var data = getAgendaData();
    if (mode === 'semana') {
      var week = data.semana || {};
      Object.keys(week).sort().forEach(function (time) {
        agendaGrid.appendChild(makeAgendaRow(time, week[time]));
      });
      return;
    }
    var day = data.dia || {};
    for (var h = 6; h <= 22; h++) {
      var label = (h < 10 ? '0' + h : h) + ':00';
      var event = day[label] || '';
      agendaGrid.appendChild(makeAgendaRow(label, event));
    }
  }

  function makeAgendaRow(time, eventText) {
    var row = document.createElement('div');
    row.className = 'agenda-row';
    var timeEl = document.createElement('div');
    timeEl.className = 'agenda-time';
    timeEl.textContent = time;
    var eventEl = document.createElement('div');
    eventEl.className = 'agenda-event' + (eventText ? '' : ' muted');
    eventEl.textContent = eventText || 'Livre';
    row.appendChild(timeEl);
    row.appendChild(eventEl);
    return row;
  }

  function closeAgendaModal() {
    if (!agendaModal) return;
    agendaModal.classList.remove('active');
    agendaModal.setAttribute('aria-hidden', 'true');
    if (agendaGrid) agendaGrid.innerHTML = '';
  }

  if (agendaClose) agendaClose.addEventListener('click', closeAgendaModal);
  if (agendaModal) {
    agendaModal.addEventListener('click', function (event) {
      if (event.target === agendaModal) closeAgendaModal();
    });
  }

  function drawSpectrum(canvas, seed) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var bars = 24;
    var barWidth = Math.max(2, Math.floor(w / bars) - 4);
    var t = Date.now() / 300 + seed;
    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 10;
    for (var i = 0; i < bars; i++) {
      var wave = Math.abs(Math.sin(t + i * 0.6));
      var height = Math.max(6, wave * (h * 0.5));
      var x = i * (barWidth + 2);
      var y = (h - height) / 2;
      ctx.fillRect(x, y, barWidth, height);
    }
    ctx.shadowBlur = 0;
  }

  function animateModalSpectrum() {
    drawSpectrum(spectrumLeft, 0.0);
    drawSpectrum(spectrumRight, 1.7);
    spectrumAnimId = requestAnimationFrame(animateModalSpectrum);
  }

  function startModalSpectrum() {
    if (spectrumAnimId) return;
    animateModalSpectrum();
  }

  function stopModalSpectrum() {
    if (spectrumAnimId) {
      cancelAnimationFrame(spectrumAnimId);
      spectrumAnimId = null;
    }
  }
})();
