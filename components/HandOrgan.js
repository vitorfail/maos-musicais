"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { ZONES, TYPES, FING, HARM, rootOf, noteNames, mtof } from "../lib/music";

const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240";
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = { 1: 27, 3: 65, 6: 141, 8: 179, 10: 217 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function countFingers(lm) {
  let n = 0;
  [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(([tip, pip]) => {
    if (dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.1) n++;
  });
  if (dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.05 && dist(lm[4], lm[5]) > dist(lm[3], lm[5])) n++;
  return n;
}

export default function HandOrgan() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const S = useRef({ ctx: null, master: null, current: null, cand: null, candCount: 0, lastSeen: 0, key: null, running: false, stream: null });

  const [scriptReady, setScriptReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chord, setChord] = useState(null);
  const [live, setLive] = useState("Esquerda: — · Direita: —");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.Hands) setScriptReady(true);
    const s = S.current;
    return () => {
      s.running = false;
      s.stream?.getTracks().forEach((t) => t.stop());
      s.ctx?.close();
    };
  }, []);

  function playChord(midis) {
    const { ctx, master } = S.current;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    const oscs = [];
    midis.forEach((m) => HARM.forEach(([h, a]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = "sine";
      o.frequency.value = mtof(m) * h;
      og.gain.value = a / (midis.length * 4);
      o.connect(og); og.connect(g);
      o.start();
      oscs.push(o);
    }));
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.06);
    return { g, oscs };
  }

  function stopChord() {
    const { ctx, current } = S.current;
    if (!current) return;
    const t = ctx.currentTime;
    current.g.gain.cancelScheduledValues(t);
    current.g.gain.setValueAtTime(current.g.gain.value, t);
    current.g.gain.linearRampToValueAtTime(0, t + 0.12);
    const oscs = current.oscs;
    setTimeout(() => oscs.forEach((o) => { try { o.stop(); } catch {} }), 200);
    S.current.current = null;
  }

  function applyKey(key) {
    const s = S.current;
    s.key = key;
    stopChord();
    if (!key) { setChord(null); return; }
    const [z, l, r] = key.split(":").map(Number);
    const [name, root] = rootOf(z, l);
    const [suffix, ints] = TYPES[r];
    s.current = playChord([root - 12, ...ints.map((i) => root + i)]);
    setChord({ key, name: name + suffix, notes: noteNames(root, ints), root: root % 12, ints });
  }

  function handleResults(res) {
    const s = S.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, canvas.width, canvas.height);

    c.strokeStyle = "rgba(255,255,255,.35)";
    c.setLineDash([8, 8]);
    [0.33, 0.66].forEach((y) => { c.beginPath(); c.moveTo(0, y * canvas.height); c.lineTo(canvas.width, y * canvas.height); c.stroke(); });
    c.setLineDash([]);

    let left = null, right = null, zone = 0;
    (res.multiHandLandmarks || []).forEach((lm) => {
      const screenX = 1 - lm[0].x;
      const n = countFingers(lm);
      if (screenX < 0.5) { left = n; zone = lm[9].y < 0.33 ? 2 : lm[9].y < 0.66 ? 1 : 0; } else right = n;
      c.fillStyle = screenX < 0.5 ? "#e8b04a" : "#4ac1e8";
      lm.forEach((p) => { c.beginPath(); c.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, 7); c.fill(); });
    });

    let key = null;
    if (left !== null && rootOf(zone, left)) key = `${zone}:${left}:${right === null ? 0 : right}`;
    setLive(
      "Esquerda: " + (left === null ? "—" : `${FING[left]} (faixa ${ZONES[zone].label})`) +
      " · Direita: " + (right === null ? "—" : FING[right])
    );

    const now = performance.now();
    if (key) s.lastSeen = now;
    if (!key && now - s.lastSeen < 400) return;

    if (key === s.cand) s.candCount++; else { s.cand = key; s.candCount = 1; }
    if (s.candCount === 3 && key !== s.key) applyKey(key);
  }

  async function start() {
    const s = S.current;
    setError(""); setLoading(true);
    try {
      s.ctx = new (window.AudioContext || window.webkitAudioContext)();
      s.master = s.ctx.createGain();
      s.master.gain.value = 0.25;
      s.master.connect(s.ctx.destination);
      await s.ctx.resume();

      s.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
      });
      const v = videoRef.current;
      v.srcObject = s.stream;
      await v.play();

      const hands = new window.Hands({ locateFile: (f) => `${CDN}/${f}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
      hands.onResults(handleResults);

      s.running = true;
      let busy = false;
      const loop = async () => {
        if (!s.running) return;
        if (!busy) {
          busy = true;
          try { await hands.send({ image: v }); } catch {}
          busy = false;
        }
        requestAnimationFrame(loop);
      };
      loop();
      setStarted(true);
    } catch (e) {
      setError("Não foi possível iniciar câmera/áudio: " + (e?.message || e));
    }
    setLoading(false);
  }

  const lit = (pc) => {
    if (!chord) return "";
    const i = chord.ints.findIndex((x) => (chord.root + x) % 12 === pc);
    return i === 0 ? " root" : i > 0 ? " on" : "";
  };

  return (
    <>
      <Script src={`${CDN}/hands.js`} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />

      {!started && (
        <button id="start" onClick={start} disabled={!scriptReady || loading}>
          {loading ? "Carregando…" : scriptReady ? "Ligar câmera e som" : "Preparando…"}
        </button>
      )}
      <button id="dictBtn" onClick={() => setOpen(true)}>📖 Dicionário de gestos</button>
      {error && <p style={{ color: "#ff8a8a", margin: "8px 12px" }}>{error}</p>}

      <div id="wrap">
        <video id="v" ref={videoRef} playsInline muted />
        <canvas id="c" ref={canvasRef} />
        <div id="kb">
          {WHITE.map((pc, i) => <div key={pc} className={"wk" + lit(pc)} style={{ left: i * 40 }} />)}
          {Object.entries(BLACK).map(([pc, x]) => <div key={pc} className={"bk" + lit(Number(pc))} style={{ left: x }} />)}
        </div>
        {chord && (
          <div id="ov">
            <div id="chord">{chord.name}</div>
            <div id="notes">{chord.notes.join(" · ")}</div>
          </div>
        )}
      </div>
      <div id="live">{live}</div>

      <div id="modal" className={open ? "open" : ""} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="box">
          <button id="close" onClick={() => setOpen(false)}>Fechar ✕</button>
          <h2>Dicionário de gestos</h2>
          <p className="help" style={{ margin: "0 0 10px" }}>
            Mão <b>esquerda</b> (lado esquerdo da tela) escolhe a nota (linhas) e a altura dela na tela escolhe a faixa.
            Mão <b>direita</b> escolhe o tipo do acorde (colunas). Sem a mão direita na tela, toca o acorde maior.
            O acorde atual fica destacado.
          </p>
          <div className="tablewrap">
            <table id="dict">
              <tbody>
                {ZONES.map((z, zi) => <ZoneRows key={zi} z={z} zi={zi} current={chord?.key} />)}
              </tbody>
            </table>
          </div>
          <p className="help">Esquerda em punho ✊ = silêncio.</p>
        </div>
      </div>
    </>
  );
}

function ZoneRows({ z, zi, current }) {
  return (
    <>
      <tr><th colSpan={7} style={{ background: "#3a3a3a" }}>Faixa {z.label} — {z.desc}</th></tr>
      <tr>
        <th>Esq ↓ / Dir →</th>
        {[0, 1, 2, 3, 4, 5].map((r) => (
          <th key={r}>{FING[r]}<br /><small>{TYPES[r][0] || "maior"}</small></th>
        ))}
      </tr>
      {z.roots.map((_, idx) => {
        const l = idx + 1;
        const [nm, root] = rootOf(zi, l);
        return (
          <tr key={l}>
            <th>{FING[l]}<br /><small>{nm}</small></th>
            {[0, 1, 2, 3, 4, 5].map((r) => {
              const [suf, ints] = TYPES[r];
              return (
                <td key={r} className={current === `${zi}:${l}:${r}` ? "cur" : ""}>
                  <b>{nm}{suf}</b><small>{noteNames(root, ints).join(" ")}</small>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
