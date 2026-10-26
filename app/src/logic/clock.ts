/** Circular clock-dial math — pure, unit-tested, no RN. Hours 1-12, minutes snap to 5. */

/** Angle in degrees clockwise from 12 o'clock for a point relative to the dial center. */
export const angleOf = (dx: number, dy: number): number =>
  (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;

export const hourAt = (deg: number): number => {
  const i = Math.round(deg / 30) % 12;
  return i === 0 ? 12 : i;
};

export const minuteAt = (deg: number): number => (Math.round(deg / 30) % 12) * 5;

/** Clock-face angle of an hour (1-12) or a 5-step minute, for the hand. */
export const handAngle = (h: number, m: number, stage: 'hour' | 'minute'): number =>
  stage === 'hour' ? (h % 12) * 30 : m * 6;

/** "18:00" -> { h: 6, m: 0, pm: true } */
export const splitTime = (time: string): { h: number; m: number; pm: boolean } => {
  const [h24, m] = time.split(':').map(Number);
  return {
    h: h24 % 12 === 0 ? 12 : h24 % 12,
    m: Math.min(55, Math.floor(m / 5) * 5),
    pm: h24 >= 12,
  };
};

/** The inverse — "HH:MM" (24h) back to the editor. */
export const joinTime = (h: number, m: number, pm: boolean): string => {
  const h24 = pm ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
