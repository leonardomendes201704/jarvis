/**
 * Web Speech Synthesis: fala em pt-BR usando SpeechSynthesis
 */
(function (global) {
  var currentUtterance = null;
  var voice = null;
  var isReady = false;

  function pickVoice() {
    var voices = global.speechSynthesis ? global.speechSynthesis.getVoices() : [];
    if (!voices || !voices.length) return null;
    var pt = voices.find(function (v) { return v.lang && v.lang.toLowerCase().startsWith('pt'); });
    return pt || voices[0];
  }

  function ensureVoice() {
    if (voice) return voice;
    voice = pickVoice();
    if (voice) isReady = true;
    return voice;
  }

  function getSettings() {
    try {
      return {
        rate: Number(localStorage.getItem('jarvis_tts_rate')) || 1.0,
        pitch: Number(localStorage.getItem('jarvis_tts_pitch')) || 1.0,
        volume: Number(localStorage.getItem('jarvis_tts_volume')) || 1.0
      };
    } catch (e) {
      return { rate: 1.0, pitch: 1.0, volume: 1.0 };
    }
  }

  function speak(text) {
    if (!text || !text.trim()) return false;
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
      console.warn('SpeechSynthesis não suportado neste navegador.');
      return false;
    }
    ensureVoice();
    if (global.speechSynthesis.speaking || global.speechSynthesis.pending) {
      global.speechSynthesis.cancel();
    }
    currentUtterance = new SpeechSynthesisUtterance(text.trim());
    var settings = getSettings();
    if (voice) currentUtterance.voice = voice;
    currentUtterance.lang = (voice && voice.lang) ? voice.lang : 'pt-BR';
    currentUtterance.rate = settings.rate;
    currentUtterance.pitch = settings.pitch;
    currentUtterance.volume = settings.volume;
    currentUtterance.onstart = function () {
      document.dispatchEvent(new CustomEvent('jarvis-tts-start'));
    };
    currentUtterance.onend = function () {
      document.dispatchEvent(new CustomEvent('jarvis-tts-end'));
    };
    currentUtterance.onerror = function () {
      document.dispatchEvent(new CustomEvent('jarvis-tts-error'));
    };

    if (!voice && !isReady) {
      // Em alguns browsers as vozes chegam assíncronas.
      setTimeout(function () {
        ensureVoice();
        var settings = getSettings();
        if (voice) currentUtterance.voice = voice;
        currentUtterance.rate = settings.rate;
        currentUtterance.pitch = settings.pitch;
        currentUtterance.volume = settings.volume;
        currentUtterance.onstart = function () {
          document.dispatchEvent(new CustomEvent('jarvis-tts-start'));
        };
        currentUtterance.onend = function () {
          document.dispatchEvent(new CustomEvent('jarvis-tts-end'));
        };
        currentUtterance.onerror = function () {
          document.dispatchEvent(new CustomEvent('jarvis-tts-error'));
        };
        global.speechSynthesis.speak(currentUtterance);
      }, 200);
      return true;
    }

    global.speechSynthesis.speak(currentUtterance);
    return true;
  }

  function stop() {
    if (!global.speechSynthesis) return;
    global.speechSynthesis.cancel();
    currentUtterance = null;
  }

  if (global.speechSynthesis) {
    global.speechSynthesis.onvoiceschanged = function () {
      voice = pickVoice();
      isReady = !!voice;
    };
  }

  global.TtsModule = {
    speak: speak,
    stop: stop,
    isReady: function () { return isReady; }
  };
})(this);
