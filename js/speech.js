/**
 * Web Speech API: transcriÃ§Ã£o de fala em tempo real para "VocÃª disse"
 */
(function (global) {
  var recognition = null;
  var transcriptionEl = null;
  var isRunning = false;

  function getTranscriptionEl() {
    if (!transcriptionEl) transcriptionEl = document.getElementById('transcription-area');
    return transcriptionEl;
  }

  function setTranscriptionText(text, isInterim) {
    var el = getTranscriptionEl();
    if (!el) return;
    if (!text || !text.trim()) {
      el.innerHTML = '<span class="placeholder">A transcriÃ§Ã£o aparecerÃ¡ aqui...</span>';
      return;
    }
    el.textContent = text;
    if (isInterim) el.classList.add('interim');
    else el.classList.remove('interim');
  }

  function clearTranscription() {
    setTranscriptionText('', false);
    var el = getTranscriptionEl();
    if (el) el.innerHTML = '<span class="placeholder">A transcriÃ§Ã£o aparecerÃ¡ aqui...</span>';
  }

  function start() {
    var SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API nÃ£o suportada neste navegador.');
      return false;
    }

    if (isRunning) return true;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';

    recognition.onstart = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-start'));
    };

    recognition.onaudiostart = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-audio-start'));
    };

    recognition.onaudioend = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-audio-end'));
    };

    recognition.onspeechstart = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-speech-start'));
    };

    recognition.onspeechend = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-speech-end'));
    };

    recognition.onresult = function (event) {
      var last = event.results[event.results.length - 1];
      var transcript = last[0].transcript;
      var isFinal = last.isFinal;
      setTranscriptionText(transcript.trim(), !isFinal);
      if (isFinal && transcript.trim()) {
        document.dispatchEvent(new CustomEvent('jarvis-transcription-final', { detail: { text: transcript.trim() } }));
      }
    };

    recognition.onerror = function (event) {
      if (event.error === 'no-speech') return;
      if (event.error === 'aborted') return;
      console.error('SpeechRecognition error:', event.error);
      document.dispatchEvent(new CustomEvent('jarvis-speech-error', { detail: { error: event.error } }));
    };

    recognition.onend = function () {
      document.dispatchEvent(new CustomEvent('jarvis-speech-end'));
      if (isRunning) {
        // Pequeno atraso evita loop agressivo quando o reconhecimento reinicia.
        setTimeout(function () {
          if (isRunning && recognition) recognition.start();
        }, 500);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('SpeechRecognition start failed:', err);
      document.dispatchEvent(new CustomEvent('jarvis-speech-error', { detail: { error: 'start-failed' } }));
      return false;
    }
    isRunning = true;
    return true;
  }

  function stop() {
    isRunning = false;
    if (recognition) {
      try {
        recognition.stop();
        recognition.abort();
      } catch (e) {}
      recognition = null;
    }
    clearTranscription();
  }

  function isActive() {
    return isRunning && recognition !== null;
  }

  global.SpeechModule = {
    start: start,
    stop: stop,
    isActive: isActive,
    clearTranscription: clearTranscription,
    setTranscriptionText: setTranscriptionText
  };
})(this);
