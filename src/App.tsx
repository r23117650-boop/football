import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MobileControls } from './components/MobileControls';
import { soundEngine } from './game/audio';
import { GameEngine } from './game/matchEngine';
import { getPenaltyGoalBounds, renderGame } from './game/renderer';
import { OfflineIndicator, PWAInstallButton } from './hooks/usePWAInstall';
import type {
  Difficulty,
  FormationId,
  GameMode,
  HudSnapshot,
  InputState,
  KickOutcome,
} from './game/types';

function formatMatchClock(seconds: number, halfDuration: number): string {
  const totalMatchMinutes = (seconds / halfDuration) * 45;
  const mins = Math.floor(totalMatchMinutes);
  const secs = Math.floor((totalMatchMinutes - mins) * 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function KickStatusIcon({ outcome }: { outcome: KickOutcome }) {
  if (outcome === 'GOAL') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-emerald-500/20 border border-emerald-400 text-emerald-300"
        title="Scored"
      >
        <Check className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  if (outcome === 'MISS' || outcome === 'SAVE') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-rose-500/20 border border-rose-400 text-rose-300"
        title={outcome === 'SAVE' ? 'Saved' : 'Missed'}
      >
        <X className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-slate-800/80 border border-slate-600"
      title="Upcoming"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
    </span>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }

  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    sprint: false,
    shootHeld: false,
    shootJustPressed: false,
    shootJustReleased: false,
    passJustPressed: false,
    throughJustPressed: false,
    mouseNormX: 0,
    mouseNormY: 0.35,
    mouseActive: false,
    mouseDown: false,
    mouseJustPressed: false,
    mouseJustReleased: false,
  });

  const [selectedMode, setSelectedMode] = useState<GameMode>('MATCH');
  const [selectedFormation, setSelectedFormation] =
    useState<FormationId>('4-3-3');
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<Difficulty>('PRO');
  const [muted, setMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  });

  const [hud, setHud] = useState<HudSnapshot>(() =>
    engineRef.current!.getHudSnapshot(),
  );

  const syncHud = useCallback(() => {
    const next = engineRef.current!.getHudSnapshot();
    setHud((prev) => {
      if (
        prev.screen === next.screen &&
        prev.mode === next.mode &&
        prev.homeScore === next.homeScore &&
        prev.awayScore === next.awayScore &&
        prev.half === next.half &&
        prev.clockSeconds === next.clockSeconds &&
        prev.activePlayerNumber === next.activePlayerNumber &&
        prev.activePlayerStamina === next.activePlayerStamina &&
        prev.shotCharge === next.shotCharge &&
        prev.goalBannerText === next.goalBannerText &&
        prev.penalty.phase === next.penalty.phase &&
        prev.penalty.turn === next.penalty.turn &&
        prev.penalty.round === next.penalty.round &&
        prev.penalty.homeScore === next.penalty.homeScore &&
        prev.penalty.awayScore === next.penalty.awayScore &&
        prev.penalty.resultBanner === next.penalty.resultBanner &&
        prev.penalty.power === next.penalty.power &&
        prev.penalty.keeperCommitted === next.penalty.keeperCommitted &&
        prev.penalty.homeKicks.length === next.penalty.homeKicks.length &&
        prev.penalty.awayKicks.length === next.penalty.awayKicks.length
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    soundEngine.unlock();
    const eng = engineRef.current!;
    eng.startNewMatch(selectedMode, selectedFormation, selectedDifficulty);
    syncHud();
  }, [selectedMode, selectedFormation, selectedDifficulty, syncHud]);

  const handlePauseToggle = useCallback(() => {
    const eng = engineRef.current!;
    if (eng.screen === 'PLAYING') {
      eng.screen = 'PAUSED';
    } else if (eng.screen === 'PAUSED') {
      eng.screen = 'PLAYING';
    }
    syncHud();
  }, [syncHud]);

  const handleReturnToTitle = useCallback(() => {
    const eng = engineRef.current!;
    eng.mode = 'MATCH';
    eng.screen = 'TITLE';
    eng.setupTeams();
    syncHud();
  }, [syncHud]);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const clearHeld = () => {
      const inp = inputRef.current;
      inp.up = false;
      inp.down = false;
      inp.left = false;
      inp.right = false;
      inp.analogX = 0;
      inp.analogY = 0;
      inp.sprint = false;
      inp.shootHeld = false;
      inp.mouseDown = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const eng = engineRef.current!;

      if (code === 'Escape') {
        if (eng.screen === 'PLAYING' || eng.screen === 'PAUSED') {
          e.preventDefault();
          handlePauseToggle();
          return;
        }
      }

      if (eng.screen === 'TITLE' && code === 'Enter') {
        e.preventDefault();
        handleStart();
        return;
      }

      if (eng.screen !== 'PLAYING') return;

      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') {
        e.preventDefault();
        inp.up = true;
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        e.preventDefault();
        inp.down = true;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        inp.left = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        inp.right = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        inp.sprint = true;
      } else if (code === 'Space' || code === 'KeyK') {
        e.preventDefault();
        if (!inp.shootHeld) {
          inp.shootJustPressed = true;
        }
        inp.shootHeld = true;
      } else if (code === 'KeyJ' || code === 'KeyE' || code === 'KeyX') {
        e.preventDefault();
        if (!e.repeat) {
          inp.passJustPressed = true;
        }
      } else if (code === 'KeyL' || code === 'KeyQ' || code === 'KeyC') {
        e.preventDefault();
        if (!e.repeat) {
          inp.throughJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') inp.up = false;
      else if (code === 'KeyS' || code === 'ArrowDown') inp.down = false;
      else if (code === 'KeyA' || code === 'ArrowLeft') inp.left = false;
      else if (code === 'KeyD' || code === 'ArrowRight') inp.right = false;
      else if (code === 'ShiftLeft' || code === 'ShiftRight') inp.sprint = false;
      else if (code === 'Space' || code === 'KeyK') {
        if (inp.shootHeld) {
          inp.shootJustReleased = true;
        }
        inp.shootHeld = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearHeld();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handlePauseToggle, handleStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      const eng = engineRef.current!;
      const inp = inputRef.current;

      eng.update(rawDt, inp);

      inp.shootJustPressed = false;
      inp.shootJustReleased = false;
      inp.passJustPressed = false;
      inp.throughJustPressed = false;
      inp.mouseJustPressed = false;
      inp.mouseJustReleased = false;

      renderGame(ctx, eng, window.innerWidth, window.innerHeight);

      hudTimer += rawDt;
      if (hudTimer >= 0.08) {
        hudTimer = 0;
        syncHud();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [syncHud]);

  const updateMouseGoalCoords = (clientX: number, clientY: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { goalLeft, goalRight, goalTop, goalBottom } = getPenaltyGoalBounds(
      w,
      h,
    );
    const goalW = goalRight - goalLeft;
    const goalH = goalBottom - goalTop;
    const normX = ((clientX - (goalLeft + goalRight) / 2) / (goalW / 2));
    const normY = (goalBottom - clientY) / goalH;

    inputRef.current.mouseNormX = Math.max(-1.22, Math.min(1.22, normX));
    inputRef.current.mouseNormY = Math.max(0.04, Math.min(1.22, normY));
    inputRef.current.mouseActive = true;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (engineRef.current?.mode === 'PENALTY_SHOOTOUT') {
      updateMouseGoalCoords(e.clientX, e.clientY);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    soundEngine.unlock();
    const eng = engineRef.current;
    if (eng?.mode === 'PENALTY_SHOOTOUT' && eng?.screen === 'PLAYING') {
      updateMouseGoalCoords(e.clientX, e.clientY);
      if (e.pointerType === 'touch' && eng.penalty.turn === 'HOME' && showTouchControls) {
        return;
      }
      inputRef.current.mouseDown = true;
      inputRef.current.mouseJustPressed = true;
    }
  };

  const handleCanvasPointerUp = () => {
    if (inputRef.current.mouseDown) {
      inputRef.current.mouseDown = false;
      inputRef.current.mouseJustReleased = true;
    }
  };

  const totalPoss =
    hud.stats.homePossessionTicks + hud.stats.awayPossessionTicks;
  const homePossPct =
    totalPoss > 0
      ? Math.round((hud.stats.homePossessionTicks / totalPoss) * 100)
      : 50;
  const awayPossPct = 100 - homePossPct;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#08120c] text-slate-50">
      <canvas
        ref={canvasRef}
        onPointerMove={handleCanvasPointerMove}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        className={`block h-full w-full ${
          hud.screen === 'PLAYING' && hud.mode === 'PENALTY_SHOOTOUT'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      />

      {hud.screen === 'TITLE' && (
        <div className="absolute inset-0 flex flex-col justify-between overflow-y-auto bg-gradient-to-r from-[#07110c]/94 via-[#07110c]/74 to-[#07110c]/25 p-5 sm:p-8 md:p-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-medium text-slate-300">
              <span>11v11 Pitch</span>
              <span aria-hidden="true">·</span>
              <span>Penalty Shootout</span>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-900/80 text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="max-w-lg space-y-7">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 52 52"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M26 3L46 11V25C46 37.2 37.3 45.6 26 49C14.7 45.6 6 37.2 6 25V11L26 3Z"
                    fill="#0F172A"
                    stroke="#F8FAFC"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M26 9V43M13 21H39"
                    stroke="#22C55E"
                    strokeWidth="2"
                    strokeOpacity="0.65"
                  />
                  <circle
                    cx="26"
                    cy="25"
                    r="8.5"
                    fill="#2563EB"
                    stroke="#F8FAFC"
                    strokeWidth="2"
                  />
                  <text
                    x="26"
                    y="29"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    11
                  </text>
                </svg>
                <h1 className="font-display text-6xl font-extrabold tracking-tight text-white md:text-7xl">
                  PITCH 11
                </h1>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-slate-300">
                Full-squad 11-a-side football with fluid sprint and dribble
                physics, tactical AI formations, and a goal-facing penalty
                shootout.
              </p>
            </div>

            <div className="space-y-4 border-t border-white/15 pt-5">
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-300">
                  Game Mode
                </span>
                <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('MATCH')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'MATCH'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    11v11 Match
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMode('PENALTY_SHOOTOUT')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'PENALTY_SHOOTOUT'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Penalty Shootout
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                {selectedMode === 'MATCH' && (
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-300">
                      Formation
                    </span>
                    <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                      {(['4-3-3', '4-4-2', '3-5-2'] as FormationId[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setSelectedFormation(f)}
                            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 font-mono-tabular text-xs font-semibold transition-colors ${
                              selectedFormation === f
                                ? 'bg-slate-200 text-slate-950'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {f}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-slate-300">
                    Difficulty
                  </span>
                  <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                    {(
                      [
                        { id: 'AMATEUR', label: 'Amateur' },
                        { id: 'PRO', label: 'Pro' },
                        { id: 'WORLD_CLASS', label: 'World Class' },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDifficulty(d.id)}
                        className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selectedDifficulty === d.id
                            ? 'bg-slate-200 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-emerald-500 px-7 py-3.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Play className="h-4 w-4 fill-current" />
                {selectedMode === 'MATCH'
                  ? 'Kick Off Match'
                  : 'Start Penalty Shootout'}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-300">
            WASD / Arrows Move · Shift Sprint · J Pass / Switch · L Through Ball ·
            Space Shoot / Tackle · Esc Pause
          </div>
        </div>
      )}

      {hud.screen !== 'TITLE' && hud.mode === 'MATCH' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-2.5 py-1.5 md:hidden">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
              </div>
              <div className="mt-1 h-1 w-16 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>
            <div className="hidden w-28 md:block" />

            <div className="flex items-center overflow-hidden rounded-md border border-white/15 bg-slate-950/90 shadow-lg">
              <div className="flex items-center gap-2 border-r border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  HOME
                </span>
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.homeScore}
                </span>
              </div>
              <div className="flex flex-col items-center px-2.5 py-1 sm:px-3.5">
                <span className="font-mono-tabular text-xs font-bold leading-tight text-emerald-400 sm:text-sm">
                  {formatMatchClock(hud.clockSeconds, hud.halfDurationSeconds)}
                </span>
                <span className="text-[10px] font-medium leading-tight text-slate-400">
                  {hud.half === 1 ? '1st' : '2nd'}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.awayScore}
                </span>
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  AWAY
                </span>
                <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowTouchControls((v) => !v)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                  showTouchControls
                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/15 bg-slate-950/88 text-slate-200 hover:bg-slate-800'
                }`}
                aria-label="Toggle on-screen touch controls"
                title="Toggle touch controls"
              >
                <Gamepad2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause match"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {hud.goalBannerText && (
            <div className="mx-auto my-auto flex flex-col items-center rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-4xl font-extrabold tracking-tight text-amber-400 sm:text-5xl">
                {hud.goalBannerText}
              </div>
              {hud.goalBannerSub && (
                <div className="mt-1 font-mono-tabular text-sm font-medium text-slate-200">
                  {hud.goalBannerSub}
                </div>
              )}
            </div>
          )}

          <div className="hidden items-end justify-between md:flex">
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span className="font-mono-tabular text-slate-300">
                  {hud.activePlayerStamina}% Stamina
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400 transition-transform duration-75"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300">
              J Pass / Switch · L Through · Hold Space Shoot · Space (Off-ball)
              Tackle
            </div>
          </div>
        </div>
      )}

      {hud.screen !== 'TITLE' && hud.mode === 'PENALTY_SHOOTOUT' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <div className="w-20" />

            <div className="flex flex-col items-center gap-2 rounded-md border border-white/15 bg-slate-950/92 px-5 py-2.5 shadow-xl">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                  <span className="font-display text-lg font-bold text-white">
                    HOME
                  </span>
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.homeScore}
                  </span>
                </div>

                <div className="border-x border-white/15 px-3 text-center">
                  <div className="text-[11px] font-semibold text-amber-400">
                    {hud.penalty.suddenDeath
                      ? 'Sudden Death'
                      : `Round ${hud.penalty.round} of 5`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {hud.penalty.turn === 'HOME'
                      ? 'Your Kick'
                      : 'Your Save (GK)'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.awayScore}
                  </span>
                  <span className="font-display text-lg font-bold text-white">
                    AWAY
                  </span>
                  <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-white/10 pt-2">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-500">vs</span>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause shootout"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {hud.penalty.phase === 'RESULT' && hud.penalty.resultBanner && (
            <div className="mx-auto my-auto rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-5xl font-extrabold tracking-tight text-amber-400">
                {hud.penalty.resultBanner}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-200">
                {hud.penalty.resultSub}
              </div>
            </div>
          )}

          {hud.penalty.phase !== 'FINISHED' && (
            <div className="mx-auto rounded-md border border-white/15 bg-slate-950/88 px-4 py-2 text-xs font-medium text-slate-200">
              {hud.penalty.turn === 'HOME'
                ? 'Attack: Aim with Mouse or Arrows · Hold Space / Click to Charge & Release to Shoot'
                : hud.penalty.keeperCommitted
                  ? 'Dive locked — hold your nerve!'
                  : 'Goalkeeper: Click any zone in the goal or press A / W / D / Arrows to Dive'}
            </div>
          )}
        </div>
      )}

      {hud.screen === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="font-display text-3xl font-bold text-white">
              Match Paused
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {hud.mode === 'MATCH'
                ? `Home ${hud.homeScore} – ${hud.awayScore} Away`
                : `Shootout ${hud.penalty.homeScore} – ${hud.penalty.awayScore}`}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full rounded-md border border-white/15 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.screen === 'HALFTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-medium text-emerald-400">
              Half-Time Whistle
            </div>
            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  engineRef.current!.resumeSecondHalf();
                  syncHud();
                }}
                className="w-full rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Start Second Half
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.screen === 'FULLTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <Trophy className="h-4 w-4" />
              <span>
                {hud.homeScore > hud.awayScore
                  ? 'Full-Time · Home Victory'
                  : hud.awayScore > hud.homeScore
                    ? 'Full-Time · Away Victory'
                    : 'Full-Time · Match Drawn'}
              </span>
            </div>

            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {hud.homeScore === hud.awayScore && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startPenaltyFromDraw();
                    syncHud();
                  }}
                  className="w-full rounded-md bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300"
                >
                  Decide by Penalty Shootout
                </button>
              )}
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.mode === 'PENALTY_SHOOTOUT' &&
        hud.screen === 'PLAYING' &&
        hud.penalty.phase === 'FINISHED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
            <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
              <div className="mx-auto mb-2 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-400/15 text-amber-400">
                <Trophy className="h-6 w-6" />
              </div>
              <h2 className="font-display text-4xl font-extrabold text-white">
                {hud.penalty.winner === 'HOME'
                  ? 'Penalty Shootout Winners'
                  : 'Shootout Defeat'}
              </h2>
              <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-200">
                HOME {hud.penalty.homeScore} – {hud.penalty.awayScore} AWAY
              </p>

              <div className="mt-4 flex justify-center gap-6 border-y border-white/10 py-3">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startNewMatch(
                      'PENALTY_SHOOTOUT',
                      selectedFormation,
                      selectedDifficulty,
                    );
                    syncHud();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  <RotateCcw className="h-4 w-4" />
                  Play Shootout Again
                </button>
                <button
                  type="button"
                  onClick={handleReturnToTitle}
                  className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        )}

      {hud.screen === 'PLAYING' && showTouchControls && (
        <MobileControls
          mode={hud.mode}
          penaltyTurn={hud.penalty.turn}
          penaltyPhase={hud.penalty.phase}
          inputRef={inputRef}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
চালানোর নিয়ম:
১. ফাইলগুলো একই ফোল্ডার স্ট্রাকচারে সেভ করুন এবং public/ ফোল্ডারে pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png, ও apple-touch-icon.png আইকন রাখুন (বা npm run build দিয়ে বিল্ড করুন)।
২. টার্মিনালে npm install ও তারপর npm run dev চালালে গেমটি চালু হবে।
৩. Android .apk বানাতে চাইলে npm run build করার পর dist/ ফোল্ডারটি Capacitor (npx cap add android) দিয়ে Android Studio-তে ওপেন করে সরাসরি APK বিল্ড করতে পারবেন।
ki holo code gula dew

Action history
এই গেমটির পুরো সোর্স কোড অনেক বড় (১৭টি ফাইল), তাই এক মেসেজে সব দিলে মাঝপথে কেটে যেতে পারে। এজন্য আমি ৪টি অংশে (Part 1 থেকে Part 4) পুরো কোড দিচ্ছি যাতে কোনো লাইন বাদ না পড়ে।
নিচে Part 1 / 4 (কনফিগারেশন, টাইপস, অডিও, ফরমেশন ও মোবাইল কন্ট্রোল) দেওয়া হলো। এই অংশটি নেওয়া হলে শুধু লিখুন "next" — পরের অংশ দিয়ে দেবো।
1. /package.json
JSON
{
  "name": "react-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^2.4.0",
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0",
    "express": "^4.21.2",
    "dotenv": "^17.2.3",
    "motion": "^12.23.24"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2",
    "vite-plugin-pwa": "^2.0.0"
  }
}
2. /metadata.json
JSON
{
  "name": "Pitch 11",
  "description": "2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout.",
  "requestFramePermissions": [],
  "majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
}
3. /index.html
Html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Pitch 11 — 2D 11v11 Football &amp; Penalty Shootout</title>
    <meta name="description" content="2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout." />
    <meta name="theme-color" content="#08120c" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Pitch 11" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta property="og:title" content="Pitch 11" />
    <meta property="og:description" content="2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-[#08120c] text-slate-50 antialiased overflow-hidden select-none">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
4. /tsconfig.json
JSON
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "exclude": ["dist"]
}
5. /vite.config.ts
TypeScript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Pitch 11 — 2D Football',
          short_name: 'Pitch 11',
          description:
            '2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout.',
          theme_color: '#08120c',
          background_color: '#08120c',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
6. /src/index.css
CSS
@import "tailwindcss";

@theme {
  --font-display: "Barlow Condensed", sans-serif;
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

@layer base {
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    font-family: var(--font-sans);
    background-color: #08120c;
  }
}

.font-display {
  font-family: var(--font-display);
}

.font-mono-tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
7. /src/main.tsx
TypeScript
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
8. /public/icon.svg
Xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="108" fill="#0B1F14"/>
  <rect x="28" y="28" width="456" height="456" rx="88" fill="#134E2E" stroke="#22C55E" stroke-opacity="0.35" stroke-width="6"/>
  <path d="M256 78L404 136V248C404 344 336 410 256 438C176 410 108 344 108 248V136L256 78Z" fill="#0F172A" stroke="#F8FAFC" stroke-width="14" stroke-linejoin="round"/>
  <path d="M256 112V402M148 220H364" stroke="#22C55E" stroke-opacity="0.55" stroke-width="10"/>
  <circle cx="256" cy="248" r="64" fill="#2563EB" stroke="#F8FAFC" stroke-width="12"/>
  <text x="256" y="269" text-anchor="middle" fill="#FFFFFF" font-size="62" font-weight="800" font-family="sans-serif">11</text>
</svg>
9. /src/game/types.ts
TypeScript
export type GameMode = 'MATCH' | 'PENALTY_SHOOTOUT';

export type ScreenState =
  | 'TITLE'
  | 'PLAYING'
  | 'PAUSED'
  | 'HALFTIME'
  | 'FULLTIME';

export type TeamSide = 'HOME' | 'AWAY';

export type PlayerRole = 'GK' | 'DEF' | 'MID' | 'FWD';

export type FormationId = '4-3-3' | '4-4-2' | '3-5-2';

export type Difficulty = 'AMATEUR' | 'PRO' | 'WORLD_CLASS';

export interface Player {
  id: string;
  team: TeamSide;
  number: number;
  role: PlayerRole;
  /** Normalized base formation anchor (0..1 across pitch length/width) */
  baseNx: number;
  baseNy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  stamina: number; // 0..100
  stridePhase: number;
  isSprinting: boolean;
  tackleTimer: number;
  tackleCooldown: number;
  stunTimer: number;
  kickAnimTimer: number;
  diveTimer: number;
  diveDirY: number;
  aiDecisionTimer: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rotation: number;
  ownerId: string | null;
  lastTouchTeam: TeamSide | null;
  lastTouchPlayerId: string | null;
  pickupCooldown: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'turf' | 'chalk' | 'confetti' | 'spark';
}

export type KickOutcome = 'GOAL' | 'MISS' | 'SAVE' | null;

export type PenaltyPhase =
  | 'AIMING'
  | 'CHARGING'
  | 'RUNUP'
  | 'FLIGHT'
  | 'KEEPER_WAIT'
  | 'KEEPER_FLIGHT'
  | 'RESULT'
  | 'FINISHED';

export interface PenaltyState {
  phase: PenaltyPhase;
  turn: TeamSide;
  round: number; // 1-indexed
  suddenDeath: boolean;
  homeKicks: KickOutcome[];
  awayKicks: KickOutcome[];
  homeScore: number;
  awayScore: number;
  winner: TeamSide | null;
  /** Normalized aim inside/around goal frame: x in [-1.25..1.25], y in [0..1.25] (0=ground, 1=crossbar) */
  aimX: number;
  aimY: number;
  /** Shot power 0..1 */
  power: number;
  powerDir: number;
  /** Keeper dive target: x in [-1..1], y in [0..1] */
  keeperTargetX: number;
  keeperTargetY: number;
  keeperCurrX: number;
  keeperCurrY: number;
  keeperDiveCommitted: boolean;
  /** AI windup telegraph */
  aiWaitTimer: number;
  aiWaitDuration: number;
  aiCueX: number;
  /** Active shot animation state */
  kickerProgress: number; // 0..1 runup
  ballProgress: number; // 0..1 flight
  shotStartX: number;
  shotStartY: number;
  shotEndX: number;
  shotEndY: number;
  shotCurve: number;
  shotPeakZ: number;
  ballCurrX: number;
  ballCurrY: number;
  ballCurrZ: number;
  ballTrail: Array<{ x: number; y: number; z: number }>;
  netRippleX: number;
  netRippleY: number;
  netRippleStrength: number;
  resultTimer: number;
  resultBanner: string;
  resultSub: string;
}

export interface MatchStats {
  homeShots: number;
  awayShots: number;
  homeOnTarget: number;
  awayOnTarget: number;
  homePossessionTicks: number;
  awayPossessionTicks: number;
  homeSaves: number;
  awaySaves: number;
}

export interface HudSnapshot {
  screen: ScreenState;
  mode: GameMode;
  homeScore: number;
  awayScore: number;
  half: 1 | 2;
  clockSeconds: number;
  halfDurationSeconds: number;
  activePlayerNumber: number;
  activePlayerRole: PlayerRole;
  activePlayerStamina: number;
  shotCharge: number;
  goalBannerText: string | null;
  goalBannerSub: string | null;
  stats: MatchStats;
  penalty: {
    phase: PenaltyPhase;
    turn: TeamSide;
    round: number;
    suddenDeath: boolean;
    homeScore: number;
    awayScore: number;
    homeKicks: KickOutcome[];
    awayKicks: KickOutcome[];
    winner: TeamSide | null;
    resultBanner: string;
    resultSub: string;
    power: number;
    keeperCommitted: boolean;
  };
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Continuous -1..1 analog thumbstick vector for mobile touch */
  analogX: number;
  analogY: number;
  sprint: boolean;
  shootHeld: boolean;
  shootJustPressed: boolean;
  shootJustReleased: boolean;
  passJustPressed: boolean;
  throughJustPressed: boolean;
  mouseNormX: number; // -1..1 relative to penalty goal
  mouseNormY: number; // 0..1.25 relative to penalty goal
  mouseActive: boolean;
  mouseDown: boolean;
  mouseJustPressed: boolean;
  mouseJustReleased: boolean;
}
10. /src/game/formations.ts
TypeScript
import type { FormationId, Player, PlayerRole, TeamSide } from './types';

export interface FormationSlot {
  number: number;
  role: PlayerRole;
  /** Normalized pitch position for HOME team attacking left -> right (0.04..0.95) */
  nx: number;
  /** Normalized pitch width (0.08..0.92) */
  ny: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.21, ny: 0.16 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.21, ny: 0.84 },
    { number: 6, role: 'MID', nx: 0.33, ny: 0.5 },
    { number: 8, role: 'MID', nx: 0.39, ny: 0.28 },
    { number: 10, role: 'MID', nx: 0.39, ny: 0.72 },
    { number: 7, role: 'FWD', nx: 0.465, ny: 0.18 },
    { number: 9, role: 'FWD', nx: 0.48, ny: 0.5 },
    { number: 11, role: 'FWD', nx: 0.465, ny: 0.82 },
  ],
  '4-4-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.2, ny: 0.15 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.2, ny: 0.85 },
    { number: 7, role: 'MID', nx: 0.37, ny: 0.14 },
    { number: 6, role: 'MID', nx: 0.34, ny: 0.38 },
    { number: 8, role: 'MID', nx: 0.34, ny: 0.62 },
    { number: 11, role: 'MID', nx: 0.37, ny: 0.86 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.39 },
    { number: 10, role: 'FWD', nx: 0.475, ny: 0.61 },
  ],
  '3-5-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 4, role: 'DEF', nx: 0.18, ny: 0.26 },
    { number: 5, role: 'DEF', nx: 0.16, ny: 0.5 },
    { number: 3, role: 'DEF', nx: 0.18, ny: 0.74 },
    { number: 2, role: 'MID', nx: 0.35, ny: 0.12 },
    { number: 6, role: 'MID', nx: 0.31, ny: 0.36 },
    { number: 8, role: 'MID', nx: 0.31, ny: 0.64 },
    { number: 10, role: 'MID', nx: 0.4, ny: 0.5 },
    { number: 7, role: 'MID', nx: 0.35, ny: 0.88 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.38 },
    { number: 11, role: 'FWD', nx: 0.475, ny: 0.62 },
  ],
};

export const PITCH = {
  worldW: 1700,
  worldH: 1060,
  marginX: 110,
  marginY: 90,
  fieldW: 1480,
  fieldH: 880,
  goalW: 52,
  goalH: 184,
  penaltyBoxW: 230,
  penaltyBoxH: 460,
  sixYardW: 82,
  sixYardH: 240,
  penaltySpotDist: 162,
  centerCircleR: 124,
  playerRadius: 15,
  ballRadius: 8.5,
} as const;

export function createTeamPlayers(
  team: TeamSide,
  formation: FormationId,
): Player[] {
  const slots = FORMATIONS[formation];
  return slots.map((slot, idx) => {
    const nx = team === 'HOME' ? slot.nx : 1 - slot.nx;
    const ny = team === 'HOME' ? slot.ny : 1 - slot.ny;
    const x = PITCH.marginX + nx * PITCH.fieldW;
    const y = PITCH.marginY + ny * PITCH.fieldH;
    return {
      id: `${team}_${slot.number}_${idx}`,
      team,
      number: slot.number,
      role: slot.role,
      baseNx: nx,
      baseNy: ny,
      x,
      y,
      vx: 0,
      vy: 0,
      facing: team === 'HOME' ? 0 : Math.PI,
      stamina: 100,
      stridePhase: (idx * 0.7) % (Math.PI * 2),
      isSprinting: false,
      tackleTimer: 0,
      tackleCooldown: 0,
      stunTimer: 0,
      kickAnimTimer: 0,
      diveTimer: 0,
      diveDirY: 0,
      aiDecisionTimer: 0.08 * idx,
    };
  });
}
11. /src/game/audio.ts
TypeScript
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public playKick(power = 0.7): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 125 + power * 55;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);

    const vol = Math.min(0.45, 0.18 + power * 0.24);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playPass(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playSave(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playPostHit(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [420, 685, 1080];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.14 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  public playNetSwish(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playWhistle(kind: 'short' | 'double' | 'long'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const scheduleBlast = (offset: number, dur: number) => {
      const start = ctx.currentTime + offset;
      const carrier = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();

      carrier.type = 'triangle';
      carrier.frequency.setValueAtTime(2850, start);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(42, start);
      lfoGain.gain.setValueAtTime(90, start);

      lfo.connect(lfoGain);
      lfoGain.connect(carrier.frequency);

      mainGain.gain.setValueAtTime(0.001, start);
      mainGain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      mainGain.gain.setValueAtTime(0.1, start + Math.max(0.03, dur - 0.04));
      mainGain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      carrier.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start(start);
      carrier.start(start);
      lfo.stop(start + dur + 0.01);
      carrier.stop(start + dur + 0.01);
    };

    if (kind === 'short') {
      scheduleBlast(0, 0.18);
    } else if (kind === 'double') {
      scheduleBlast(0, 0.14);
      scheduleBlast(0.2, 0.22);
    } else {
      scheduleBlast(0, 0.45);
    }
  }

  public playCrowdGoal(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = 1.45;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 3.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.linearRampToValueAtTime(760, now + 0.35);
    filter.Q.setValueAtTime(0.7, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }
}

export const soundEngine = new SoundEngine();
12. /src/hooks/usePWAInstall.tsx
Tsx
import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const mobile = ios || /android|mobile/.test(ua);
    setIsIOS(ios);
    setIsMobile(mobile);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isMobile,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (!isInstallable && !isIOS && !isMobile) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        {isInstallable ? (
          <Download className="h-3.5 w-3.5" />
        ) : (
          <Smartphone className="h-3.5 w-3.5" />
        )}
        Install Phone App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl font-bold text-white">
                {isIOS ? 'Install on iPhone / iPad' : 'Install on Android'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this page in Safari on your iPhone or iPad.</li>
                <li>2. Tap the Share icon in the Safari toolbar.</li>
                <li>
                  3. Scroll down and tap{' '}
                  <strong className="text-white">Add to Home Screen</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this app link directly in Google Chrome on Android.</li>
                <li>2. Tap the three-dot menu (⋮) in the top-right corner.</li>
                <li>
                  3. Tap{' '}
                  <strong className="text-white">Add to Home screen</strong> or{' '}
                  <strong className="text-white">Install app</strong> to launch
                  full-screen like a native app.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-md bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-400/40 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-lg">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline Mode — Playing cached game</span>
    </div>
  );
};
13. /src/components/MobileControls.tsx
Tsx
import React, { useRef, useState } from 'react';
import { soundEngine } from '../game/audio';
import type { GameMode, InputState, PenaltyPhase, TeamSide } from '../game/types';

interface MobileControlsProps {
  mode: GameMode;
  penaltyTurn: TeamSide;
  penaltyPhase: PenaltyPhase;
  inputRef: React.MutableRefObject<InputState>;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  mode,
  penaltyTurn,
  penaltyPhase,
  inputRef,
}) => {
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const maxRadius = 42;

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobPos({ x: dx, y: dy });
    inputRef.current.analogX = dx / maxRadius;
    inputRef.current.analogY = dy / maxRadius;
  };

  const resetJoystick = () => {
    joyTouchIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    inputRef.current.analogX = 0;
    inputRef.current.analogY = 0;
  };

  const handleJoyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    soundEngine.unlock();
    if (joyTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    joyTouchIdRef.current = touch.identifier;
    updateJoystickFromClient(touch.clientX, touch.clientY);
  };

  const handleJoyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchIdRef.current) {
        updateJoystickFromClient(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoyTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchIdRef.current) {
        resetJoystick();
        break;
      }
    }
  };

  // Penalty Shootout touch helper: dedicated Hold-to-Shoot button on attack turn
  if (mode === 'PENALTY_SHOOTOUT') {
    if (
      penaltyTurn === 'HOME' &&
      (penaltyPhase === 'AIMING' || penaltyPhase === 'CHARGING')
    ) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex items-center justify-end px-6">
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              soundEngine.unlock();
              if (!inputRef.current.shootHeld) {
                inputRef.current.shootJustPressed = true;
              }
              inputRef.current.shootHeld = true;
              setActiveBtn('pen-shoot');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (inputRef.current.shootHeld) {
                inputRef.current.shootJustReleased = true;
              }
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            onTouchCancel={() => {
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            style={{ touchAction: 'none' }}
            className={`pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full border-2 text-center text-xs font-extrabold tracking-wide shadow-xl transition-transform ${
              activeBtn === 'pen-shoot'
                ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
                : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
            }`}
          >
            HOLD
            <br />
            SHOOT
          </button>
        </div>
      );
    }
    return null;
  }

  // 11v11 Match Virtual Gamepad
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-5 sm:px-7 sm:pb-6">
      {/* Left-thumb 360 Virtual Joystick */}
      <div
        ref={joyRef}
        onTouchStart={handleJoyTouchStart}
        onTouchMove={handleJoyTouchMove}
        onTouchEnd={handleJoyTouchEnd}
        onTouchCancel={handleJoyTouchEnd}
        style={{ touchAction: 'none' }}
        className="pointer-events-auto relative flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-slate-950/45 shadow-lg"
        aria-label="Move joystick"
      >
        <div className="h-16 w-16 rounded-full border border-white/10" />
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className="absolute h-12 w-12 rounded-full border-2 border-white/80 bg-blue-500/80 shadow-md"
        />
      </div>

      {/* Right-thumb Ergonomic Action Cluster */}
      <div className="pointer-events-auto relative h-36 w-44">
        {/* Sprint (top-left of cluster) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.sprint = true;
            setActiveBtn('sprint');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'sprint'
              ? 'scale-95 border-sky-300 bg-sky-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-slate-100'
          }`}
        >
          RUN
        </button>

        {/* Through Ball (top-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.throughJustPressed = true;
            setActiveBtn('thru');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute right-2 top-0 flex h-13 w-13 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'thru'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-amber-300'
          }`}
        >
          THRU
        </button>

        {/* Pass / Switch (bottom-left) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.passJustPressed = true;
            setActiveBtn('pass');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-1 left-2 flex h-14 w-14 items-center justify-center rounded-full border text-xs font-extrabold shadow-md transition-transform ${
            activeBtn === 'pass'
              ? 'scale-95 border-blue-300 bg-blue-500 text-white'
              : 'border-blue-400/50 bg-blue-600/85 text-white'
          }`}
        >
          PASS
        </button>

        {/* Primary Shoot / Tackle (bottom-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            if (!inputRef.current.shootHeld) {
              inputRef.current.shootJustPressed = true;
            }
            inputRef.current.shootHeld = true;
            setActiveBtn('shoot');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (inputRef.current.shootHeld) {
              inputRef.current.shootJustReleased = true;
            }
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-0 right-0 flex h-18 w-18 items-center justify-center rounded-full border-2 text-xs font-extrabold shadow-xl transition-transform ${
            activeBtn === 'shoot'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
          }`}
        >
          SHOOT
        </button>
      </div>
    </div>
  );
};
বাকি ৩টি অংশে থাকবে:
Part 2: penaltyEngine.ts + renderer.ts
Part 3: matchEngine.ts
Part 4: App.tsx
পরের অংশ পেতে লিখুন "next"।
এই নাও আপনার Pitch 11 গেমটির সব সম্পূর্ণ কোড (ফাইল নাম অনুযায়ী):
1. package.json
JSON
{
  "name": "react-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^2.4.0",
    "@tailwindcss/vite": "^4.3.3",
    "@vitejs/plugin-react": "^6.1.1",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "vite": "^8.3.0",
    "express": "^4.21.2",
    "dotenv": "^17.2.3",
    "motion": "^12.23.24"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.14.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.4.21",
    "esbuild": "^0.25.0",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.21.0",
    "typescript": "^7.0.2",
    "vite-plugin-pwa": "^2.0.0"
  }
}
2. metadata.json
JSON
{
  "name": "Pitch 11",
  "description": "2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout.",
  "requestFramePermissions": [],
  "majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
}
3. tsconfig.json
JSON
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "types": ["vite/client", "vite-plugin-pwa/client"],
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "exclude": ["dist"]
}
4. vite.config.ts
Ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'Pitch 11 — 2D Football',
          short_name: 'Pitch 11',
          description:
            '2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout.',
          theme_color: '#08120c',
          background_color: '#08120c',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
5. index.html
Html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <title>Pitch 11 — 2D 11v11 Football &amp; Penalty Shootout</title>
    <meta name="description" content="2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout." />
    <meta name="theme-color" content="#08120c" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Pitch 11" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta property="og:title" content="Pitch 11" />
    <meta property="og:description" content="2D 11v11 tactical football with smooth movement physics and an interactive penalty shootout." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-[#08120c] text-slate-50 antialiased overflow-hidden select-none">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
6. public/icon.svg
Svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="108" fill="#0B1F14"/>
  <rect x="28" y="28" width="456" height="456" rx="88" fill="#134E2E" stroke="#22C55E" stroke-opacity="0.35" stroke-width="6"/>
  <path d="M256 78L404 136V248C404 344 336 410 256 438C176 410 108 344 108 248V136L256 78Z" fill="#0F172A" stroke="#F8FAFC" stroke-width="14" stroke-linejoin="round"/>
  <path d="M256 112V402M148 220H364" stroke="#22C55E" stroke-opacity="0.55" stroke-width="10"/>
  <circle cx="256" cy="248" r="64" fill="#2563EB" stroke="#F8FAFC" stroke-width="12"/>
  <text x="256" y="269" text-anchor="middle" fill="#FFFFFF" font-size="62" font-weight="800" font-family="sans-serif">11</text>
</svg>
7. src/index.css
CSS
@import "tailwindcss";

@theme {
  --font-display: "Barlow Condensed", sans-serif;
  --font-sans: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

@layer base {
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    font-family: var(--font-sans);
    background-color: #08120c;
  }
}

.font-display {
  font-family: var(--font-display);
}

.font-mono-tabular {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
8. src/main.tsx
Tsx
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
9. src/game/types.ts
Ts
export type GameMode = 'MATCH' | 'PENALTY_SHOOTOUT';

export type ScreenState =
  | 'TITLE'
  | 'PLAYING'
  | 'PAUSED'
  | 'HALFTIME'
  | 'FULLTIME';

export type TeamSide = 'HOME' | 'AWAY';

export type PlayerRole = 'GK' | 'DEF' | 'MID' | 'FWD';

export type FormationId = '4-3-3' | '4-4-2' | '3-5-2';

export type Difficulty = 'AMATEUR' | 'PRO' | 'WORLD_CLASS';

export interface Player {
  id: string;
  team: TeamSide;
  number: number;
  role: PlayerRole;
  /** Normalized base formation anchor (0..1 across pitch length/width) */
  baseNx: number;
  baseNy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  stamina: number; // 0..100
  stridePhase: number;
  isSprinting: boolean;
  tackleTimer: number;
  tackleCooldown: number;
  stunTimer: number;
  kickAnimTimer: number;
  diveTimer: number;
  diveDirY: number;
  aiDecisionTimer: number;
}

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rotation: number;
  ownerId: string | null;
  lastTouchTeam: TeamSide | null;
  lastTouchPlayerId: string | null;
  pickupCooldown: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'turf' | 'chalk' | 'confetti' | 'spark';
}

export type KickOutcome = 'GOAL' | 'MISS' | 'SAVE' | null;

export type PenaltyPhase =
  | 'AIMING'
  | 'CHARGING'
  | 'RUNUP'
  | 'FLIGHT'
  | 'KEEPER_WAIT'
  | 'KEEPER_FLIGHT'
  | 'RESULT'
  | 'FINISHED';

export interface PenaltyState {
  phase: PenaltyPhase;
  turn: TeamSide;
  round: number; // 1-indexed
  suddenDeath: boolean;
  homeKicks: KickOutcome[];
  awayKicks: KickOutcome[];
  homeScore: number;
  awayScore: number;
  winner: TeamSide | null;
  /** Normalized aim inside/around goal frame: x in [-1.25..1.25], y in [0..1.25] (0=ground, 1=crossbar) */
  aimX: number;
  aimY: number;
  /** Shot power 0..1 */
  power: number;
  powerDir: number;
  /** Keeper dive target: x in [-1..1], y in [0..1] */
  keeperTargetX: number;
  keeperTargetY: number;
  keeperCurrX: number;
  keeperCurrY: number;
  keeperDiveCommitted: boolean;
  /** AI windup telegraph */
  aiWaitTimer: number;
  aiWaitDuration: number;
  aiCueX: number;
  /** Active shot animation state */
  kickerProgress: number; // 0..1 runup
  ballProgress: number; // 0..1 flight
  shotStartX: number;
  shotStartY: number;
  shotEndX: number;
  shotEndY: number;
  shotCurve: number;
  shotPeakZ: number;
  ballCurrX: number;
  ballCurrY: number;
  ballCurrZ: number;
  ballTrail: Array<{ x: number; y: number; z: number }>;
  netRippleX: number;
  netRippleY: number;
  netRippleStrength: number;
  resultTimer: number;
  resultBanner: string;
  resultSub: string;
}

export interface MatchStats {
  homeShots: number;
  awayShots: number;
  homeOnTarget: number;
  awayOnTarget: number;
  homePossessionTicks: number;
  awayPossessionTicks: number;
  homeSaves: number;
  awaySaves: number;
}

export interface HudSnapshot {
  screen: ScreenState;
  mode: GameMode;
  homeScore: number;
  awayScore: number;
  half: 1 | 2;
  clockSeconds: number;
  halfDurationSeconds: number;
  activePlayerNumber: number;
  activePlayerRole: PlayerRole;
  activePlayerStamina: number;
  shotCharge: number;
  goalBannerText: string | null;
  goalBannerSub: string | null;
  stats: MatchStats;
  penalty: {
    phase: PenaltyPhase;
    turn: TeamSide;
    round: number;
    suddenDeath: boolean;
    homeScore: number;
    awayScore: number;
    homeKicks: KickOutcome[];
    awayKicks: KickOutcome[];
    winner: TeamSide | null;
    resultBanner: string;
    resultSub: string;
    power: number;
    keeperCommitted: boolean;
  };
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Continuous -1..1 analog thumbstick vector for mobile touch */
  analogX: number;
  analogY: number;
  sprint: boolean;
  shootHeld: boolean;
  shootJustPressed: boolean;
  shootJustReleased: boolean;
  passJustPressed: boolean;
  throughJustPressed: boolean;
  mouseNormX: number; // -1..1 relative to penalty goal
  mouseNormY: number; // 0..1.25 relative to penalty goal
  mouseActive: boolean;
  mouseDown: boolean;
  mouseJustPressed: boolean;
  mouseJustReleased: boolean;
}
10. src/game/audio.ts
Ts
class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public playKick(power = 0.7): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const startFreq = 125 + power * 55;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);

    const vol = Math.min(0.45, 0.18 + power * 0.24);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playPass(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playSave(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.09);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playPostHit(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [420, 685, 1080];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.14 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  public playNetSwish(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playWhistle(kind: 'short' | 'double' | 'long'): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const scheduleBlast = (offset: number, dur: number) => {
      const start = ctx.currentTime + offset;
      const carrier = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();

      carrier.type = 'triangle';
      carrier.frequency.setValueAtTime(2850, start);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(42, start);
      lfoGain.gain.setValueAtTime(90, start);

      lfo.connect(lfoGain);
      lfoGain.connect(carrier.frequency);

      mainGain.gain.setValueAtTime(0.001, start);
      mainGain.gain.linearRampToValueAtTime(0.11, start + 0.02);
      mainGain.gain.setValueAtTime(0.1, start + Math.max(0.03, dur - 0.04));
      mainGain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      carrier.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start(start);
      carrier.start(start);
      lfo.stop(start + dur + 0.01);
      carrier.stop(start + dur + 0.01);
    };

    if (kind === 'short') {
      scheduleBlast(0, 0.18);
    } else if (kind === 'double') {
      scheduleBlast(0, 0.14);
      scheduleBlast(0.2, 0.22);
    } else {
      scheduleBlast(0, 0.45);
    }
  }

  public playCrowdGoal(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const dur = 1.45;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 3.5;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.linearRampToValueAtTime(760, now + 0.35);
    filter.Q.setValueAtTime(0.7, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }
}

export const soundEngine = new SoundEngine();
11. src/game/formations.ts
Ts
import type { FormationId, Player, PlayerRole, TeamSide } from './types';

export interface FormationSlot {
  number: number;
  role: PlayerRole;
  /** Normalized pitch position for HOME team attacking left -> right (0.04..0.95) */
  nx: number;
  /** Normalized pitch width (0.08..0.92) */
  ny: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.21, ny: 0.16 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.21, ny: 0.84 },
    { number: 6, role: 'MID', nx: 0.33, ny: 0.5 },
    { number: 8, role: 'MID', nx: 0.39, ny: 0.28 },
    { number: 10, role: 'MID', nx: 0.39, ny: 0.72 },
    { number: 7, role: 'FWD', nx: 0.465, ny: 0.18 },
    { number: 9, role: 'FWD', nx: 0.48, ny: 0.5 },
    { number: 11, role: 'FWD', nx: 0.465, ny: 0.82 },
  ],
  '4-4-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.2, ny: 0.15 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.2, ny: 0.85 },
    { number: 7, role: 'MID', nx: 0.37, ny: 0.14 },
    { number: 6, role: 'MID', nx: 0.34, ny: 0.38 },
    { number: 8, role: 'MID', nx: 0.34, ny: 0.62 },
    { number: 11, role: 'MID', nx: 0.37, ny: 0.86 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.39 },
    { number: 10, role: 'FWD', nx: 0.475, ny: 0.61 },
  ],
  '3-5-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 4, role: 'DEF', nx: 0.18, ny: 0.26 },
    { number: 5, role: 'DEF', nx: 0.16, ny: 0.5 },
    { number: 3, role: 'DEF', nx: 0.18, ny: 0.74 },
    { number: 2, role: 'MID', nx: 0.35, ny: 0.12 },
    { number: 6, role: 'MID', nx: 0.31, ny: 0.36 },
    { number: 8, role: 'MID', nx: 0.31, ny: 0.64 },
    { number: 10, role: 'MID', nx: 0.4, ny: 0.5 },
    { number: 7, role: 'MID', nx: 0.35, ny: 0.88 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.38 },
    { number: 11, role: 'FWD', nx: 0.475, ny: 0.62 },
  ],
};

export const PITCH = {
  worldW: 1700,
  worldH: 1060,
  marginX: 110,
  marginY: 90,
  fieldW: 1480,
  fieldH: 880,
  goalW: 52,
  goalH: 184,
  penaltyBoxW: 230,
  penaltyBoxH: 460,
  sixYardW: 82,
  sixYardH: 240,
  penaltySpotDist: 162,
  centerCircleR: 124,
  playerRadius: 15,
  ballRadius: 8.5,
} as const;

export function createTeamPlayers(
  team: TeamSide,
  formation: FormationId,
): Player[] {
  const slots = FORMATIONS[formation];
  return slots.map((slot, idx) => {
    const nx = team === 'HOME' ? slot.nx : 1 - slot.nx;
    const ny = team === 'HOME' ? slot.ny : 1 - slot.ny;
    const x = PITCH.marginX + nx * PITCH.fieldW;
    const y = PITCH.marginY + ny * PITCH.fieldH;
    return {
      id: `${team}_${slot.number}_${idx}`,
      team,
      number: slot.number,
      role: slot.role,
      baseNx: nx,
      baseNy: ny,
      x,
      y,
      vx: 0,
      vy: 0,
      facing: team === 'HOME' ? 0 : Math.PI,
      stamina: 100,
      stridePhase: (idx * 0.7) % (Math.PI * 2),
      isSprinting: false,
      tackleTimer: 0,
      tackleCooldown: 0,
      stunTimer: 0,
      kickAnimTimer: 0,
      diveTimer: 0,
      diveDirY: 0,
      aiDecisionTimer: 0.08 * idx,
    };
  });
}
12. src/game/penaltyEngine.ts
Ts
import { soundEngine } from './audio';
import type { Difficulty, InputState, KickOutcome, PenaltyState, TeamSide } from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createPenaltyState(): PenaltyState {
  return {
    phase: 'AIMING',
    turn: 'HOME',
    round: 1,
    suddenDeath: false,
    homeKicks: [null, null, null, null, null],
    awayKicks: [null, null, null, null, null],
    homeScore: 0,
    awayScore: 0,
    winner: null,
    aimX: 0.48,
    aimY: 0.35,
    power: 0,
    powerDir: 1,
    keeperTargetX: 0,
    keeperTargetY: 0.35,
    keeperCurrX: 0,
    keeperCurrY: 0.32,
    keeperDiveCommitted: false,
    aiWaitTimer: 0,
    aiWaitDuration: 1.2,
    aiCueX: 0,
    kickerProgress: 0,
    ballProgress: 0,
    shotStartX: 0,
    shotStartY: 0,
    shotEndX: 0,
    shotEndY: 0.3,
    shotCurve: 0,
    shotPeakZ: 0.3,
    ballCurrX: 0,
    ballCurrY: 0,
    ballCurrZ: 0,
    ballTrail: [],
    netRippleX: 0,
    netRippleY: 0.5,
    netRippleStrength: 0,
    resultTimer: 0,
    resultBanner: '',
    resultSub: '',
  };
}

function checkWinner(p: PenaltyState): TeamSide | null {
  const homeTaken = p.homeKicks.filter((k) => k !== null).length;
  const awayTaken = p.awayKicks.filter((k) => k !== null).length;

  if (!p.suddenDeath && homeTaken <= 5 && awayTaken <= 5) {
    const homeRem = 5 - homeTaken;
    const awayRem = 5 - awayTaken;
    if (p.homeScore > p.awayScore + awayRem) return 'HOME';
    if (p.awayScore > p.homeScore + homeRem) return 'AWAY';
    if (homeTaken === 5 && awayTaken === 5) {
      if (p.homeScore > p.awayScore) return 'HOME';
      if (p.awayScore > p.homeScore) return 'AWAY';
      // Tied after 5 kicks -> Sudden Death!
      p.suddenDeath = true;
      p.homeKicks.push(null);
      p.awayKicks.push(null);
    }
    return null;
  }

  // Sudden death: both teams must take equal number of kicks in the round
  if (homeTaken === awayTaken) {
    if (p.homeScore > p.awayScore) return 'HOME';
    if (p.awayScore > p.homeScore) return 'AWAY';
    p.homeKicks.push(null);
    p.awayKicks.push(null);
  }
  return null;
}

function prepareNextKick(p: PenaltyState): void {
  const winner = checkWinner(p);
  if (winner) {
    p.winner = winner;
    p.phase = 'FINISHED';
    p.resultBanner = winner === 'HOME' ? 'VICTORY ON PENALTIES' : 'SHOOTOUT DEFEAT';
    p.resultSub = `${p.homeScore} – ${p.awayScore} FINAL`;
    soundEngine.playWhistle('long');
    if (winner === 'HOME') {
      soundEngine.playCrowdGoal();
    }
    return;
  }

  // Switch turns
  if (p.turn === 'HOME') {
    p.turn = 'AWAY';
    p.phase = 'KEEPER_WAIT';
    p.aiWaitTimer = 0;
    p.aiWaitDuration = 1.05 + Math.random() * 0.55;
    // AI chooses target
    const cornerSign = Math.random() < 0.5 ? -1 : 1;
    const isCenter = Math.random() < 0.16;
    p.aiCueX = isCenter ? (Math.random() - 0.5) * 0.18 : cornerSign * (0.55 + Math.random() * 0.34);
    p.aimX = p.aiCueX;
    p.aimY = 0.15 + Math.random() * 0.65;
    p.keeperTargetX = 0;
    p.keeperTargetY = 0.32;
    p.keeperCurrX = 0;
    p.keeperCurrY = 0.32;
    p.keeperDiveCommitted = false;
  } else {
    p.turn = 'HOME';
    p.round += 1;
    p.phase = 'AIMING';
    p.power = 0;
    p.powerDir = 1;
    p.keeperTargetX = 0;
    p.keeperTargetY = 0.32;
    p.keeperCurrX = 0;
    p.keeperCurrY = 0.32;
    p.keeperDiveCommitted = false;
  }

  p.kickerProgress = 0;
  p.ballProgress = 0;
  p.ballCurrX = 0;
  p.ballCurrY = 0;
  p.ballCurrZ = 0;
  p.ballTrail = [];
  p.resultBanner = '';
  p.resultSub = '';
}

function recordOutcome(
  p: PenaltyState,
  outcome: Exclude<KickOutcome, null>,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  const idx = p.round - 1;
  if (p.turn === 'HOME') {
    p.homeKicks[idx] = outcome;
    if (outcome === 'GOAL') p.homeScore += 1;
  } else {
    p.awayKicks[idx] = outcome;
    if (outcome === 'GOAL') p.awayScore += 1;
  }

  if (outcome === 'GOAL') {
    p.resultBanner = 'GOAL!';
    p.resultSub = p.turn === 'HOME' ? 'Clinical finish' : 'Unstoppable strike';
    soundEngine.playNetSwish();
    soundEngine.playCrowdGoal();
    onShake(7);
    onBurst('confetti', p.shotEndX, p.shotEndY, p.turn === 'HOME' ? '#3b82f6' : '#ef4444');
  } else if (outcome === 'SAVE') {
    p.resultBanner = 'SAVED!';
    p.resultSub = p.turn === 'AWAY' ? 'Brilliant stop by the keeper' : 'Keeper guessed right';
    soundEngine.playSave();
    if (p.turn === 'AWAY') soundEngine.playCrowdGoal();
    onShake(5);
    onBurst('spark', p.shotEndX, p.shotEndY, '#facc15');
  } else {
    p.resultBanner = Math.abs(p.shotEndX) > 0.96 && Math.abs(p.shotEndX) < 1.07 && p.shotEndY <= 1.04
      ? 'OFF THE WOODWORK!'
      : 'OFF TARGET!';
    p.resultSub = p.shotEndY > 1.0 ? 'Over the crossbar' : 'Wide of the post';
    if (Math.abs(p.shotEndX) > 0.96 && Math.abs(p.shotEndX) < 1.07 && p.shotEndY <= 1.04) {
      soundEngine.playPostHit();
      onShake(8);
    }
  }

  p.phase = 'RESULT';
  p.resultTimer = 1.45;
}

export function updatePenaltyState(
  p: PenaltyState,
  dt: number,
  input: InputState,
  difficulty: Difficulty,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  // Decay net ripple
  p.netRippleStrength = Math.max(0, p.netRippleStrength - dt * 2.4);

  if (p.phase === 'FINISHED') return;

  if (p.phase === 'RESULT') {
    p.resultTimer -= dt;
    if (p.resultTimer <= 0) {
      prepareNextKick(p);
    }
    return;
  }

  // PLAYER TAKING PENALTY (HOME TURN)
  if (p.turn === 'HOME') {
    if (p.phase === 'AIMING' || p.phase === 'CHARGING') {
      // Smooth keyboard aiming
      const aimSpeed = 1.55;
      if (input.left) p.aimX -= aimSpeed * dt;
      if (input.right) p.aimX += aimSpeed * dt;
      if (input.up) p.aimY += aimSpeed * dt;
      if (input.down) p.aimY -= aimSpeed * dt;

      // Mouse aiming inside penalty goal viewport
      if (input.mouseActive && p.phase === 'AIMING') {
        p.aimX += (input.mouseNormX - p.aimX) * Math.min(1, dt * 16);
        p.aimY += (input.mouseNormY - p.aimY) * Math.min(1, dt * 16);
      }

      p.aimX = clamp(p.aimX, -1.16, 1.16);
      p.aimY = clamp(p.aimY, 0.05, 1.18);

      const triggerDown = input.shootJustPressed || input.mouseJustPressed;
      const triggerHeld = input.shootHeld || input.mouseDown;
      const triggerUp = input.shootJustReleased || input.mouseJustReleased;

      if (p.phase === 'AIMING' && triggerDown) {
        p.phase = 'CHARGING';
        p.power = 0.12;
        p.powerDir = 1;
      } else if (p.phase === 'CHARGING') {
        p.power += p.powerDir * dt * 1.45;
        if (p.power >= 1) {
          p.power = 1;
          p.powerDir = -1;
        } else if (p.power <= 0.1) {
          p.power = 0.1;
          p.powerDir = 1;
        }

        if (triggerUp || !triggerHeld) {
          // Lock shot & start runup
          p.phase = 'RUNUP';
          p.kickerProgress = 0;

          // AI Keeper picks dive zone based on difficulty
          const readChance =
            difficulty === 'WORLD_CLASS' ? 0.44 : difficulty === 'PRO' ? 0.3 : 0.18;
          if (Math.random() < readChance) {
            p.keeperTargetX = clamp(p.aimX * 0.85, -0.88, 0.88);
            p.keeperTargetY = clamp(p.aimY * 0.82, 0.14, 0.78);
          } else {
            const zones = [-0.78, -0.35, 0, 0.35, 0.78];
            p.keeperTargetX = zones[Math.floor(Math.random() * zones.length)];
            p.keeperTargetY = 0.18 + Math.random() * 0.55;
          }

          // Compute final shot target with overcharge variance
          const overcharge = Math.max(0, p.power - 0.84) / 0.16; // 0..1
          const scatterX = (Math.random() - 0.5) * (0.06 + overcharge * 0.28);
          const scatterY = (Math.random() - 0.5) * (0.04 + overcharge * 0.22) + overcharge * 0.16;

          p.shotStartX = 0;
          p.shotStartY = 0;
          p.shotEndX = clamp(p.aimX + scatterX, -1.28, 1.28);
          p.shotEndY = clamp(p.aimY + scatterY, 0.05, 1.32);
          p.shotCurve = -p.aimX * (0.14 + p.power * 0.12);
          p.shotPeakZ = 0.25 + p.power * 0.4;
          p.ballProgress = 0;
          p.ballTrail = [];
        }
      }
      return;
    }

    if (p.phase === 'RUNUP') {
      p.kickerProgress += dt * 2.4;
      if (p.kickerProgress >= 1) {
        p.kickerProgress = 1;
        p.phase = 'FLIGHT';
        soundEngine.playKick(p.power);
        onShake(3.5 * p.power);
      }
      return;
    }

    if (p.phase === 'FLIGHT') {
      const flightSpeed = 1.65 + p.power * 1.15;
      p.ballProgress = Math.min(1, p.ballProgress + dt * flightSpeed);
      const t = p.ballProgress;

      // Keeper dives smoothly once ball is struck
      const keeperLerp = Math.min(1, dt * 6.5);
      p.keeperCurrX += (p.keeperTargetX - p.keeperCurrX) * keeperLerp;
      p.keeperCurrY += (p.keeperTargetY - p.keeperCurrY) * keeperLerp;

      // Quadratic Bezier curve for ball lateral + height
      const inv = 1 - t;
      const midX = p.shotEndX * 0.5 + p.shotCurve;
      p.ballCurrX = 2 * inv * t * midX + t * t * p.shotEndX;
      p.ballCurrY = t; // 0 = spot, 1 = goal line
      const arcLift = Math.sin(t * Math.PI) * 0.16 * (1 - p.power * 0.5);
      p.ballCurrZ = t * p.shotEndY + arcLift;

      p.ballTrail.push({ x: p.ballCurrX, y: p.ballCurrY, z: p.ballCurrZ });
      if (p.ballTrail.length > 14) p.ballTrail.shift();

      if (p.ballProgress >= 1) {
        resolveShotAtLine(p, onBurst, onShake);
      }
      return;
    }
  }

  // PLAYER DEFENDING AS GOALKEEPER (AWAY TURN)
  if (p.turn === 'AWAY') {
    if (p.phase === 'KEEPER_WAIT') {
      // Allow player to pick dive direction via WASD/Arrows or click on goal
      let diveChosen = false;
      let tx = p.keeperTargetX;
      let ty = p.keeperTargetY;

      if (input.left) {
        tx = -0.82;
        diveChosen = true;
      } else if (input.right) {
        tx = 0.82;
        diveChosen = true;
      }
      if (input.up) {
        ty = 0.72;
        diveChosen = true;
      } else if (input.down) {
        ty = 0.16;
        diveChosen = true;
      }

      if (input.mouseJustPressed && input.mouseActive) {
        tx = clamp(input.mouseNormX, -0.92, 0.92);
        ty = clamp(input.mouseNormY, 0.14, 0.85);
        diveChosen = true;
      }

      if (diveChosen) {
        p.keeperTargetX = tx;
        p.keeperTargetY = ty;
        p.keeperDiveCommitted = true;
      }

      p.aiWaitTimer += dt;
      if (p.aiWaitTimer >= p.aiWaitDuration) {
        p.phase = 'KEEPER_FLIGHT';
        p.kickerProgress = 1;
        p.ballProgress = 0;
        p.ballTrail = [];

        const aiMissChance =
          difficulty === 'AMATEUR' ? 0.18 : difficulty === 'PRO' ? 0.09 : 0.04;
        const misses = Math.random() < aiMissChance;
        p.shotStartX = 0;
        p.shotStartY = 0;
        if (misses) {
          p.shotEndX = (Math.random() < 0.5 ? -1 : 1) * (1.06 + Math.random() * 0.14);
          p.shotEndY = 0.35 + Math.random() * 0.78;
        } else {
          p.shotEndX = clamp(p.aiCueX + (Math.random() - 0.5) * 0.14, -0.91, 0.91);
          p.shotEndY = clamp(p.aimY, 0.12, 0.86);
        }
        p.power = difficulty === 'WORLD_CLASS' ? 0.82 : difficulty === 'PRO' ? 0.68 : 0.54;
        p.shotCurve = -p.shotEndX * 0.18;
        soundEngine.playKick(p.power);
      }
      return;
    }

    if (p.phase === 'KEEPER_FLIGHT') {
      // Late reaction dive still allowed in first 45% of ball flight!
      if (!p.keeperDiveCommitted || p.ballProgress < 0.45) {
        if (input.left) {
          p.keeperTargetX = -0.82;
          p.keeperDiveCommitted = true;
        } else if (input.right) {
          p.keeperTargetX = 0.82;
          p.keeperDiveCommitted = true;
        }
        if (input.up) {
          p.keeperTargetY = 0.72;
          p.keeperDiveCommitted = true;
        } else if (input.down) {
          p.keeperTargetY = 0.16;
          p.keeperDiveCommitted = true;
        }
        if (input.mouseJustPressed && input.mouseActive) {
          p.keeperTargetX = clamp(input.mouseNormX, -0.92, 0.92);
          p.keeperTargetY = clamp(input.mouseNormY, 0.14, 0.85);
          p.keeperDiveCommitted = true;
        }
      }

      const flightSpeed = 1.35 + p.power * 0.9;
      p.ballProgress = Math.min(1, p.ballProgress + dt * flightSpeed);
      const t = p.ballProgress;

      if (p.keeperDiveCommitted) {
        const keeperLerp = Math.min(1, dt * 8.2);
        p.keeperCurrX += (p.keeperTargetX - p.keeperCurrX) * keeperLerp;
        p.keeperCurrY += (p.keeperTargetY - p.keeperCurrY) * keeperLerp;
      }

      const inv = 1 - t;
      const midX = p.shotEndX * 0.5 + p.shotCurve;
      p.ballCurrX = 2 * inv * t * midX + t * t * p.shotEndX;
      p.ballCurrY = t;
      const arcLift = Math.sin(t * Math.PI) * 0.14;
      p.ballCurrZ = t * p.shotEndY + arcLift;

      p.ballTrail.push({ x: p.ballCurrX, y: p.ballCurrY, z: p.ballCurrZ });
      if (p.ballTrail.length > 14) p.ballTrail.shift();

      if (p.ballProgress >= 1) {
        resolveShotAtLine(p, onBurst, onShake);
      }
    }
  }
}

function resolveShotAtLine(
  p: PenaltyState,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  const bx = p.shotEndX;
  const by = p.shotEndY;

  const insidePosts = Math.abs(bx) < 0.96 && by <= 0.96 && by >= 0.02;

  if (!insidePosts) {
    recordOutcome(p, 'MISS', onBurst, onShake);
    return;
  }

  // Check keeper reach
  const dx = Math.abs(bx - p.keeperCurrX);
  const dy = Math.abs(by - p.keeperCurrY);
  const reachX = p.turn === 'AWAY' ? 0.34 : 0.28;
  const reachY = p.turn === 'AWAY' ? 0.36 : 0.32;
  const dist = Math.hypot(dx / reachX, dy / reachY);

  // Sweet spot power makes corners harder to save
  const powerBonus = p.power > 0.52 && p.power < 0.86 ? 0.16 : 0;

  if (dist < 1.0 - powerBonus) {
    recordOutcome(p, 'SAVE', onBurst, onShake);
    return;
  }

  p.netRippleX = bx;
  p.netRippleY = by;
  p.netRippleStrength = 1;
  recordOutcome(p, 'GOAL', onBurst, onShake);
}
13. src/game/matchEngine.ts
Ts
import { soundEngine } from './audio';
import { createTeamPlayers, PITCH } from './formations';
import { createPenaltyState, updatePenaltyState } from './penaltyEngine';
import type {
  Ball,
  Difficulty,
  FormationId,
  GameMode,
  HudSnapshot,
  InputState,
  MatchStats,
  Particle,
  PenaltyState,
  Player,
  ScreenState,
  TeamSide,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class GameEngine {
  public screen: ScreenState = 'TITLE';
  public mode: GameMode = 'MATCH';
  public formation: FormationId = '4-3-3';
  public awayFormation: FormationId = '4-4-2';
  public difficulty: Difficulty = 'PRO';
  public halfDurationSeconds = 90;

  public players: Player[] = [];
  public ball: Ball;
  public activePlayerId = '';
  public passTargetId: string | null = null;

  public homeScore = 0;
  public awayScore = 0;
  public half: 1 | 2 = 1;
  public clockSeconds = 0;

  public stats: MatchStats = {
    homeShots: 0,
    awayShots: 0,
    homeOnTarget: 0,
    awayOnTarget: 0,
    homePossessionTicks: 0,
    awayPossessionTicks: 0,
    homeSaves: 0,
    awaySaves: 0,
  };

  public shotCharge = 0;
  public isChargingShot = false;
  public goalBannerText: string | null = null;
  public goalBannerSub: string | null = null;
  private goalResetTimer = 0;
  private hitstopTimer = 0;

  public cameraX = PITCH.worldW / 2;
  public cameraY = PITCH.worldH / 2;
  public cameraZoom = 1;
  public shakeAmount = 0;
  private titlePanTime = 0;

  public netLeftRipple = 0;
  public netRightRipple = 0;

  public particles: Particle[] = [];
  public penalty: PenaltyState = createPenaltyState();

  private kickoffTeam: TeamSide = 'HOME';

  constructor() {
    this.ball = this.createCenterBall();
    for (let i = 0; i < 160; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 3,
        alpha: 1,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        kind: 'turf',
      });
    }
    this.setupTeams();
  }

  private createCenterBall(): Ball {
    return {
      x: PITCH.worldW / 2,
      y: PITCH.worldH / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      rotation: 0,
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerId: null,
      pickupCooldown: 0,
    };
  }

  public setupTeams(): void {
    const home = createTeamPlayers('HOME', this.formation);
    const away = createTeamPlayers('AWAY', this.awayFormation);
    this.players = [...home, ...away];
    const striker = home.find((p) => p.number === 9) || home[10];
    this.activePlayerId = striker.id;
    this.resetPositionsForKickoff(this.kickoffTeam);
  }

  public startNewMatch(
    mode: GameMode,
    formation: FormationId,
    difficulty: Difficulty,
  ): void {
    this.mode = mode;
    this.formation = formation;
    this.awayFormation = formation === '4-4-2' ? '4-3-3' : '4-4-2';
    this.difficulty = difficulty;
    this.homeScore = 0;
    this.awayScore = 0;
    this.half = 1;
    this.clockSeconds = 0;
    this.shotCharge = 0;
    this.isChargingShot = false;
    this.goalBannerText = null;
    this.goalBannerSub = null;
    this.goalResetTimer = 0;
    this.kickoffTeam = 'HOME';
    this.stats = {
      homeShots: 0,
      awayShots: 0,
      homeOnTarget: 0,
      awayOnTarget: 0,
      homePossessionTicks: 0,
      awayPossessionTicks: 0,
      homeSaves: 0,
      awaySaves: 0,
    };

    if (mode === 'PENALTY_SHOOTOUT') {
      this.penalty = createPenaltyState();
      this.screen = 'PLAYING';
      soundEngine.playWhistle('short');
      return;
    }

    this.setupTeams();
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  public startPenaltyFromDraw(): void {
    this.mode = 'PENALTY_SHOOTOUT';
    this.penalty = createPenaltyState();
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  public resumeSecondHalf(): void {
    this.half = 2;
    this.clockSeconds = this.halfDurationSeconds;
    this.kickoffTeam = 'AWAY';
    this.resetPositionsForKickoff('AWAY');
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  private resetPositionsForKickoff(teamWithKickoff: TeamSide): void {
    const cx = PITCH.worldW / 2;
    const cy = PITCH.worldH / 2;
    this.ball = this.createCenterBall();

    for (const p of this.players) {
      const anchorX = PITCH.marginX + p.baseNx * PITCH.fieldW;
      const anchorY = PITCH.marginY + p.baseNy * PITCH.fieldH;
      // Keep players on their own half
      if (p.team === 'HOME') {
        p.x = Math.min(cx - 26, anchorX);
      } else {
        p.x = Math.max(cx + 26, anchorX);
      }
      p.y = anchorY;
      p.vx = 0;
      p.vy = 0;
      p.facing = p.team === 'HOME' ? 0 : Math.PI;
      p.tackleTimer = 0;
      p.stunTimer = 0;
      p.diveTimer = 0;
    }

    // Place kickoff striker near center spot
    const kickoffStriker = this.players.find(
      (p) => p.team === teamWithKickoff && p.role === 'FWD',
    );
    if (kickoffStriker) {
      kickoffStriker.x = teamWithKickoff === 'HOME' ? cx - 22 : cx + 22;
      kickoffStriker.y = cy;
      if (teamWithKickoff === 'HOME') {
        this.activePlayerId = kickoffStriker.id;
      }
    }
  }

  public spawnParticle(
    kind: Particle['kind'],
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: string,
    size: number,
    maxLife: number,
  ): void {
    for (const pt of this.particles) {
      if (!pt.active) {
        pt.active = true;
        pt.kind = kind;
        pt.x = x;
        pt.y = y;
        pt.z = z;
        pt.vx = vx;
        pt.vy = vy;
        pt.vz = vz;
        pt.color = color;
        pt.size = size;
        pt.life = 0;
        pt.maxLife = maxLife;
        pt.alpha = 1;
        return;
      }
    }
  }

  private burstParticles(
    kind: 'turf' | 'chalk' | 'confetti' | 'spark',
    x: number,
    y: number,
    color: string,
    count = 16,
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 190;
      this.spawnParticle(
        kind,
        x,
        y,
        4,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        60 + Math.random() * 120,
        color,
        kind === 'confetti' ? 5 + Math.random() * 4 : 3 + Math.random() * 3,
        kind === 'confetti' ? 1.1 + Math.random() * 0.6 : 0.35 + Math.random() * 0.25,
      );
    }
  }

  public update(rawDt: number, input: InputState): void {
    const dt = Math.min(rawDt, 0.05);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 22);
    this.netLeftRipple = Math.max(0, this.netLeftRipple - dt * 2.2);
    this.netRightRipple = Math.max(0, this.netRightRipple - dt * 2.2);
    this.updateParticles(dt);

    if (this.screen === 'TITLE') {
      this.updateTitleAmbient(dt);
      return;
    }

    if (this.screen !== 'PLAYING') {
      return;
    }

    if (this.mode === 'PENALTY_SHOOTOUT') {
      updatePenaltyState(
        this.penalty,
        dt,
        input,
        this.difficulty,
        (kind, nx, ny, color) => {
          // Map normalized goal coords to world preview burst
          this.burstParticles(kind, 850 + nx * 240, 380 - ny * 140, color, 26);
        },
        (amt) => {
          this.shakeAmount = Math.max(this.shakeAmount, amt);
        },
      );
      return;
    }

    // 11v11 Match Simulation
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    if (this.goalResetTimer > 0) {
      this.goalResetTimer -= dt;
      this.updateBallPhysics(dt, false);
      if (this.goalResetTimer <= 0) {
        this.goalBannerText = null;
        this.goalBannerSub = null;
        this.resetPositionsForKickoff(this.kickoffTeam);
        soundEngine.playWhistle('short');
      }
      this.updateCamera(dt);
      return;
    }

    // Advance match clock
    this.clockSeconds += dt;
    if (this.half === 1 && this.clockSeconds >= this.halfDurationSeconds) {
      this.clockSeconds = this.halfDurationSeconds;
      this.screen = 'HALFTIME';
      this.isChargingShot = false;
      this.shotCharge = 0;
      soundEngine.playWhistle('double');
      return;
    }
    if (this.half === 2 && this.clockSeconds >= this.halfDurationSeconds * 2) {
      this.clockSeconds = this.halfDurationSeconds * 2;
      this.screen = 'FULLTIME';
      this.isChargingShot = false;
      this.shotCharge = 0;
      soundEngine.playWhistle('long');
      return;
    }

    if (this.ball.pickupCooldown > 0) {
      this.ball.pickupCooldown -= dt;
    }

    this.handleUserInput(dt, input);
    this.updateAI(dt);
    this.updatePlayers(dt);
    this.resolvePlayerCollisions();
    this.updateBallPhysics(dt, true);
    this.updateCamera(dt);

    // Track possession
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner?.team === 'HOME') this.stats.homePossessionTicks += 1;
      else if (owner?.team === 'AWAY') this.stats.awayPossessionTicks += 1;
    }
  }

  private updateTitleAmbient(dt: number): void {
    this.titlePanTime += dt;
    // Gentle AI vs AI ambient warm-up scrimmage on pitch
    this.updateAI(dt, true);
    this.updatePlayers(dt);
    this.resolvePlayerCollisions();
    this.updateBallPhysics(dt, false);
    // Keep ball inside field smoothly
    const minX = PITCH.marginX + 60;
    const maxX = PITCH.marginX + PITCH.fieldW - 60;
    const minY = PITCH.marginY + 60;
    const maxY = PITCH.marginY + PITCH.fieldH - 60;
    if (this.ball.x < minX || this.ball.x > maxX) {
      this.ball.vx *= -0.8;
      this.ball.x = clamp(this.ball.x, minX, maxX);
    }
    if (this.ball.y < minY || this.ball.y > maxY) {
      this.ball.vy *= -0.8;
      this.ball.y = clamp(this.ball.y, minY, maxY);
    }
    this.cameraX =
      PITCH.worldW / 2 + Math.sin(this.titlePanTime * 0.22) * 180;
    this.cameraY =
      PITCH.worldH / 2 + Math.cos(this.titlePanTime * 0.17) * 85;
  }

  private updateParticles(dt: number): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z = Math.max(0, pt.z + pt.vz * dt);
      pt.vz -= 280 * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.alpha = 1 - pt.life / pt.maxLife;
    }
  }

  private getActivePlayer(): Player | undefined {
    return this.players.find((p) => p.id === this.activePlayerId);
  }

  private findBestPassTarget(passer: Player, aimDirX: number, aimDirY: number): Player | null {
    let best: Player | null = null;
    let bestScore = -Infinity;

    for (const teammate of this.players) {
      if (teammate.team !== passer.team || teammate.id === passer.id) continue;
      const dx = teammate.x - passer.x;
      const dy = teammate.y - passer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 35 || dist > 680) continue;

      const dot = (dx * aimDirX + dy * aimDirY) / dist;
      // Prefer teammates roughly in the aimed direction and within crisp passing range
      const score = dot * 2.2 - dist / 480 + (teammate.role !== 'GK' ? 0.25 : -0.4);
      if (dot > -0.1 && score > bestScore) {
        bestScore = score;
        best = teammate;
      }
    }
    return best;
  }

  private switchToNearestHomePlayer(): void {
    const outfield = this.players.filter(
      (p) => p.team === 'HOME' && p.role !== 'GK' && p.id !== this.activePlayerId,
    );
    let best: Player | null = null;
    let bestDist = Infinity;
    const predictX = this.ball.x + this.ball.vx * 0.22;
    const predictY = this.ball.y + this.ball.vy * 0.22;

    for (const p of outfield) {
      const d = Math.hypot(p.x - predictX, p.y - predictY);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) {
      this.activePlayerId = best.id;
    }
  }

  private handleUserInput(dt: number, input: InputState): void {
    let active = this.getActivePlayer();
    if (!active) return;

    // Auto-switch if user is controlling a distant player and a teammate picks up the ball
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner && owner.team === 'HOME' && owner.id !== active.id) {
        this.activePlayerId = owner.id;
        active = owner;
      }
    }

    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (Math.hypot(input.analogX, input.analogY) > 0.08) {
      ix = input.analogX;
      iy = input.analogY;
    }
    const rawMag = Math.hypot(ix, iy);
    const mag = Math.min(1, rawMag);
    if (rawMag > 1) {
      ix /= rawMag;
      iy /= rawMag;
    }

    const hasBall = this.ball.ownerId === active.id;

    // Smooth acceleration & sprint mechanics
    if (active.stunTimer <= 0 && active.tackleTimer <= 0 && active.diveTimer <= 0) {
      const wantsSprint = input.sprint && active.stamina > 6 && mag > 0;
      active.isSprinting = wantsSprint;
      const maxSpeed = wantsSprint ? (hasBall ? 305 : 335) : hasBall ? 225 : 245;
      const accel = 1350;

      if (mag > 0) {
        active.vx += ix * accel * dt;
        active.vy += iy * accel * dt;
        const speed = Math.hypot(active.vx, active.vy);
        if (speed > maxSpeed) {
          active.vx = (active.vx / speed) * maxSpeed;
          active.vy = (active.vy / speed) * maxSpeed;
        }
        const targetFacing = Math.atan2(iy, ix);
        active.facing = lerpAngle(active.facing, targetFacing, Math.min(1, dt * 15));

        if (wantsSprint) {
          active.stamina = Math.max(0, active.stamina - 24 * dt);
          if (Math.random() < dt * 9) {
            this.spawnParticle(
              'turf',
              active.x - Math.cos(active.facing) * 10,
              active.y - Math.sin(active.facing) * 10,
              2,
              -active.vx * 0.2 + (Math.random() - 0.5) * 30,
              -active.vy * 0.2 + (Math.random() - 0.5) * 30,
              35,
              '#22c55e',
              2.6,
              0.28,
            );
          }
        }
      } else {
        const drag = Math.exp(-9.5 * dt);
        active.vx *= drag;
        active.vy *= drag;
        active.isSprinting = false;
      }
    }

    // Update pass target indicator when on the ball
    const aimX = mag > 0 ? ix : Math.cos(active.facing);
    const aimY = mag > 0 ? iy : Math.sin(active.facing);
    this.passTargetId = hasBall
      ? this.findBestPassTarget(active, aimX, aimY)?.id ?? null
      : null;

    if (hasBall) {
      // PASS
      if (input.passJustPressed) {
        const target = this.findBestPassTarget(active, aimX, aimY);
        this.executePass(active, target, aimX, aimY, false);
        this.isChargingShot = false;
        this.shotCharge = 0;
        return;
      }
      // THROUGH PASS
      if (input.throughJustPressed) {
        const target = this.findBestPassTarget(active, aimX, aimY);
        this.executePass(active, target, aimX, aimY, true);
        this.isChargingShot = false;
        this.shotCharge = 0;
        return;
      }
      // POWER SHOT
      if (input.shootJustPressed) {
        this.isChargingShot = true;
        this.shotCharge = 0.14;
      }
      if (this.isChargingShot && input.shootHeld) {
        this.shotCharge = Math.min(1, this.shotCharge + dt * 1.45);
      }
      if (this.isChargingShot && input.shootJustReleased) {
        this.executeShot(active, this.shotCharge, aimX, aimY);
        this.isChargingShot = false;
        this.shotCharge = 0;
      }
    } else {
      this.isChargingShot = false;
      this.shotCharge = 0;

      // SWITCH PLAYER
      if (input.passJustPressed || input.throughJustPressed) {
        this.switchToNearestHomePlayer();
      }

      // SLIDE TACKLE
      if (
        input.shootJustPressed &&
        active.tackleCooldown <= 0 &&
        active.stunTimer <= 0
      ) {
        active.tackleTimer = 0.26;
        active.tackleCooldown = 0.9;
        const dirX = mag > 0 ? ix : Math.cos(active.facing);
        const dirY = mag > 0 ? iy : Math.sin(active.facing);
        active.facing = Math.atan2(dirY, dirX);
        active.vx = dirX * 440;
        active.vy = dirY * 440;
        this.burstParticles('turf', active.x, active.y, '#16a34a', 7);
      }
    }
  }

  private executePass(
    passer: Player,
    target: Player | null,
    fallbackDirX: number,
    fallbackDirY: number,
    isThrough: boolean,
  ): void {
    this.ball.ownerId = null;
    this.ball.pickupCooldown = 0.16;
    this.ball.lastTouchTeam = passer.team;
    this.ball.lastTouchPlayerId = passer.id;
    passer.kickAnimTimer = 0.22;

    let tx: number;
    let ty: number;
    if (target) {
      const lead = isThrough ? 0.55 : 0.26;
      const goalDir = passer.team === 'HOME' ? 1 : -1;
      tx = target.x + target.vx * lead + (isThrough ? goalDir * 85 : 0);
      ty = target.y + target.vy * lead;
      if (passer.team === 'HOME') {
        this.activePlayerId = target.id;
      }
    } else {
      tx = passer.x + fallbackDirX * 260;
      ty = passer.y + fallbackDirY * 260;
    }

    const dx = tx - this.ball.x;
    const dy = ty - this.ball.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = clamp(320 + dist * 0.95, 360, isThrough ? 760 : 660);

    this.ball.vx = (dx / dist) * speed;
    this.ball.vy = (dy / dist) * speed;
    this.ball.vz = isThrough ? 75 : 35;
    passer.facing = Math.atan2(dy, dx);
    soundEngine.playPass();
  }

  private executeShot(
    shooter: Player,
    power: number,
    aimX: number,
    aimY: number,
  ): void {
    this.ball.ownerId = null;
    this.ball.pickupCooldown = 0.22;
    this.ball.lastTouchTeam = shooter.team;
    this.ball.lastTouchPlayerId = shooter.id;
    shooter.kickAnimTimer = 0.26;

    const targetGoalX =
      shooter.team === 'HOME'
        ? PITCH.marginX + PITCH.fieldW
        : PITCH.marginX;
    const goalCenterY = PITCH.worldH / 2;

    // Blend player's aim vector with goal mouth target for intuitive shooting
    const toGoalX = targetGoalX - shooter.x;
    const toGoalY = goalCenterY - shooter.y;
    const toGoalDist = Math.max(1, Math.hypot(toGoalX, toGoalY));

    const goalNormX = toGoalX / toGoalDist;
    const goalNormY = toGoalY / toGoalDist;

    // Allow aiming top/bottom corner with vertical input
    const cornerBiasY = aimY * 0.42;
    let dirX = goalNormX * 0.8 + aimX * 0.2;
    let dirY = goalNormY * 0.55 + cornerBiasY;
    const mag = Math.max(0.001, Math.hypot(dirX, dirY));
    dirX /= mag;
    dirY /= mag;

    const speed = 560 + power * 470;
    this.ball.vx = dirX * speed;
    this.ball.vy = dirY * speed;
    this.ball.vz = 70 + power * 185;
    this.ball.spin = -dirY * 4;
    shooter.facing = Math.atan2(dirY, dirX);

    if (shooter.team === 'HOME') this.stats.homeShots += 1;
    else this.stats.awayShots += 1;

    soundEngine.playKick(power);
    this.shakeAmount = Math.max(this.shakeAmount, 2.5 + power * 4.5);
    if (power > 0.75) {
      this.hitstopTimer = 0.028;
    }
  }

  private updateAI(dt: number, allAI = false): void {
    const ballOwner = this.ball.ownerId
      ? this.players.find((p) => p.id === this.ball.ownerId) ?? null
      : null;

    // Determine closest non-GK presser per team
    const getClosestOutfield = (team: TeamSide): string | null => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const p of this.players) {
        if (p.team !== team || p.role === 'GK') continue;
        if (!allAI && p.id === this.activePlayerId) continue;
        const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
        if (d < bestDist) {
          bestDist = d;
          bestId = p.id;
        }
      }
      return bestId;
    };

    const homePresserId = getClosestOutfield('HOME');
    const awayPresserId = getClosestOutfield('AWAY');

    const ballNormX = clamp((this.ball.x - PITCH.marginX) / PITCH.fieldW, 0, 1);
    const ballNormY = clamp((this.ball.y - PITCH.marginY) / PITCH.fieldH, 0, 1);

    const diffScale =
      this.difficulty === 'WORLD_CLASS'
        ? 1.06
        : this.difficulty === 'PRO'
          ? 0.94
          : 0.78;

    for (const p of this.players) {
      if (!allAI && p.id === this.activePlayerId) continue;
      if (p.stunTimer > 0 || p.tackleTimer > 0) continue;

      if (p.role === 'GK') {
        this.updateGoalkeeperAI(p, dt, diffScale);
        continue;
      }

      const isHome = p.team === 'HOME';
      const attackDir = isHome ? 1 : -1;
      const teamHasBall = ballOwner?.team === p.team;
      const isOwner = ballOwner?.id === p.id;

      if (isOwner) {
        this.updateAIBallCarrier(p, dt, attackDir, diffScale);
        continue;
      }

      // Compute dynamic tactical anchor based on ball position & possession
      const shiftX = (ballNormX - 0.5) * 0.36 + (teamHasBall ? attackDir * 0.1 : -attackDir * 0.06);
      const shiftY = (ballNormY - 0.5) * 0.22;

      let targetX =
        PITCH.marginX + clamp(p.baseNx + shiftX, 0.07, 0.93) * PITCH.fieldW;
      let targetY =
        PITCH.marginY + clamp(p.baseNy + shiftY, 0.07, 0.93) * PITCH.fieldH;
      let desiredSpeed = 205 * diffScale;

      const isPresser =
        (isHome && p.id === homePresserId) || (!isHome && p.id === awayPresserId);

      if (isPresser && (!teamHasBall || !ballOwner)) {
        // Press the ball or chase loose ball
        targetX = this.ball.x + this.ball.vx * 0.14;
        targetY = this.ball.y + this.ball.vy * 0.14;
        desiredSpeed = 265 * (isHome ? 0.98 : diffScale);

        // AI tackle opportunity
        if (
          !isHome &&
          ballOwner &&
          ballOwner.team === 'HOME' &&
          p.tackleCooldown <= 0
        ) {
          const distToBall = Math.hypot(this.ball.x - p.x, this.ball.y - p.y);
          if (distToBall < 42 && Math.random() < dt * (this.difficulty === 'WORLD_CLASS' ? 2.4 : 1.1)) {
            p.tackleTimer = 0.24;
            p.tackleCooldown = 1.4;
            const ang = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
            p.facing = ang;
            p.vx = Math.cos(ang) * 390;
            p.vy = Math.sin(ang) * 390;
            continue;
          }
        }
      } else if (teamHasBall && p.role === 'FWD') {
        // Make smart forward runs into space
        targetX += attackDir * 135;
      }

      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 14) {
        const moveSpd = dist < 50 ? desiredSpeed * (dist / 50) : desiredSpeed;
        const tvx = (dx / dist) * moveSpd;
        const tvy = (dy / dist) * moveSpd;
        p.vx += (tvx - p.vx) * Math.min(1, dt * 8);
        p.vy += (tvy - p.vy) * Math.min(1, dt * 8);
        p.facing = lerpAngle(p.facing, Math.atan2(dy, dx), Math.min(1, dt * 10));
      } else {
        p.vx *= Math.exp(-8 * dt);
        p.vy *= Math.exp(-8 * dt);
        p.facing = lerpAngle(
          p.facing,
          Math.atan2(this.ball.y - p.y, this.ball.x - p.x),
          Math.min(1, dt * 6),
        );
      }
    }
  }

  private updateAIBallCarrier(
    p: Player,
    dt: number,
    attackDir: number,
    diffScale: number,
  ): void {
    const goalX = attackDir > 0 ? PITCH.marginX + PITCH.fieldW : PITCH.marginX;
    const goalY = PITCH.worldH / 2;
    const distToGoal = Math.hypot(goalX - p.x, goalY - p.y);

    p.aiDecisionTimer -= dt;

    // Shoot if within range
    if (distToGoal < 330 && p.aiDecisionTimer <= 0) {
      const aimCornerY = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.45);
      this.executeShot(p, 0.58 + Math.random() * 0.3, attackDir, aimCornerY);
      p.aiDecisionTimer = 0.5;
      return;
    }

    // Check if pressured by an opponent
    let nearestOppDist = Infinity;
    for (const opp of this.players) {
      if (opp.team === p.team) continue;
      const d = Math.hypot(opp.x - p.x, opp.y - p.y);
      if (d < nearestOppDist) nearestOppDist = d;
    }

    if ((nearestOppDist < 95 || p.role === 'DEF') && p.aiDecisionTimer <= 0) {
      const target = this.findBestPassTarget(p, attackDir, (Math.random() - 0.5) * 0.6);
      if (target) {
        const targetAhead =
          attackDir > 0 ? target.x > p.x - 40 : target.x < p.x + 40;
        if (targetAhead || nearestOppDist < 75) {
          this.executePass(p, target, attackDir, 0, Math.random() < 0.25);
          p.aiDecisionTimer = 0.45;
          return;
        }
      }
      p.aiDecisionTimer = 0.25;
    }

    // Dribble smoothly toward opponent goal
    const dx = goalX - p.x;
    const dy = goalY + Math.sin(p.number + this.clockSeconds) * 70 - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const spd = 225 * diffScale;
    p.vx += ((dx / d) * spd - p.vx) * Math.min(1, dt * 8);
    p.vy += ((dy / d) * spd - p.vy) * Math.min(1, dt * 8);
    p.facing = lerpAngle(p.facing, Math.atan2(dy, dx), Math.min(1, dt * 10));
  }

  private updateGoalkeeperAI(gk: Player, dt: number, diffScale: number): void {
    const isHome = gk.team === 'HOME';
    const goalLineX = isHome ? PITCH.marginX + 18 : PITCH.marginX + PITCH.fieldW - 18;
    const goalCenterY = PITCH.worldH / 2;

    if (this.ball.ownerId === gk.id) {
      // Keeper immediately distributes to open teammate
      gk.aiDecisionTimer -= dt;
      if (gk.aiDecisionTimer <= 0) {
        const dir = isHome ? 1 : -1;
        const target = this.findBestPassTarget(gk, dir, 0);
        this.executePass(gk, target, dir, 0, false);
        gk.aiDecisionTimer = 0.6;
      }
      return;
    }

    if (gk.diveTimer > 0) {
      gk.diveTimer -= dt;
      return;
    }

    // Dive if a fast shot is heading toward goal
    const approaching = isHome ? this.ball.vx < -280 : this.ball.vx > 280;
    const distX = Math.abs(this.ball.x - goalLineX);
    if (approaching && distX < 280 && !this.ball.ownerId) {
      const timeToLine = distX / Math.max(1, Math.abs(this.ball.vx));
      const predY = this.ball.y + this.ball.vy * timeToLine;
      if (Math.abs(predY - goalCenterY) < PITCH.goalH * 0.65 && Math.abs(predY - gk.y) > 22) {
        gk.diveTimer = 0.36;
        const dir = Math.sign(predY - gk.y);
        gk.diveDirY = dir;
        gk.vy = dir * 355 * diffScale;
        gk.vx = 0;
        return;
      }
    }

    // Track ball laterally across goal mouth & step off line slightly when ball is close
    const stepOut = clamp(1 - distX / 480, 0, 1) * 38;
    const targetX = isHome ? goalLineX + stepOut : goalLineX - stepOut;
    const targetY = clamp(
      goalCenterY + (this.ball.y - goalCenterY) * 0.42,
      goalCenterY - PITCH.goalH * 0.42,
      goalCenterY + PITCH.goalH * 0.42,
    );

    const dx = targetX - gk.x;
    const dy = targetY - gk.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const spd = Math.min(250 * diffScale, dist * 7);
      gk.vx = (dx / dist) * spd;
      gk.vy = (dy / dist) * spd;
    } else {
      gk.vx *= 0.8;
      gk.vy *= 0.8;
    }
    gk.facing = lerpAngle(
      gk.facing,
      Math.atan2(this.ball.y - gk.y, this.ball.x - gk.x),
      Math.min(1, dt * 12),
    );
  }

  private updatePlayers(dt: number): void {
    const minX = PITCH.marginX - 24;
    const maxX = PITCH.marginX + PITCH.fieldW + 24;
    const minY = PITCH.marginY - 24;
    const maxY = PITCH.marginY + PITCH.fieldH + 24;

    for (const p of this.players) {
      if (p.tackleCooldown > 0) p.tackleCooldown -= dt;
      if (p.stunTimer > 0) p.stunTimer -= dt;
      if (p.kickAnimTimer > 0) p.kickAnimTimer -= dt;

      if (p.tackleTimer > 0) {
        p.tackleTimer -= dt;
        p.vx *= Math.exp(-3.5 * dt);
        p.vy *= Math.exp(-3.5 * dt);
      }

      if (!p.isSprinting) {
        p.stamina = Math.min(100, p.stamina + 11 * dt);
      }

      p.x = clamp(p.x + p.vx * dt, minX, maxX);
      p.y = clamp(p.y + p.vy * dt, minY, maxY);

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 18) {
        p.stridePhase = (p.stridePhase + speed * dt * 0.065) % (Math.PI * 2);
      }
    }
  }

  private resolvePlayerCollisions(): void {
    const minDist = PITCH.playerRadius * 2;
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < minDist) {
          const push = (minDist - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;

          // Tackle steal check
          if (a.team !== b.team) {
            if (a.tackleTimer > 0 && this.ball.ownerId === b.id) {
              this.dispossess(b, a);
            } else if (b.tackleTimer > 0 && this.ball.ownerId === a.id) {
              this.dispossess(a, b);
            }
          }
        }
      }
    }
  }

  private dispossess(victim: Player, tackler: Player): void {
    this.ball.ownerId = tackler.id;
    this.ball.pickupCooldown = 0.2;
    this.ball.lastTouchTeam = tackler.team;
    this.ball.lastTouchPlayerId = tackler.id;
    victim.stunTimer = 0.55;
    if (tackler.team === 'HOME') {
      this.activePlayerId = tackler.id;
    }
    soundEngine.playPass();
    this.shakeAmount = Math.max(this.shakeAmount, 3.2);
  }

  private updateBallPhysics(dt: number, checkGoalsAndBounds: boolean): void {
    // Tether ball smoothly ahead of owner's feet when dribbling
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner) {
        const targetX = owner.x + Math.cos(owner.facing) * (PITCH.playerRadius + 7);
        const targetY = owner.y + Math.sin(owner.facing) * (PITCH.playerRadius + 7);
        const follow = Math.min(1, dt * 24);
        this.ball.x += (targetX - this.ball.x) * follow;
        this.ball.y += (targetY - this.ball.y) * follow;
        this.ball.vx = owner.vx;
        this.ball.vy = owner.vy;
        this.ball.z = 0;
        this.ball.vz = 0;
        this.ball.rotation += Math.hypot(owner.vx, owner.vy) * dt * 0.08;

        // Check if an opposing player/GK intercepts or tackles close enough
        if (this.ball.pickupCooldown <= 0) {
          for (const opp of this.players) {
            if (opp.team === owner.team || opp.stunTimer > 0) continue;
            const d = Math.hypot(opp.x - this.ball.x, opp.y - this.ball.y);
            if (d < PITCH.playerRadius + PITCH.ballRadius + (opp.tackleTimer > 0 ? 12 : 1)) {
              this.dispossess(owner, opp);
              break;
            }
          }
        }
      } else {
        this.ball.ownerId = null;
      }
    } else {
      // Free ball physics with spin, air drag, gravity, and turf bounce
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;

      if (this.ball.z > 0 || this.ball.vz !== 0) {
        this.ball.z += this.ball.vz * dt;
        this.ball.vz -= 520 * dt;
        if (this.ball.z <= 0) {
          this.ball.z = 0;
          if (Math.abs(this.ball.vz) > 45) {
            this.ball.vz = -this.ball.vz * 0.52;
          } else {
            this.ball.vz = 0;
          }
        }
      }

      const friction = this.ball.z > 2 ? 0.992 : Math.exp(-2.1 * dt);
      this.ball.vx *= friction;
      this.ball.vy *= friction;
      this.ball.rotation += Math.hypot(this.ball.vx, this.ball.vy) * dt * 0.08;

      // Pickup / Goalkeeper save check
      if (this.ball.pickupCooldown <= 0 && this.ball.z < 36) {
        for (const p of this.players) {
          if (p.stunTimer > 0) continue;
          const reach =
            p.role === 'GK'
              ? PITCH.playerRadius + PITCH.ballRadius + 10
              : PITCH.playerRadius + PITCH.ballRadius + 5;
          const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
          if (d < reach) {
            const ballSpd = Math.hypot(this.ball.vx, this.ball.vy);
            // Fast shot deflected/saved by GK!
            if (p.role === 'GK' && ballSpd > 380 && this.ball.lastTouchTeam !== p.team) {
              soundEngine.playSave();
              this.shakeAmount = Math.max(this.shakeAmount, 4);
              this.hitstopTimer = 0.032;
              if (p.team === 'HOME') this.stats.homeSaves += 1;
              else this.stats.awaySaves += 1;
              this.burstParticles('spark', this.ball.x, this.ball.y, '#facc15', 10);
            }
            this.ball.ownerId = p.id;
            this.ball.lastTouchTeam = p.team;
            this.ball.lastTouchPlayerId = p.id;
            this.ball.pickupCooldown = 0.14;
            if (p.team === 'HOME' && this.screen === 'PLAYING') {
              this.activePlayerId = p.id;
            }
            break;
          }
        }
      }
    }

    if (!checkGoalsAndBounds) return;

    // Goal detection & Goalpost collisions
    const leftX = PITCH.marginX;
    const rightX = PITCH.marginX + PITCH.fieldW;
    const topY = PITCH.marginY;
    const bottomY = PITCH.marginY + PITCH.fieldH;
    const goalTop = PITCH.worldH / 2 - PITCH.goalH / 2;
    const goalBot = PITCH.worldH / 2 + PITCH.goalH / 2;

    // Goalpost circles
    const posts = [
      { x: leftX, y: goalTop },
      { x: leftX, y: goalBot },
      { x: rightX, y: goalTop },
      { x: rightX, y: goalBot },
    ];
    for (const post of posts) {
      const dx = this.ball.x - post.x;
      const dy = this.ball.y - post.y;
      const dist = Math.hypot(dx, dy);
      const minD = PITCH.ballRadius + 6;
      if (dist > 0 && dist < minD) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.ball.x = post.x + nx * minD;
        this.ball.y = post.y + ny * minD;
        const dot = this.ball.vx * nx + this.ball.vy * ny;
        if (dot < 0) {
          this.ball.vx -= 1.75 * dot * nx;
          this.ball.vy -= 1.75 * dot * ny;
          soundEngine.playPostHit();
          this.shakeAmount = Math.max(this.shakeAmount, 6);
          this.hitstopTimer = 0.04;
        }
      }
    }

    // Scored in Left Goal (AWAY scores)
    if (this.ball.x < leftX - PITCH.ballRadius && this.ball.y > goalTop && this.ball.y < goalBot) {
      this.onGoalScored('AWAY');
      this.netLeftRipple = 1;
      return;
    }

    // Scored in Right Goal (HOME scores)
    if (this.ball.x > rightX + PITCH.ballRadius && this.ball.y > goalTop && this.ball.y < goalBot) {
      this.onGoalScored('HOME');
      this.netRightRipple = 1;
      return;
    }

    // Sidelines & Endlines -> smooth cushioned bounce/quick restart so 11v11 action stays electric
    if (this.ball.y < topY) {
      this.ball.y = topY;
      this.ball.vy = Math.abs(this.ball.vy) * 0.65;
      this.burstParticles('chalk', this.ball.x, topY, '#f8fafc', 6);
    } else if (this.ball.y > bottomY) {
      this.ball.y = bottomY;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.65;
      this.burstParticles('chalk', this.ball.x, bottomY, '#f8fafc', 6);
    }

    if (this.ball.x < leftX && (this.ball.y <= goalTop || this.ball.y >= goalBot)) {
      this.ball.x = leftX + 2;
      this.ball.vx = Math.abs(this.ball.vx) * 0.6;
      this.burstParticles('chalk', leftX, this.ball.y, '#f8fafc', 6);
    } else if (this.ball.x > rightX && (this.ball.y <= goalTop || this.ball.y >= goalBot)) {
      this.ball.x = rightX - 2;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.6;
      this.burstParticles('chalk', rightX, this.ball.y, '#f8fafc', 6);
    }
  }

  private onGoalScored(scoringTeam: TeamSide): void {
    if (this.goalResetTimer > 0) return;

    this.ball.ownerId = null;
    this.ball.vx *= 0.25;
    this.ball.vy *= 0.25;
    this.isChargingShot = false;
    this.shotCharge = 0;

    if (scoringTeam === 'HOME') {
      this.homeScore += 1;
      this.stats.homeOnTarget += 1;
      this.kickoffTeam = 'AWAY';
      this.goalBannerText = 'GOAL! HOME';
    } else {
      this.awayScore += 1;
      this.stats.awayOnTarget += 1;
      this.kickoffTeam = 'HOME';
      this.goalBannerText = 'GOAL! AWAY';
    }

    const scorer = this.players.find((p) => p.id === this.ball.lastTouchPlayerId);
    this.goalBannerSub = scorer
      ? `#${scorer.number} (${scorer.role}) · ${this.homeScore} – ${this.awayScore}`
      : `${this.homeScore} – ${this.awayScore}`;

    this.goalResetTimer = 2.3;
    this.hitstopTimer = 0.055;
    this.shakeAmount = 8;

    soundEngine.playNetSwish();
    soundEngine.playCrowdGoal();
    soundEngine.playWhistle('short');
    this.burstParticles(
      'confetti',
      this.ball.x,
      this.ball.y,
      scoringTeam === 'HOME' ? '#3b82f6' : '#ef4444',
      38,
    );
  }

  private updateCamera(dt: number): void {
    const targetX = clamp(this.ball.x, 420, PITCH.worldW - 420);
    const targetY = clamp(this.ball.y, 260, PITCH.worldH - 260);
    const lerp = Math.min(1, dt * 5.5);
    this.cameraX += (targetX - this.cameraX) * lerp;
    this.cameraY += (targetY - this.cameraY) * lerp;
  }

  public getHudSnapshot(): HudSnapshot {
    const active = this.getActivePlayer();
    return {
      screen: this.screen,
      mode: this.mode,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      half: this.half,
      clockSeconds: Math.floor(this.clockSeconds),
      halfDurationSeconds: this.halfDurationSeconds,
      activePlayerNumber: active?.number ?? 9,
      activePlayerRole: active?.role ?? 'FWD',
      activePlayerStamina: Math.round(active?.stamina ?? 100),
      shotCharge: Math.round(this.shotCharge * 100),
      goalBannerText: this.goalBannerText,
      goalBannerSub: this.goalBannerSub,
      stats: { ...this.stats },
      penalty: {
        phase: this.penalty.phase,
        turn: this.penalty.turn,
        round: this.penalty.round,
        suddenDeath: this.penalty.suddenDeath,
        homeScore: this.penalty.homeScore,
        awayScore: this.penalty.awayScore,
        homeKicks: [...this.penalty.homeKicks],
        awayKicks: [...this.penalty.awayKicks],
        winner: this.penalty.winner,
        resultBanner: this.penalty.resultBanner,
        resultSub: this.penalty.resultSub,
        power: Math.round(this.penalty.power * 100),
        keeperCommitted: this.penalty.keeperDiveCommitted,
      },
    };
  }
}
14. src/game/renderer.ts
Ts
import { PITCH } from './formations';
import type { GameEngine } from './matchEngine';
import type { PenaltyState, Player } from './types';

export interface PenaltyGoalBounds {
  goalLeft: number;
  goalRight: number;
  goalTop: number;
  goalBottom: number;
}

export function getPenaltyGoalBounds(w: number, h: number): PenaltyGoalBounds {
  const isCompact = w < 640;
  const goalW = isCompact ? Math.min(w * 0.88, 420) : Math.min(w * 0.56, 620);
  const goalH = goalW * (isCompact ? 0.44 : 0.36);
  const goalLeft = w / 2 - goalW / 2;
  const goalRight = w / 2 + goalW / 2;
  const goalBottom = h * (isCompact ? 0.48 : 0.52);
  const goalTop = goalBottom - goalH;
  return { goalLeft, goalRight, goalTop, goalBottom };
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  width: number,
  height: number,
): void {
  ctx.save();
  if (engine.mode === 'PENALTY_SHOOTOUT' && engine.screen !== 'TITLE') {
    renderPenaltyArena(ctx, engine, width, height);
  } else {
    renderMatchPitch(ctx, engine, width, height);
  }
  ctx.restore();
}

function renderMatchPitch(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  // Stadium deep night surround
  ctx.fillStyle = '#09140e';
  ctx.fillRect(0, 0, w, h);

  // Camera scale adapts cleanly between phone portrait, phone landscape, and desktop
  const baseScale = w < 768 ? Math.max(w / 900, h / 960) * 0.82 : Math.max(w / 1280, h / 820) * 0.96;
  const scale = Math.max(0.46, Math.min(1.12, baseScale));
  const shakeX =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;
  const shakeY =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;

  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(scale, scale);
  ctx.translate(-engine.cameraX, -engine.cameraY);

  drawPitchSurface(ctx, engine);
  drawGoalNets(ctx, engine);

  // Draw pass target ring
  if (engine.screen === 'PLAYING' && engine.passTargetId) {
    const target = engine.players.find((p) => p.id === engine.passTargetId);
    if (target) {
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, PITCH.playerRadius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw players sorted by Y for subtle depth overlap
  const sortedPlayers = [...engine.players].sort((a, b) => a.y - b.y);
  for (const p of sortedPlayers) {
    const isActive =
      engine.screen === 'PLAYING' && p.id === engine.activePlayerId;
    drawPlayerSprite(ctx, p, isActive, engine);
  }

  // Draw ball
  drawMatchBall(ctx, engine);

  // Draw pooled particles
  for (const pt of engine.particles) {
    if (!pt.active) continue;
    ctx.save();
    ctx.globalAlpha = pt.alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y - pt.z * 0.4, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Subtle floodlight vignette around viewport edges
  const grad = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(4,10,7,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Compact tactical radar at bottom-center during live match
  if (engine.screen === 'PLAYING') {
    drawTacticalRadar(ctx, engine, w, h);
  }
}

function drawPitchSurface(
  ctx: CanvasRenderingContext2D,
  _engine: GameEngine,
): void {
  const x = PITCH.marginX;
  const y = PITCH.marginY;
  const fw = PITCH.fieldW;
  const fh = PITCH.fieldH;

  // Outer pitch apron
  ctx.fillStyle = '#0f3f24';
  ctx.fillRect(x - 65, y - 55, fw + 130, fh + 110);

  // Advertising hoardings / perimeter dark border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.strokeRect(x - 42, y - 34, fw + 84, fh + 68);

  // Alternating mowed grass stripes (14 stripes)
  const stripeCount = 14;
  const stripeW = fw / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#16653b' : '#1a7343';
    ctx.fillRect(x + i * stripeW, y, stripeW + 0.5, fh);
  }

  // Crisp chalk pitch markings
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.88)';
  ctx.lineWidth = 3;

  // Touchlines & Goal lines
  ctx.strokeRect(x, y, fw, fh);

  // Halfway line & Center circle
  const cx = x + fw / 2;
  const cy = y + fh / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, y + fh);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, PITCH.centerCircleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right Penalty Boxes
  const pbW = PITCH.penaltyBoxW;
  const pbH = PITCH.penaltyBoxH;
  const syW = PITCH.sixYardW;
  const syH = PITCH.sixYardH;

  ctx.strokeRect(x, cy - pbH / 2, pbW, pbH);
  ctx.strokeRect(x, cy - syH / 2, syW, syH);

  ctx.strokeRect(x + fw - pbW, cy - pbH / 2, pbW, pbH);
  ctx.strokeRect(x + fw - syW, cy - syH / 2, syW, syH);

  // Penalty spots
  const leftSpotX = x + PITCH.penaltySpotDist;
  const rightSpotX = x + fw - PITCH.penaltySpotDist;
  ctx.beginPath();
  ctx.arc(leftSpotX, cy, 4, 0, Math.PI * 2);
  ctx.arc(rightSpotX, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Penalty D-arcs
  ctx.beginPath();
  ctx.arc(leftSpotX, cy, 102, -0.68, 0.68);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rightSpotX, cy, 102, Math.PI - 0.68, Math.PI + 0.68);
  ctx.stroke();

  // Corner arcs
  const cR = 22;
  ctx.beginPath();
  ctx.arc(x, y, cR, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + fw, y, cR, Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + fw, y + fh, cR, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + fh, cR, Math.PI * 1.5, Math.PI * 2);
  ctx.stroke();
}

function drawGoalNets(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const x = PITCH.marginX;
  const fw = PITCH.fieldW;
  const cy = PITCH.worldH / 2;
  const gh = PITCH.goalH;
  const gw = PITCH.goalW;
  const top = cy - gh / 2;

  const drawSingleGoal = (gx: number, isLeft: boolean, ripple: number) => {
    const bulge = Math.sin(ripple * Math.PI * 4) * ripple * 10;
    const outerX = isLeft ? gx - gw - Math.abs(bulge) : gx + gw + Math.abs(bulge);

    ctx.save();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.08)';
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(outerX, top + 6);
    ctx.lineTo(outerX, top + gh - 6);
    ctx.lineTo(gx, top + gh);
    ctx.closePath();
    ctx.fill();

    // Net mesh lines
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
    ctx.lineWidth = 1;
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const yy = top + (gh * i) / steps;
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(outerX, yy);
      ctx.stroke();
    }

    // Frame posts & back bar
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(outerX, top + 6);
    ctx.lineTo(outerX, top + gh - 6);
    ctx.lineTo(gx, top + gh);
    ctx.stroke();

    // Post caps
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx, top, 5.5, 0, Math.PI * 2);
    ctx.arc(gx, top + gh, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawSingleGoal(x, true, engine.netLeftRipple);
  drawSingleGoal(x + fw, false, engine.netRightRipple);
}

function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  p: Player,
  isActive: boolean,
  engine: GameEngine,
): void {
  const r = PITCH.playerRadius;
  const isHome = p.team === 'HOME';
  const kitPrimary =
    p.role === 'GK'
      ? isHome
        ? '#eab308'
        : '#10b981'
      : isHome
        ? '#2563eb'
        : '#dc2626';
  const kitTrim = isHome ? '#eff6ff' : '#fef2f2';

  ctx.save();
  ctx.translate(p.x, p.y);

  // Active player selection ring & stamina arc
  if (isActive) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.stroke();

    const stamFrac = p.stamina / 100;
    ctx.strokeStyle = stamFrac > 0.3 ? '#38bdf8' : '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stamFrac);
    ctx.stroke();

    // Shot charge meter arc around active player when charging
    if (engine.isChargingShot) {
      const charge = engine.shotCharge;
      ctx.strokeStyle = charge > 0.85 ? '#ef4444' : charge > 0.45 ? '#22c55e' : '#facc15';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.stroke();
    }

    // Crisp pointer chevron above active player
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -r - 13);
    ctx.lineTo(-5.5, -r - 21);
    ctx.lineTo(5.5, -r - 21);
    ctx.closePath();
    ctx.fill();
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(2, 5, r * 0.95, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // Oriented athletic body
  ctx.save();
  ctx.rotate(p.facing);

  // Animated running stride cleats
  const spd = Math.hypot(p.vx, p.vy);
  const stride = spd > 18 ? Math.sin(p.stridePhase) * 6 : 0;
  const kickExt = p.kickAnimTimer > 0 ? Math.sin((p.kickAnimTimer / 0.24) * Math.PI) * 8 : 0;

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(stride + kickExt, -6, 5.5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(-stride, 6, 5.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Goalkeeper gloves
  if (p.role === 'GK') {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(7, -r + 1, 3.8, 0, Math.PI * 2);
    ctx.arc(7, r - 1, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shoulders / Jersey torso
  ctx.fillStyle = kitPrimary;
  ctx.strokeStyle = p.stunTimer > 0 ? '#facc15' : kitTrim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head & hair orientation cue
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(3, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isHome ? '#1e293b' : '#292524';
  ctx.beginPath();
  ctx.arc(0.5, 0, 6.2, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();

  ctx.restore();

  // Jersey number
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.number), -3, 1);

  ctx.restore();
}

function drawMatchBall(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const b = engine.ball;
  const r = PITCH.ballRadius + b.z * 0.045;

  // Ground shadow scales slightly smaller with height
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(
    b.x + 2 + b.z * 0.14,
    b.y + 4 + b.z * 0.14,
    PITCH.ballRadius * Math.max(0.55, 1 - b.z * 0.004),
    PITCH.ballRadius * 0.7 * Math.max(0.55, 1 - b.z * 0.004),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Ball sphere shifted up visually by z
  const drawY = b.y - b.z * 0.45;
  ctx.translate(b.x, drawY);
  ctx.rotate(b.rotation);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Classic pentagon patches
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawTacticalRadar(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  const isCompact = w < 768;
  const rw = isCompact ? 124 : 196;
  const rh = isCompact ? 72 : 116;
  const rx = w / 2 - rw / 2;
  const ry = isCompact ? 56 : h - rh - 14;

  ctx.save();
  ctx.fillStyle = 'rgba(9, 20, 14, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 6);
  ctx.fill();
  ctx.stroke();

  // Center line & circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, ry + 4);
  ctx.lineTo(rx + rw / 2, ry + rh - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rx + rw / 2, ry + rh / 2, 13, 0, Math.PI * 2);
  ctx.stroke();

  const pad = 6;
  for (const p of engine.players) {
    const nx = (p.x - PITCH.marginX) / PITCH.fieldW;
    const ny = (p.y - PITCH.marginY) / PITCH.fieldH;
    const px = rx + pad + nx * (rw - pad * 2);
    const py = ry + pad + ny * (rh - pad * 2);
    ctx.fillStyle = p.team === 'HOME' ? '#3b82f6' : '#ef4444';
    ctx.beginPath();
    ctx.arc(px, py, p.id === engine.activePlayerId ? 3.8 : 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === engine.activePlayerId) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Ball dot
  const bnx = (engine.ball.x - PITCH.marginX) / PITCH.fieldW;
  const bny = (engine.ball.y - PITCH.marginY) / PITCH.fieldH;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(
    rx + pad + bnx * (rw - pad * 2),
    ry + pad + bny * (rh - pad * 2),
    3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

// =============================================================================
// PENALTY SHOOTOUT GOAL-FACING ARENA RENDERER
// =============================================================================

function renderPenaltyArena(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  const p: PenaltyState = engine.penalty;
  const shakeX =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;
  const shakeY =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  const bounds = getPenaltyGoalBounds(w, h);
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;
  const horizonY = goalBottom - 16;

  // 1. Night stadium backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#070d16');
  skyGrad.addColorStop(1, '#122230');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY);

  // Crowd stands silhouette & subtle stadium lights
  ctx.fillStyle = '#0c1622';
  ctx.fillRect(0, horizonY - 120, w, 120);
  // Subtle terraced stand lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let row = 0; row < 6; row++) {
    const ry = horizonY - 16 - row * 17;
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(w, ry);
    ctx.stroke();
  }

  // Stadium floodlight towers
  const drawFloodlight = (lx: number, ly: number) => {
    const glow = ctx.createRadialGradient(lx, ly, 4, lx, ly, 160);
    glow.addColorStop(0, 'rgba(241, 245, 249, 0.35)');
    glow.addColorStop(1, 'rgba(241, 245, 249, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 160, 0, Math.PI * 2);
    ctx.fill();
  };
  drawFloodlight(w * 0.18, h * 0.12);
  drawFloodlight(w * 0.82, h * 0.12);

  // Perimeter LED ad board
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, horizonY - 18, w, 18);
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(w * 0.12, horizonY - 14, w * 0.24, 10);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(w * 0.64, horizonY - 14, w * 0.24, 10);

  // 2. Perspective turf pitch from penalty spot to goal line
  const turfGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  turfGrad.addColorStop(0, '#135733');
  turfGrad.addColorStop(1, '#1a7545');
  ctx.fillStyle = turfGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Perspective mowed stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let i = -5; i <= 5; i += 2) {
    const topX1 = w / 2 + i * (goalW * 0.16);
    const topX2 = w / 2 + (i + 1) * (goalW * 0.16);
    const botX1 = w / 2 + i * (goalW * 0.36);
    const botX2 = w / 2 + (i + 1) * (goalW * 0.36);
    ctx.beginPath();
    ctx.moveTo(topX1, horizonY);
    ctx.lineTo(topX2, horizonY);
    ctx.lineTo(botX2, h);
    ctx.lineTo(botX1, h);
    ctx.closePath();
    ctx.fill();
  }

  // Crisp chalk goal line, 6-yard box, 18-yard box & penalty spot
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, goalBottom);
  ctx.lineTo(w, goalBottom);
  ctx.stroke();

  // Perspective 6-yard box
  ctx.beginPath();
  ctx.moveTo(goalLeft - goalW * 0.22, goalBottom);
  ctx.lineTo(goalLeft - goalW * 0.36, goalBottom + (h - goalBottom) * 0.26);
  ctx.lineTo(goalRight + goalW * 0.36, goalBottom + (h - goalBottom) * 0.26);
  ctx.lineTo(goalRight + goalW * 0.22, goalBottom);
  ctx.stroke();

  const spotX = w / 2;
  const spotY = h * 0.81;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(spotX, spotY, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Goal Net (with dynamic ripple on impact)
  drawPenaltyGoalAndNet(ctx, bounds, p);

  // 4. Interactive Keeper Save Zones hint when defending
  if (p.turn === 'AWAY' && (p.phase === 'KEEPER_WAIT' || p.phase === 'KEEPER_FLIGHT')) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(goalLeft + goalW * 0.33, goalTop + 8);
    ctx.lineTo(goalLeft + goalW * 0.33, goalBottom - 8);
    ctx.moveTo(goalLeft + goalW * 0.67, goalTop + 8);
    ctx.lineTo(goalLeft + goalW * 0.67, goalBottom - 8);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Goalkeeper sprite on goal line
  drawPenaltyKeeper(ctx, bounds, p);

  // 6. Aim Reticle & Power Gauge when player is shooting
  if (p.turn === 'HOME' && (p.phase === 'AIMING' || p.phase === 'CHARGING')) {
    const ax = w / 2 + p.aimX * (goalW / 2);
    const ay = goalBottom - p.aimY * goalH;

    ctx.save();
    // Subtle target ring
    const isDanger = p.phase === 'CHARGING' && p.power > 0.85;
    ctx.strokeStyle = isDanger ? '#ef4444' : '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ax, ay, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ax - 24, ay);
    ctx.lineTo(ax - 10, ay);
    ctx.moveTo(ax + 10, ay);
    ctx.lineTo(ax + 24, ay);
    ctx.moveTo(ax, ay - 24);
    ctx.lineTo(ax, ay - 10);
    ctx.moveTo(ax, ay + 10);
    ctx.lineTo(ax, ay + 24);
    ctx.stroke();

    // Vertical Sweet-Spot Power Meter right beside the ball
    if (p.phase === 'CHARGING') {
      const barX = spotX + 54;
      const barY = spotY - 120;
      const barW = 14;
      const barH = 110;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();
      ctx.stroke();

      // Sweet spot zone highlight (48%..84%)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      ctx.fillRect(barX + 2, barY + barH * 0.16, barW - 4, barH * 0.36);

      const fillH = barH * p.power;
      ctx.fillStyle = p.power > 0.84 ? '#ef4444' : p.power > 0.48 ? '#22c55e' : '#facc15';
      ctx.fillRect(barX + 2, barY + barH - fillH, barW - 4, fillH);
    }
    ctx.restore();
  }

  // 7. Ball & Trail
  drawPenaltyBall(ctx, bounds, spotX, spotY, p);

  // 8. Kicker silhouette approaching spot
  drawPenaltyKicker(ctx, spotX, spotY, p);

  // 9. Pooled confetti / save sparks
  for (const pt of engine.particles) {
    if (!pt.active) continue;
    ctx.save();
    ctx.globalAlpha = pt.alpha;
    ctx.fillStyle = pt.color;
    const sx = (pt.x / 1700) * w;
    const sy = (pt.y / 1060) * h;
    ctx.beginPath();
    ctx.arc(sx, sy, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawPenaltyGoalAndNet(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;
  const depthInsetX = goalW * 0.065;
  const depthInsetY = goalH * 0.14;

  // Back frame coordinates
  const backL = goalLeft + depthInsetX;
  const backR = goalRight - depthInsetX;
  const backT = goalTop + depthInsetY;
  const backB = goalBottom - depthInsetY * 0.5;

  ctx.save();
  // Net backing tint
  ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
  ctx.fillRect(goalLeft, goalTop, goalW, goalH);

  // Net grid with ripple deformation
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.26)';
  ctx.lineWidth = 1;
  const cols = 20;
  const rows = 8;
  const ripplePx = p.netRippleStrength * 14;
  const rcx = backL + (p.netRippleX * 0.5 + 0.5) * (backR - backL);
  const rcy = backB - p.netRippleY * (backB - backT);

  for (let c = 0; c <= cols; c++) {
    const t = c / cols;
    const x1 = goalLeft + t * goalW;
    const x2 = backL + t * (backR - backL);
    const dist = Math.hypot(x2 - rcx, (backT + backB) * 0.5 - rcy);
    const disp = ripplePx * Math.exp(-dist / 90);
    ctx.beginPath();
    ctx.moveTo(x1, goalTop);
    ctx.quadraticCurveTo(x2 + disp * 0.5, (backT + backB) / 2, x2, backB);
    ctx.stroke();
  }

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y1 = backT + t * (backB - backT);
    const disp = ripplePx * Math.exp(-Math.abs(y1 - rcy) / 60);
    ctx.beginPath();
    ctx.moveTo(backL, y1);
    ctx.quadraticCurveTo(rcx, y1 - disp, backR, y1);
    ctx.stroke();
  }

  // Side net diagonals
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
  ctx.beginPath();
  ctx.moveTo(goalLeft, goalTop);
  ctx.lineTo(backL, backT);
  ctx.moveTo(goalRight, goalTop);
  ctx.lineTo(backR, backT);
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(backL, backB);
  ctx.moveTo(goalRight, goalBottom);
  ctx.lineTo(backR, backB);
  ctx.stroke();

  // Crisp white posts and crossbar
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(goalLeft, goalTop);
  ctx.lineTo(goalRight, goalTop);
  ctx.lineTo(goalRight, goalBottom);
  ctx.stroke();
  ctx.restore();
}

function drawPenaltyKeeper(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;

  const kx = (goalLeft + goalRight) / 2 + p.keeperCurrX * (goalW * 0.45);
  const ky = goalBottom - p.keeperCurrY * (goalH * 0.78);
  const isHomeKeeper = p.turn === 'AWAY';
  const kitColor = isHomeKeeper ? '#eab308' : '#10b981';

  // Dive tilt angle based on horizontal offset
  const tilt = p.keeperCurrX * 1.15;

  ctx.save();
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(kx, goalBottom + 4, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(kx, ky);
  ctx.rotate(tilt);

  // Legs
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, 16);
  ctx.lineTo(-10, 40);
  ctx.moveTo(7, 16);
  ctx.lineTo(10, 40);
  ctx.stroke();

  // Torso
  ctx.fillStyle = kitColor;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-14, -14, 28, 34, 6);
  ctx.fill();
  ctx.stroke();

  // Outstretched arms + gloves
  const armReach = Math.abs(p.keeperCurrX) > 0.25 ? 36 : 26;
  ctx.strokeStyle = kitColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-12, -8);
  ctx.lineTo(-armReach, -18);
  ctx.moveTo(12, -8);
  ctx.lineTo(armReach, -18);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-armReach, -18, 6, 0, Math.PI * 2);
  ctx.arc(armReach, -18, 6, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -24, 9.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPenaltyBall(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  spotX: number,
  spotY: number,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;

  const project = (nx: number, ny: number, nz: number) => {
    const targetX = (goalLeft + goalRight) / 2 + nx * (goalW / 2);
    const groundY = spotY + (goalBottom - spotY) * ny;
    const scale = 1 - ny * 0.45;
    const drawY = groundY - nz * goalH * (0.55 + ny * 0.45);
    return { x: spotX + (targetX - spotX) * ny, groundY, drawY, scale };
  };

  // Trail
  if (p.ballTrail.length > 1) {
    ctx.save();
    for (let i = 0; i < p.ballTrail.length; i++) {
      const pt = p.ballTrail[i];
      const pos = project(pt.x, pt.y, pt.z);
      const alpha = ((i + 1) / p.ballTrail.length) * 0.28;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.drawY, 13 * pos.scale * ((i + 1) / p.ballTrail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const cur = project(p.ballCurrX, p.ballCurrY, p.ballCurrZ);
  const r = 15 * cur.scale;

  ctx.save();
  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cur.x, cur.groundY + 3, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.translate(cur.x, cur.drawY);
  ctx.rotate(p.ballProgress * 14);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPenaltyKicker(
  ctx: CanvasRenderingContext2D,
  spotX: number,
  spotY: number,
  p: PenaltyState,
): void {
  const isHomeKicker = p.turn === 'HOME';
  const kitColor = isHomeKicker ? '#2563eb' : '#dc2626';
  const prog = p.phase === 'RUNUP' ? p.kickerProgress : p.phase === 'FLIGHT' || p.phase === 'KEEPER_FLIGHT' || p.phase === 'RESULT' ? 1 : 0;

  // Kicker starts slightly left-back of the ball and steps forward to strike
  const kx = spotX - 42 + prog * 28;
  const ky = spotY + 72 - prog * 54;
  const scale = 1.35 - prog * 0.1;

  // Telegraph lean during AI windup
  const cueOffset =
    p.turn === 'AWAY' && p.phase === 'KEEPER_WAIT'
      ? Math.sin((p.aiWaitTimer / p.aiWaitDuration) * Math.PI) * p.aiCueX * 10
      : 0;

  ctx.save();
  ctx.translate(kx + cueOffset, ky);
  ctx.scale(scale, scale);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  const stride = p.phase === 'RUNUP' ? Math.sin(prog * Math.PI * 5) * 6 : 0;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-7, 22 + stride);
  ctx.moveTo(6, 4);
  ctx.lineTo(8, 22 - stride);
  ctx.stroke();

  // Jersey back facing camera
  ctx.fillStyle = kitColor;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(-14, -22, 28, 30, 6);
  ctx.fill();
  ctx.stroke();

  // Jersey #9 / #10
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isHomeKicker ? '9' : '10', 0, -6);

  // Head
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, -30, 8.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
15. src/components/MobileControls.tsx
Tsx
import React, { useRef, useState } from 'react';
import { soundEngine } from '../game/audio';
import type { GameMode, InputState, PenaltyPhase, TeamSide } from '../game/types';

interface MobileControlsProps {
  mode: GameMode;
  penaltyTurn: TeamSide;
  penaltyPhase: PenaltyPhase;
  inputRef: React.MutableRefObject<InputState>;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  mode,
  penaltyTurn,
  penaltyPhase,
  inputRef,
}) => {
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const maxRadius = 42;

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobPos({ x: dx, y: dy });
    inputRef.current.analogX = dx / maxRadius;
    inputRef.current.analogY = dy / maxRadius;
  };

  const resetJoystick = () => {
    joyTouchIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    inputRef.current.analogX = 0;
    inputRef.current.analogY = 0;
  };

  const handleJoyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    soundEngine.unlock();
    if (joyTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    joyTouchIdRef.current = touch.identifier;
    updateJoystickFromClient(touch.clientX, touch.clientY);
  };

  const handleJoyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchIdRef.current) {
        updateJoystickFromClient(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoyTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchIdRef.current) {
        resetJoystick();
        break;
      }
    }
  };

  // Penalty Shootout touch helper: dedicated Hold-to-Shoot button on attack turn
  if (mode === 'PENALTY_SHOOTOUT') {
    if (
      penaltyTurn === 'HOME' &&
      (penaltyPhase === 'AIMING' || penaltyPhase === 'CHARGING')
    ) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex items-center justify-end px-6">
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              soundEngine.unlock();
              if (!inputRef.current.shootHeld) {
                inputRef.current.shootJustPressed = true;
              }
              inputRef.current.shootHeld = true;
              setActiveBtn('pen-shoot');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (inputRef.current.shootHeld) {
                inputRef.current.shootJustReleased = true;
              }
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            onTouchCancel={() => {
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            style={{ touchAction: 'none' }}
            className={`pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full border-2 text-center text-xs font-extrabold tracking-wide shadow-xl transition-transform ${
              activeBtn === 'pen-shoot'
                ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
                : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
            }`}
          >
            HOLD
            <br />
            SHOOT
          </button>
        </div>
      );
    }
    return null;
  }

  // 11v11 Match Virtual Gamepad
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-5 sm:px-7 sm:pb-6">
      {/* Left-thumb 360 Virtual Joystick */}
      <div
        ref={joyRef}
        onTouchStart={handleJoyTouchStart}
        onTouchMove={handleJoyTouchMove}
        onTouchEnd={handleJoyTouchEnd}
        onTouchCancel={handleJoyTouchEnd}
        style={{ touchAction: 'none' }}
        className="pointer-events-auto relative flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-slate-950/45 shadow-lg"
        aria-label="Move joystick"
      >
        <div className="h-16 w-16 rounded-full border border-white/10" />
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className="absolute h-12 w-12 rounded-full border-2 border-white/80 bg-blue-500/80 shadow-md"
        />
      </div>

      {/* Right-thumb Ergonomic Action Cluster */}
      <div className="pointer-events-auto relative h-36 w-44">
        {/* Sprint (top-left of cluster) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.sprint = true;
            setActiveBtn('sprint');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'sprint'
              ? 'scale-95 border-sky-300 bg-sky-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-slate-100'
          }`}
        >
          RUN
        </button>

        {/* Through Ball (top-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.throughJustPressed = true;
            setActiveBtn('thru');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute right-2 top-0 flex h-13 w-13 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'thru'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-amber-300'
          }`}
        >
          THRU
        </button>

        {/* Pass / Switch (bottom-left) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.passJustPressed = true;
            setActiveBtn('pass');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-1 left-2 flex h-14 w-14 items-center justify-center rounded-full border text-xs font-extrabold shadow-md transition-transform ${
            activeBtn === 'pass'
              ? 'scale-95 border-blue-300 bg-blue-500 text-white'
              : 'border-blue-400/50 bg-blue-600/85 text-white'
          }`}
        >
          PASS
        </button>

        {/* Primary Shoot / Tackle (bottom-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            if (!inputRef.current.shootHeld) {
              inputRef.current.shootJustPressed = true;
            }
            inputRef.current.shootHeld = true;
            setActiveBtn('shoot');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (inputRef.current.shootHeld) {
              inputRef.current.shootJustReleased = true;
            }
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-0 right-0 flex h-18 w-18 items-center justify-center rounded-full border-2 text-xs font-extrabold shadow-xl transition-transform ${
            activeBtn === 'shoot'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
          }`}
        >
          SHOOT
        </button>
      </div>
    </div>
  );
};
16. src/hooks/usePWAInstall.tsx
Tsx
import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    const mobile = ios || /android|mobile/.test(ua);
    setIsIOS(ios);
    setIsMobile(mobile);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    isMobile,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isMobile, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  if (!isInstallable && !isIOS && !isMobile) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex h-10 items-center gap-2 whitespace-nowrap shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-2 focus-visible:outline-emerald-400"
      >
        {isInstallable ? (
          <Download className="h-3.5 w-3.5" />
        ) : (
          <Smartphone className="h-3.5 w-3.5" />
        )}
        Install Phone App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-2xl font-bold text-white">
                {isIOS ? 'Install on iPhone / iPad' : 'Install on Android'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this page in Safari on your iPhone or iPad.</li>
                <li>2. Tap the Share icon in the Safari toolbar.</li>
                <li>
                  3. Scroll down and tap{' '}
                  <strong className="text-white">Add to Home Screen</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>1. Open this app link directly in Google Chrome on Android.</li>
                <li>2. Tap the three-dot menu (⋮) in the top-right corner.</li>
                <li>
                  3. Tap{' '}
                  <strong className="text-white">Add to Home screen</strong> or{' '}
                  <strong className="text-white">Install app</strong> to launch
                  full-screen like a native app.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-md bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-md border border-amber-400/40 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-lg">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline Mode — Playing cached game</span>
    </div>
  );
};
17. src/App.tsx
Tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MobileControls } from './components/MobileControls';
import { soundEngine } from './game/audio';
import { GameEngine } from './game/matchEngine';
import { getPenaltyGoalBounds, renderGame } from './game/renderer';
import { OfflineIndicator, PWAInstallButton } from './hooks/usePWAInstall';
import type {
  Difficulty,
  FormationId,
  GameMode,
  HudSnapshot,
  InputState,
  KickOutcome,
} from './game/types';

function formatMatchClock(seconds: number, halfDuration: number): string {
  // Scale real-time seconds into 45:00 / 90:00 football match minutes
  const totalMatchMinutes = (seconds / halfDuration) * 45;
  const mins = Math.floor(totalMatchMinutes);
  const secs = Math.floor((totalMatchMinutes - mins) * 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function KickStatusIcon({ outcome }: { outcome: KickOutcome }) {
  if (outcome === 'GOAL') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-emerald-500/20 border border-emerald-400 text-emerald-300"
        title="Scored"
      >
        <Check className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  if (outcome === 'MISS' || outcome === 'SAVE') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-rose-500/20 border border-rose-400 text-rose-300"
        title={outcome === 'SAVE' ? 'Saved' : 'Missed'}
      >
        <X className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-slate-800/80 border border-slate-600"
      title="Upcoming"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
    </span>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }

  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    sprint: false,
    shootHeld: false,
    shootJustPressed: false,
    shootJustReleased: false,
    passJustPressed: false,
    throughJustPressed: false,
    mouseNormX: 0,
    mouseNormY: 0.35,
    mouseActive: false,
    mouseDown: false,
    mouseJustPressed: false,
    mouseJustReleased: false,
  });

  const [selectedMode, setSelectedMode] = useState<GameMode>('MATCH');
  const [selectedFormation, setSelectedFormation] =
    useState<FormationId>('4-3-3');
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<Difficulty>('PRO');
  const [muted, setMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  });

  const [hud, setHud] = useState<HudSnapshot>(() =>
    engineRef.current!.getHudSnapshot(),
  );

  const syncHud = useCallback(() => {
    const next = engineRef.current!.getHudSnapshot();
    setHud((prev) => {
      if (
        prev.screen === next.screen &&
        prev.mode === next.mode &&
        prev.homeScore === next.homeScore &&
        prev.awayScore === next.awayScore &&
        prev.half === next.half &&
        prev.clockSeconds === next.clockSeconds &&
        prev.activePlayerNumber === next.activePlayerNumber &&
        prev.activePlayerStamina === next.activePlayerStamina &&
        prev.shotCharge === next.shotCharge &&
        prev.goalBannerText === next.goalBannerText &&
        prev.penalty.phase === next.penalty.phase &&
        prev.penalty.turn === next.penalty.turn &&
        prev.penalty.round === next.penalty.round &&
        prev.penalty.homeScore === next.penalty.homeScore &&
        prev.penalty.awayScore === next.penalty.awayScore &&
        prev.penalty.resultBanner === next.penalty.resultBanner &&
        prev.penalty.power === next.penalty.power &&
        prev.penalty.keeperCommitted === next.penalty.keeperCommitted &&
        prev.penalty.homeKicks.length === next.penalty.homeKicks.length &&
        prev.penalty.awayKicks.length === next.penalty.awayKicks.length
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    soundEngine.unlock();
    const eng = engineRef.current!;
    eng.startNewMatch(selectedMode, selectedFormation, selectedDifficulty);
    syncHud();
  }, [selectedMode, selectedFormation, selectedDifficulty, syncHud]);

  const handlePauseToggle = useCallback(() => {
    const eng = engineRef.current!;
    if (eng.screen === 'PLAYING') {
      eng.screen = 'PAUSED';
    } else if (eng.screen === 'PAUSED') {
      eng.screen = 'PLAYING';
    }
    syncHud();
  }, [syncHud]);

  const handleReturnToTitle = useCallback(() => {
    const eng = engineRef.current!;
    eng.mode = 'MATCH';
    eng.screen = 'TITLE';
    eng.setupTeams();
    syncHud();
  }, [syncHud]);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  // Keyboard & Window Blur Listeners
  useEffect(() => {
    const clearHeld = () => {
      const inp = inputRef.current;
      inp.up = false;
      inp.down = false;
      inp.left = false;
      inp.right = false;
      inp.analogX = 0;
      inp.analogY = 0;
      inp.sprint = false;
      inp.shootHeld = false;
      inp.mouseDown = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const eng = engineRef.current!;

      if (code === 'Escape') {
        if (eng.screen === 'PLAYING' || eng.screen === 'PAUSED') {
          e.preventDefault();
          handlePauseToggle();
          return;
        }
      }

      if (eng.screen === 'TITLE' && code === 'Enter') {
        e.preventDefault();
        handleStart();
        return;
      }

      if (eng.screen !== 'PLAYING') return;

      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') {
        e.preventDefault();
        inp.up = true;
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        e.preventDefault();
        inp.down = true;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        inp.left = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        inp.right = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        inp.sprint = true;
      } else if (code === 'Space' || code === 'KeyK') {
        e.preventDefault();
        if (!inp.shootHeld) {
          inp.shootJustPressed = true;
        }
        inp.shootHeld = true;
      } else if (code === 'KeyJ' || code === 'KeyE' || code === 'KeyX') {
        e.preventDefault();
        if (!e.repeat) {
          inp.passJustPressed = true;
        }
      } else if (code === 'KeyL' || code === 'KeyQ' || code === 'KeyC') {
        e.preventDefault();
        if (!e.repeat) {
          inp.throughJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') inp.up = false;
      else if (code === 'KeyS' || code === 'ArrowDown') inp.down = false;
      else if (code === 'KeyA' || code === 'ArrowLeft') inp.left = false;
      else if (code === 'KeyD' || code === 'ArrowRight') inp.right = false;
      else if (code === 'ShiftLeft' || code === 'ShiftRight') inp.sprint = false;
      else if (code === 'Space' || code === 'KeyK') {
        if (inp.shootHeld) {
          inp.shootJustReleased = true;
        }
        inp.shootHeld = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearHeld();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handlePauseToggle, handleStart]);

  // Isolated 60fps Canvas Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      const eng = engineRef.current!;
      const inp = inputRef.current;

      eng.update(rawDt, inp);

      // Clear single-frame edge triggers
      inp.shootJustPressed = false;
      inp.shootJustReleased = false;
      inp.passJustPressed = false;
      inp.throughJustPressed = false;
      inp.mouseJustPressed = false;
      inp.mouseJustReleased = false;

      renderGame(ctx, eng, window.innerWidth, window.innerHeight);

      hudTimer += rawDt;
      if (hudTimer >= 0.08) {
        hudTimer = 0;
        syncHud();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [syncHud]);

  // Mouse handlers on canvas for intuitive Penalty Shootout aim & keeper dive
  const updateMouseGoalCoords = (clientX: number, clientY: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { goalLeft, goalRight, goalTop, goalBottom } = getPenaltyGoalBounds(
      w,
      h,
    );
    const goalW = goalRight - goalLeft;
    const goalH = goalBottom - goalTop;
    const normX = ((clientX - (goalLeft + goalRight) / 2) / (goalW / 2));
    const normY = (goalBottom - clientY) / goalH;

    inputRef.current.mouseNormX = Math.max(-1.22, Math.min(1.22, normX));
    inputRef.current.mouseNormY = Math.max(0.04, Math.min(1.22, normY));
    inputRef.current.mouseActive = true;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (engineRef.current?.mode === 'PENALTY_SHOOTOUT') {
      updateMouseGoalCoords(e.clientX, e.clientY);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    soundEngine.unlock();
    const eng = engineRef.current;
    if (eng?.mode === 'PENALTY_SHOOTOUT' && eng?.screen === 'PLAYING') {
      updateMouseGoalCoords(e.clientX, e.clientY);
      // On touch during attacking turn, dragging aims the target while the HOLD SHOOT button fires;
      // on mouse (or on goalkeeper save turn), tapping the goal triggers immediately.
      if (e.pointerType === 'touch' && eng.penalty.turn === 'HOME' && showTouchControls) {
        return;
      }
      inputRef.current.mouseDown = true;
      inputRef.current.mouseJustPressed = true;
    }
  };

  const handleCanvasPointerUp = () => {
    if (inputRef.current.mouseDown) {
      inputRef.current.mouseDown = false;
      inputRef.current.mouseJustReleased = true;
    }
  };

  const totalPoss =
    hud.stats.homePossessionTicks + hud.stats.awayPossessionTicks;
  const homePossPct =
    totalPoss > 0
      ? Math.round((hud.stats.homePossessionTicks / totalPoss) * 100)
      : 50;
  const awayPossPct = 100 - homePossPct;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#08120c] text-slate-50">
      {/* Isolated 60fps Game Canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={handleCanvasPointerMove}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        className={`block h-full w-full ${
          hud.screen === 'PLAYING' && hud.mode === 'PENALTY_SHOOTOUT'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      />

      {/* =================================================================== */}
      {/* TITLE SCREEN OVERLAY                                                */}
      {/* =================================================================== */}
      {hud.screen === 'TITLE' && (
        <div className="absolute inset-0 flex flex-col justify-between overflow-y-auto bg-gradient-to-r from-[#07110c]/94 via-[#07110c]/74 to-[#07110c]/25 p-5 sm:p-8 md:p-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-medium text-slate-300">
              <span>11v11 Pitch</span>
              <span aria-hidden="true">·</span>
              <span>Penalty Shootout</span>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-900/80 text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="max-w-lg space-y-7">
            {/* Bespoke SVG Title Lockup */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 52 52"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M26 3L46 11V25C46 37.2 37.3 45.6 26 49C14.7 45.6 6 37.2 6 25V11L26 3Z"
                    fill="#0F172A"
                    stroke="#F8FAFC"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M26 9V43M13 21H39"
                    stroke="#22C55E"
                    strokeWidth="2"
                    strokeOpacity="0.65"
                  />
                  <circle
                    cx="26"
                    cy="25"
                    r="8.5"
                    fill="#2563EB"
                    stroke="#F8FAFC"
                    strokeWidth="2"
                  />
                  <text
                    x="26"
                    y="29"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    11
                  </text>
                </svg>
                <h1 className="font-display text-6xl font-extrabold tracking-tight text-white md:text-7xl">
                  PITCH 11
                </h1>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-slate-300">
                Full-squad 11-a-side football with fluid sprint and dribble
                physics, tactical AI formations, and a goal-facing penalty
                shootout.
              </p>
            </div>

            {/* Match Setup Controls */}
            <div className="space-y-4 border-t border-white/15 pt-5">
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-300">
                  Game Mode
                </span>
                <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('MATCH')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'MATCH'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    11v11 Match
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMode('PENALTY_SHOOTOUT')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'PENALTY_SHOOTOUT'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Penalty Shootout
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                {selectedMode === 'MATCH' && (
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-300">
                      Formation
                    </span>
                    <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                      {(['4-3-3', '4-4-2', '3-5-2'] as FormationId[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setSelectedFormation(f)}
                            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 font-mono-tabular text-xs font-semibold transition-colors ${
                              selectedFormation === f
                                ? 'bg-slate-200 text-slate-950'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {f}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-slate-300">
                    Difficulty
                  </span>
                  <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                    {(
                      [
                        { id: 'AMATEUR', label: 'Amateur' },
                        { id: 'PRO', label: 'Pro' },
                        { id: 'WORLD_CLASS', label: 'World Class' },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDifficulty(d.id)}
                        className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selectedDifficulty === d.id
                            ? 'bg-slate-200 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-emerald-500 px-7 py-3.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Play className="h-4 w-4 fill-current" />
                {selectedMode === 'MATCH'
                  ? 'Kick Off Match'
                  : 'Start Penalty Shootout'}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-300">
            WASD / Arrows Move · Shift Sprint · J Pass / Switch · L Through Ball ·
            Space Shoot / Tackle · Esc Pause
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ACTIVE 11v11 MATCH HUD (LOW-OCCLUSION, POINTER-EVENTS-NONE)         */}
      {/* =================================================================== */}
      {hud.screen !== 'TITLE' && hud.mode === 'MATCH' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          {/* Top Broadcast Scoreboard */}
          <div className="flex items-start justify-between gap-2">
            {/* Compact Player Stamina Indicator on Mobile Top-Left */}
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-2.5 py-1.5 md:hidden">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
              </div>
              <div className="mt-1 h-1 w-16 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>
            <div className="hidden w-28 md:block" />

            <div className="flex items-center overflow-hidden rounded-md border border-white/15 bg-slate-950/90 shadow-lg">
              <div className="flex items-center gap-2 border-r border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  HOME
                </span>
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.homeScore}
                </span>
              </div>
              <div className="flex flex-col items-center px-2.5 py-1 sm:px-3.5">
                <span className="font-mono-tabular text-xs font-bold leading-tight text-emerald-400 sm:text-sm">
                  {formatMatchClock(hud.clockSeconds, hud.halfDurationSeconds)}
                </span>
                <span className="text-[10px] font-medium leading-tight text-slate-400">
                  {hud.half === 1 ? '1st' : '2nd'}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.awayScore}
                </span>
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  AWAY
                </span>
                <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
              </div>
            </div>

            {/* Touch Toggle, Sound & Pause Buttons */}
            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowTouchControls((v) => !v)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                  showTouchControls
                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/15 bg-slate-950/88 text-slate-200 hover:bg-slate-800'
                }`}
                aria-label="Toggle on-screen touch controls"
                title="Toggle touch controls"
              >
                <Gamepad2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause match"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Goal Celebration Banner */}
          {hud.goalBannerText && (
            <div className="mx-auto my-auto flex flex-col items-center rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-4xl font-extrabold tracking-tight text-amber-400 sm:text-5xl">
                {hud.goalBannerText}
              </div>
              {hud.goalBannerSub && (
                <div className="mt-1 font-mono-tabular text-sm font-medium text-slate-200">
                  {hud.goalBannerSub}
                </div>
              )}
            </div>
          )}

          {/* Bottom-left Controlled Player Status (Desktop) */}
          <div className="hidden items-end justify-between md:flex">
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span className="font-mono-tabular text-slate-300">
                  {hud.activePlayerStamina}% Stamina
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400 transition-transform duration-75"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300">
              J Pass / Switch · L Through · Hold Space Shoot · Space (Off-ball)
              Tackle
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PENALTY SHOOTOUT HUD                                                */}
      {/* =================================================================== */}
      {hud.screen !== 'TITLE' && hud.mode === 'PENALTY_SHOOTOUT' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <div className="w-20" />

            {/* Penalty Shootout Scoreboard & Kick Pips */}
            <div className="flex flex-col items-center gap-2 rounded-md border border-white/15 bg-slate-950/92 px-5 py-2.5 shadow-xl">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                  <span className="font-display text-lg font-bold text-white">
                    HOME
                  </span>
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.homeScore}
                  </span>
                </div>

                <div className="border-x border-white/15 px-3 text-center">
                  <div className="text-[11px] font-semibold text-amber-400">
                    {hud.penalty.suddenDeath
                      ? 'Sudden Death'
                      : `Round ${hud.penalty.round} of 5`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {hud.penalty.turn === 'HOME'
                      ? 'Your Kick'
                      : 'Your Save (GK)'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.awayScore}
                  </span>
                  <span className="font-display text-lg font-bold text-white">
                    AWAY
                  </span>
                  <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-white/10 pt-2">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-500">vs</span>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause shootout"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Outcome Callout */}
          {hud.penalty.phase === 'RESULT' && hud.penalty.resultBanner && (
            <div className="mx-auto my-auto rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-5xl font-extrabold tracking-tight text-amber-400">
                {hud.penalty.resultBanner}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-200">
                {hud.penalty.resultSub}
              </div>
            </div>
          )}

          {/* Contextual Shootout Instruction Line */}
          {hud.penalty.phase !== 'FINISHED' && (
            <div className="mx-auto rounded-md border border-white/15 bg-slate-950/88 px-4 py-2 text-xs font-medium text-slate-200">
              {hud.penalty.turn === 'HOME'
                ? 'Attack: Aim with Mouse or Arrows · Hold Space / Click to Charge & Release to Shoot'
                : hud.penalty.keeperCommitted
                  ? 'Dive locked — hold your nerve!'
                  : 'Goalkeeper: Click any zone in the goal or press A / W / D / Arrows to Dive'}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PAUSE MODAL                                                         */}
      {/* =================================================================== */}
      {hud.screen === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="font-display text-3xl font-bold text-white">
              Match Paused
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {hud.mode === 'MATCH'
                ? `Home ${hud.homeScore} – ${hud.awayScore} Away`
                : `Shootout ${hud.penalty.homeScore} – ${hud.penalty.awayScore}`}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full rounded-md border border-white/15 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* HALFTIME MODAL                                                      */}
      {/* =================================================================== */}
      {hud.screen === 'HALFTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-medium text-emerald-400">
              Half-Time Whistle
            </div>
            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  engineRef.current!.resumeSecondHalf();
                  syncHud();
                }}
                className="w-full rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Start Second Half
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* FULL-TIME MODAL (WITH INSTANT PENALTY SHOOTOUT OPTION ON DRAW!)     */}
      {/* =================================================================== */}
      {hud.screen === 'FULLTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <Trophy className="h-4 w-4" />
              <span>
                {hud.homeScore > hud.awayScore
                  ? 'Full-Time · Home Victory'
                  : hud.awayScore > hud.homeScore
                    ? 'Full-Time · Away Victory'
                    : 'Full-Time · Match Drawn'}
              </span>
            </div>

            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {hud.homeScore === hud.awayScore && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startPenaltyFromDraw();
                    syncHud();
                  }}
                  className="w-full rounded-md bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300"
                >
                  Decide by Penalty Shootout
                </button>
              )}
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PENALTY SHOOTOUT FINISHED MODAL                                     */}
      {/* =================================================================== */}
      {hud.mode === 'PENALTY_SHOOTOUT' &&
        hud.screen === 'PLAYING' &&
        hud.penalty.phase === 'FINISHED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
            <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
              <div className="mx-auto mb-2 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-400/15 text-amber-400">
                <Trophy className="h-6 w-6" />
              </div>
              <h2 className="font-display text-4xl font-extrabold text-white">
                {hud.penalty.winner === 'HOME'
                  ? 'Penalty Shootout Winners'
                  : 'Shootout Defeat'}
              </h2>
              <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-200">
                HOME {hud.penalty.homeScore} – {hud.penalty.awayScore} AWAY
              </p>

              <div className="mt-4 flex justify-center gap-6 border-y border-white/10 py-3">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startNewMatch(
                      'PENALTY_SHOOTOUT',
                      selectedFormation,
                      selectedDifficulty,
                    );
                    syncHud();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  <RotateCcw className="h-4 w-4" />
                  Play Shootout Again
                </button>
                <button
                  type="button"
                  onClick={handleReturnToTitle}
                  className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        )}

      {/* =================================================================== */}
      {/* MOBILE MULTI-TOUCH GAMEPAD OVERLAY                                  */}
      {/* =================================================================== */}
      {hud.screen === 'PLAYING' && showTouchControls && (
        <MobileControls
          mode={hud.mode}
          penaltyTurn={hud.penalty.turn}
          penaltyPhase={hud.penalty.phase}
          inputRef={inputRef}
        />
      )}

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
}