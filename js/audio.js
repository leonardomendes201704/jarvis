/**
 * Web Audio: microfone, AnalyserNode, dados do espectro
 */
(function (global) {
  var audioContext = null;
  var source = null;
  var analyser = null;
  var stream = null;
  var frequencyData = null;

  function getAnalyser() {
    return analyser;
  }

  function getFrequencyData() {
    if (!analyser || !frequencyData) return null;
    analyser.getByteFrequencyData(frequencyData);
    return frequencyData;
  }

  function isActive() {
    return stream !== null && stream.active;
  }

  function start() {
    if (stream) return Promise.resolve();

    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (mediaStream) {
        stream = mediaStream;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        source.connect(analyser);
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        return true;
      });
  }

  function stop() {
    if (!stream) return;
    stream.getTracks().forEach(function (track) {
      track.stop();
    });
    stream = null;
    if (source) {
      try {
        source.disconnect();
      } catch (e) {}
      source = null;
    }
    analyser = null;
    frequencyData = null;
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
    }
    audioContext = null;
  }

  global.AudioModule = {
    start: start,
    stop: stop,
    isActive: isActive,
    getFrequencyData: getFrequencyData,
    getAnalyser: getAnalyser
  };
})(this);
