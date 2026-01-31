/**
 * Desenho do espectro no canvas (onda simÃ©trica, estilo waveform)
 */
(function (global) {
  var animationId = null;
  var noiseFloor = 28;

  function getNoiseFloor() {
    return noiseFloor;
  }

  function setNoiseFloor(value) {
    noiseFloor = Math.max(0, Math.min(80, Number(value) || 0));
  }

  function draw(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!global.AudioModule || !global.AudioModule.isActive()) {
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    var data = global.AudioModule.getFrequencyData();
    if (!data) return;

    var width = canvas.width;
    var height = canvas.height;
    var centerY = height / 2;
    var barCount = Math.min(data.length, 128);
    var barThin = 2;
    var gap = 2;
    var totalWaveWidth = barCount * (barThin + gap) - gap;
    var offsetX = (width - totalWaveWidth) / 2;
    var maxAmp = height * 0.4;

    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 6;
    for (var i = 0; i < barCount; i++) {
      var value = Math.max(0, data[i] - noiseFloor);
      var halfBarHeight = (value / 255) * maxAmp;
      var x = offsetX + i * (barThin + gap);
      var topY = centerY - halfBarHeight;
      var barHeight = halfBarHeight * 2;
      ctx.fillRect(x, topY, barThin, barHeight);
    }
    ctx.shadowBlur = 0;

    animationId = requestAnimationFrame(function () {
      draw(canvas);
    });
  }

  function start(canvas) {
    stop();
    if (canvas) draw(canvas);
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  global.SpectrumModule = {
    start: start,
    stop: stop,
    draw: draw,
    getNoiseFloor: getNoiseFloor,
    setNoiseFloor: setNoiseFloor
  };
})(this);
