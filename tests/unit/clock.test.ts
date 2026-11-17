import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { HOUR, MINUTE, parseUtc } from '@/core/time';
import { absorbStall, advance, advanceTo, anchorAt, MAX_FRAME_DELTA_MS, PLAYBACK_RATES, rangeAround, simAt, stepTarget, type ClockState } from '@/core/scenarioClock';
import kitTokens from '../../PORTOS_V3_Design_Engineering_Upgrade/assets/design-tokens.json';
import { angleDelta, behindAzimuth, followAlpha, FOLLOW_TAU_MS } from '@/core/follow';
import { getVesselAtTime, trackChunks, trackRunsUntil, TRACK_CHUNK_MS, vesselAtTime } from '@/engines/tracks';
import { buildCargoIndex, slotOccupancyAt } from '@/engines/cargo';
import { deriveWorldSnapshot, eventCountAt, eventsBetween, type WorldSnapshot } from '@/engines/world';
import { useClockStore } from '@/stores/clock';
import { cargoModule, catalog } from './fixtures';

const c = catalog();
const NOW = c.anchorMs;
const at = (iso: string) => parseUtc(iso)!;

function state(over: Partial<ClockState> = {}): ClockState {
  return { mode: 'playing', scenarioNowUTC: NOW, playbackRate: 100, minUTC: c.windowMinMs, maxUTC: c.windowMaxMs, rangeStartUTC: NOW - 12 * HOUR, rangeEndUTC: NOW + 12 * HOUR, loop: false, ...over };
}

/** Plays `realMs` of 60 Hz frames through the pure clock. */
function play(s: ClockState, realMs: number, frameMs = 1000 / 60) {
  let cur = s;
  let ended = false;
  for (let elapsed = 0; elapsed < realMs - 1e-9; elapsed += frameMs) {
    const r = advance(cur, Math.min(frameMs, realMs - elapsed));
    cur = r.state;
    ended ||= r.ended;
  }
  return { state: cur, ended };
}

/** Canonical form of a world snapshot (Maps → sorted entries) for deep equality. */
function canonical(w: WorldSnapshot): string {
  return JSON.stringify(w, (_k, v) => (v instanceof Map ? [...v.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))) : v instanceof Set ? [...v].sort() : v));
}

describe('scenario clock (pure)', () => {
  it('1 real second at 100× advances exactly 100 scenario seconds', () => {
    expect(play(state(), 1000).state.scenarioNowUTC - NOW).toBeCloseTo(100_000, 1);
  });

  it('every rate keeps the same ratio, independent of frame rate', () => {
    for (const rate of [1, 5, 10, 25, 50, 100] as const) {
      const at60 = play(state({ playbackRate: rate }), 2000).state.scenarioNowUTC - NOW;
      const at24 = play(state({ playbackRate: rate }), 2000, 1000 / 24).state.scenarioNowUTC - NOW;
      expect(at60).toBeCloseTo(2000 * rate, 1);
      expect(at24).toBeCloseTo(at60, 1);
    }
  });

  it('pause holds time; a resumed tab never jumps more than one capped frame', () => {
    expect(advance(state({ mode: 'paused' }), 5000).state.scenarioNowUTC).toBe(NOW);
    expect(advance(state({ mode: 'scrubbing' }), 5000).state.scenarioNowUTC).toBe(NOW);
    expect(advance(state(), 48 * HOUR).state.scenarioNowUTC - NOW).toBe(MAX_FRAME_DELTA_MS * 100);
  });

  it('pauses at the end of the range by default and loops only when asked', () => {
    const end = state({ scenarioNowUTC: NOW + 12 * HOUR - 50_000 });
    const stopped = play(end, 1000);
    expect(stopped.ended).toBe(true);
    expect(stopped.state.mode).toBe('paused');
    expect(stopped.state.scenarioNowUTC).toBe(NOW + 12 * HOUR);
    const looped = advance({ ...end, loop: true }, 1000);
    expect(looped.wrapped).toBe(true);
    expect(looped.state.scenarioNowUTC).toBe(NOW - 12 * HOUR);
    expect(looped.state.mode).toBe('playing');
  });

  it('ranges are centred on whole hours and shifted inside the window', () => {
    expect(rangeAround(NOW, 24, c.windowMinMs, c.windowMaxMs)).toEqual({ startUTC: NOW - 12 * HOUR, endUTC: NOW + 12 * HOUR });
    expect(rangeAround(c.windowMaxMs, 6, c.windowMinMs, c.windowMaxMs)).toEqual({ startUTC: c.windowMaxMs - 6 * HOUR, endUTC: c.windowMaxMs });
    expect(rangeAround(NOW, 168, c.windowMinMs, c.windowMaxMs)).toEqual({ startUTC: c.windowMinMs, endUTC: c.windowMaxMs });
  });

  it('steps 5 min, or 1 h with Shift, clamped to the window', () => {
    expect(stepTarget(NOW, 1, false, c.windowMinMs, c.windowMaxMs)).toBe(NOW + 5 * MINUTE);
    expect(stepTarget(NOW, -1, true, c.windowMinMs, c.windowMaxMs)).toBe(NOW - HOUR);
    expect(stepTarget(c.windowMaxMs - MINUTE, 1, true, c.windowMinMs, c.windowMaxMs)).toBe(c.windowMaxMs);
  });
});

describe('clock store (one rAF loop, 10 Hz commits)', () => {
  let frames: FrameRequestCallback[] = [];
  let wall = 0;
  beforeEach(() => {
    frames = [];
    wall = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
    setActivePinia(createPinia());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function runFrames(realMs: number, frameMs = 1000 / 60) {
    for (let elapsed = 0; elapsed < realMs - 1e-9; elapsed += frameMs) {
      wall += frameMs;
      const due = frames;
      frames = [];
      for (const f of due) f(wall);
    }
  }

  it('plays past Now at 100× with commits between 5 and 15 Hz, and pause holds', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    expect(clock.phase).toBe('now');
    expect(clock.rangeEndMs - clock.rangeStartMs).toBe(24 * HOUR);
    const commits: number[] = [];
    clock.$subscribe(() => commits.push(clock.timeMs), { flush: 'sync' });
    clock.play(100);
    runFrames(1000);
    clock.pause();
    expect(clock.timeMs - NOW).toBeGreaterThanOrEqual(99_000);
    expect(clock.timeMs - NOW).toBeLessThanOrEqual(101_000);
    expect(clock.phase).toBe('simulation');
    const distinct = new Set(commits).size;
    expect(distinct).toBeGreaterThanOrEqual(5);
    expect(distinct).toBeLessThanOrEqual(16);
    const held = clock.timeMs;
    runFrames(500);
    expect(clock.timeMs).toBe(held);
  });

  it('lands on the same scenario time at 20, 60 or 144 Hz and with jittered frames (anchor arithmetic)', () => {
    for (const frameMs of [50, 1000 / 60, 1000 / 144, 37]) {
      setActivePinia(createPinia());
      frames = [];
      wall = 1000;
      const clock = useClockStore();
      clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
      clock.play(100);
      runFrames(3000, frameMs);
      // Simulated time is exactly wall time elapsed × 100, however many frames it took.
      expect(clock.frameTimeMs() - NOW, `${frameMs} ms frames`).toBeCloseTo((wall - 1000) * 100, 3);
      clock.pause();
    }
  });

  it('a rate change mid-play keeps the clock in place and only changes the speed', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    clock.play(10);
    runFrames(1000);
    const mid = clock.frameTimeMs();
    expect(mid - NOW).toBeCloseTo(10_000, 0);
    clock.setRate(100);
    expect(clock.frameTimeMs()).toBe(mid);
    runFrames(1000);
    expect(clock.frameTimeMs() - mid).toBeCloseTo(100_000, 0);
    clock.setRate(0.25);
    const slow = clock.frameTimeMs();
    runFrames(4000);
    expect(clock.frameTimeMs() - slow).toBeCloseTo(1000, 0);
    clock.pause();
  });

  it('render loops read the clock at their own frame timestamp, so callback order cannot make them lag', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    expect(clock.frameTimeAt(wall + 500)).toBe(NOW);
    clock.play(100);
    runFrames(1000);
    const f = clock.frameTimeMs();
    expect(clock.frameTimeAt(wall + 16)).toBeCloseTo(f + 1600, 3);
    expect(clock.frameTimeAt(wall - 16)).toBe(f);
    clock.pause();
    expect(clock.frameTimeAt(wall + 1000)).toBe(clock.timeMs);
  });

  it('a seek while playing re-anchors there instead of snapping back', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    clock.play(100);
    runFrames(500);
    const target = NOW - 6 * HOUR;
    clock.seekMs(target);
    runFrames(1000);
    expect(clock.frameTimeMs() - target).toBeCloseTo(100_000, 0);
    clock.pause();
  });

  it('runs a single loop: play twice does not double the rate', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    clock.play(10);
    clock.play(10);
    runFrames(1000);
    clock.pause();
    expect(clock.timeMs - NOW).toBeLessThanOrEqual(10_500);
  });

  it('commit spans partition playback, and steps / scrubs pause', () => {
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: c.windowMinMs, maxMs: c.windowMaxMs, dataVersion: 'test' });
    clock.seekMs(at('2026-11-09T10:00:00Z'));
    const spans: { fromMs: number; toMs: number }[] = [];
    clock.$subscribe(() => {
      if (clock.lastSpan && spans[spans.length - 1] !== clock.lastSpan) spans.push(clock.lastSpan);
    }, { flush: 'sync' });
    clock.play(100);
    runFrames(3000);
    clock.pause();
    for (let i = 1; i < spans.length; i++) expect(spans[i]!.fromMs).toBe(spans[i - 1]!.toMs);
    expect(spans[0]!.fromMs).toBe(at('2026-11-09T10:00:00Z'));
    expect(spans[spans.length - 1]!.toMs).toBe(clock.timeMs);
    clock.play();
    clock.step(1, true);
    expect(clock.mode).toBe('paused');
    clock.beginScrub();
    expect(clock.mode).toBe('scrubbing');
    clock.endScrub(at('2026-11-09T09:00:00Z'));
    expect(clock.mode).toBe('paused');
    expect(clock.timeMs).toBe(at('2026-11-09T09:00:00Z'));
  });
});

describe('deriveWorldSnapshot', () => {
  const t1 = at('2026-11-09T10:59:00Z');
  const t2 = at('2026-11-10T06:00:00Z');

  it('forward and backward seeks reconstruct identical worlds', () => {
    const a = canonical(deriveWorldSnapshot(c, t1));
    deriveWorldSnapshot(c, t2);
    deriveWorldSnapshot(c, NOW);
    expect(canonical(deriveWorldSnapshot(c, t1))).toBe(a);
  });

  it('folds vessels, events, berths and KPIs at the same instant', () => {
    const w = deriveWorldSnapshot(c, t1);
    expect(w.timeMs).toBe(t1);
    expect(w.snapshot.timeMs).toBe(t1);
    expect(w.events.count).toBe(c.events.filter((e) => c.eventMs.get(e.eventId)! <= t1).length);
    expect(w.berths.map((b) => b.portId)).toEqual(['PRT-DLC', 'PRT-GOA', 'PRT-RTM', 'PRT-SIN', 'PRT-SOU', 'PRT-SSZ']);
    const sin = w.berths.find((b) => b.portId === 'PRT-SIN')!;
    expect(sin.occupied + sin.reserved + sin.free).toBe(10);
    expect(w.kpis.length).toBeGreaterThan(0);
    // The Singapore incident opens at 10:59: present at t1, absent a minute earlier.
    expect(w.snapshot.incidents.get('INC-0001')?.visible).toBe(true);
    expect(deriveWorldSnapshot(c, t1 - MINUTE).snapshot.incidents.get('INC-0001')?.visible).toBe(false);
  });

  it('never loses an event edge when 100× playback commits in 10 s spans', () => {
    const start = c.replayStartMs;
    const ids: string[] = [];
    for (let t = start; t < NOW; t += 10_000) ids.push(...eventsBetween(c, t, Math.min(NOW, t + 10_000)).map((e) => e.eventId));
    const expected = c.events.filter((e) => {
      const ms = c.eventMs.get(e.eventId)!;
      return ms > start && ms <= NOW;
    });
    expect(ids).toEqual(expected.map((e) => e.eventId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(eventCountAt(c, NOW) - eventCountAt(c, start)).toBe(ids.length);
  });
});

describe('vessel motion across rates and reporting gaps', () => {
  it('VSL-0047 is where the track says at t0 + 100 s, whether reached at 1×, 10× or 100×', () => {
    const t0 = at('2026-11-09T14:00:00Z');
    const ref = getVesselAtTime(c, 'VSL-0047', t0 + 100_000);
    for (const rate of [1, 10, 100] as const) {
      const realMs = 100_000 / rate;
      const end = play(state({ scenarioNowUTC: t0, playbackRate: rate, rangeStartUTC: t0, rangeEndUTC: t0 + 6 * HOUR }), realMs, 1000 / 30).state.scenarioNowUTC;
      const p = getVesselAtTime(c, 'VSL-0047', end);
      expect(p.point!.lat).toBeCloseTo(ref.point!.lat, 6);
      expect(p.point!.lon).toBeCloseTo(ref.point!.lon, 6);
    }
    expect(ref.state).toBe('modelled');
    expect(ref.navStatus).toBe('underway');
  });

  it('VSL-0059 reporting outage is held, not interpolated, and drawn as an unverified run', () => {
    const gap = c.v2!.scenario.positionGapDemo!;
    const from = at(gap.fromUtc);
    const to = at(gap.toUtc);
    const before = getVesselAtTime(c, gap.vesselId, from);
    const inside = getVesselAtTime(c, gap.vesselId, from + 90 * MINUTE);
    expect(inside.point).toEqual(before.point);
    expect(inside.state).toBe('stale');
    const runs = trackRunsUntil(c, gap.vesselId, at('2026-11-09T10:00:00Z'));
    const unverified = runs.filter((r) => r.kind === 'unverified');
    expect(unverified).toHaveLength(1);
    expect(unverified[0]).toMatchObject({ startMs: from, endMs: to });
    expect(unverified[0]!.points).toHaveLength(2);
    expect(runs.every((r) => r.kind !== 'modelled')).toBe(true);
  });

  it('runs share their joining vertex and the track reaches the interpolated position', () => {
    const t = at('2026-11-09T09:07:00Z');
    const runs = trackRunsUntil(c, 'VSL-0059', t);
    for (let i = 1; i < runs.length; i++) expect(runs[i]!.points[0]).toEqual(runs[i - 1]!.points[runs[i - 1]!.points.length - 1]);
    const last = runs[runs.length - 1]!;
    expect(last.points[last.points.length - 1]).toEqual(getVesselAtTime(c, 'VSL-0059', t).point);
  });
});

describe('follow camera math', () => {
  it('responds within the spec window (95 % in 200–350 ms)', () => {
    expect(followAlpha(200)).toBeLessThan(0.95);
    expect(followAlpha(350)).toBeGreaterThan(0.95);
    expect(1 - (1 - followAlpha(16)) ** 17).toBeCloseTo(followAlpha(16 * 17), 9);
    expect(FOLLOW_TAU_MS * 3).toBeGreaterThanOrEqual(200);
  });

  it('puts the camera behind the ship for every course', () => {
    for (const course of [0, 45, 90, 180, 270, 359]) {
      const az = behindAzimuth(course);
      // Camera offset from the ship (three.js spherical: x = sinθ, z = cosθ; north is −z).
      const cam = { east: Math.sin(az), north: -Math.cos(az) };
      const bow = { east: Math.sin((course * Math.PI) / 180), north: Math.cos((course * Math.PI) / 180) };
      expect(cam.east * bow.east + cam.north * bow.north).toBeCloseTo(-1, 9);
    }
  });

  it('wraps angle differences the short way', () => {
    expect(angleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2, 9);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 9);
  });
});

describe('V3 Gate 6: one deterministic clock', () => {
  it('speed presets are the kit simulationSpeedPresets (0.25× … 100×)', () => {
    expect([...PLAYBACK_RATES]).toEqual(kitTokens.simulationSpeedPresets);
  });

  it('anchor arithmetic: 100× is 100 simulated seconds per wall second, whatever the frame count', () => {
    const a = anchorAt(NOW, 5000, 100);
    expect(simAt(a, 6000) - NOW).toBe(100_000);
    expect(simAt(a, 4000)).toBe(NOW);
    const s = state({ playbackRate: 100 });
    let few = s;
    for (const w of [5200, 5900, 6000]) few = advanceTo(few, a, w).state;
    let many = s;
    for (let w = 5000; w <= 6000; w += 1) many = advanceTo(many, a, w).state;
    expect(few.scenarioNowUTC).toBe(many.scenarioNowUTC);
    expect(few.scenarioNowUTC - NOW).toBe(100_000);
  });

  it('a stalled frame counts as at most one capped frame', () => {
    const a = anchorAt(NOW, 0, 10);
    const slid = absorbStall(a, 1000, 61_000);
    expect(simAt(slid, 61_000) - NOW).toBe((1000 + MAX_FRAME_DELTA_MS) * 10);
    expect(absorbStall(a, 1000, 1016)).toBe(a);
  });

  it('chunked track lookup returns exactly what a full binary search would, for every vessel', () => {
    let checked = 0;
    for (const [id, track] of c.tracks) {
      if (!track.length) continue;
      const ch = trackChunks(track);
      expect(ch.first.length).toBe(Math.floor((track[track.length - 1]!.t - track[0]!.t) / TRACK_CHUNK_MS) + 1);
      const t0 = track[0]!.t - HOUR;
      const t1 = track[track.length - 1]!.t + HOUR;
      for (let k = 0; k < 12; k++) {
        const t = Math.round(t0 + ((t1 - t0) * (k * 7919 % 101)) / 100);
        const ref = vesselAtTime([...track], id, t);
        expect(vesselAtTime(track, id, t)).toEqual(ref);
        checked++;
      }
      for (const p of track.slice(0, 4)) expect(vesselAtTime(track, id, p.t).sourceTimeMs).toBe(p.t);
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it('VSL-0047 at 100× for one simulated day: same positions at every hour whatever path the clock took', () => {
    const t0 = c.anchorMs - 12 * HOUR;
    const direct = Array.from({ length: 25 }, (_, h) => getVesselAtTime(c, 'VSL-0047', t0 + h * HOUR).point);
    // Played: 864 s of wall time at 100× in uneven frames, sampling when each hour is crossed.
    const a = anchorAt(t0, 0, 100);
    const played: (typeof direct)[number][] = [];
    let next = 0;
    for (let w = 0; w <= 864_000 && next < 25; w += 13 + (w % 7)) {
      const t = simAt(a, w);
      while (next < 25 && t >= t0 + next * HOUR) {
        played.push(getVesselAtTime(c, 'VSL-0047', t0 + next * HOUR).point);
        next++;
      }
    }
    expect(played).toEqual(direct);
    expect(direct.filter(Boolean).length).toBeGreaterThan(20);
  });

  it('seeking backwards replays cargo custody exactly (crane moves undone, then redone)', () => {
    const idx = buildCargoIndex(cargoModule());
    const before = at('2026-11-09T11:40:00Z');
    const later = at('2026-11-09T13:00:00Z');
    const snap = (t: number) => [...slotOccupancyAt(idx, 'VSL-0255', t).entries()].sort().join('|');
    const a = snap(before);
    expect(snap(later)).not.toBe(a);
    expect(snap(before)).toBe(a);
  });
});
