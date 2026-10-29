/**
 * Grouping of fuse openings into faults (US10 · F-48, Scope v6.0 §3.4 / RF-ALR-04, RF-CIC).
 * A fault is the openings of the same fuse set whose opening instants are separated by less than
 * the grouping window. Pure function: the window is a parameter, and the events come already read
 * from `alarms` (event code 13xx20: SET = fuse opened, CLEAR = fuse closed).
 *
 * Rules:
 *   - per fuse set (`fuses_sets.id`), never per node, so two branches of one node stay separate (F-50)
 *   - only openings (SET) group; a close never splits or joins faults
 *   - chained: an opening joins the fault when it is less than the window after the previous opening
 *     of that set, not after the first one. A gap equal to the window starts a new fault.
 *     (Chained vs anchored to the first opening is pending Product Owner confirmation.)
 *   - a fault is OPEN while any of its openings has no close, and RESOLVED when all are closed;
 *     it ends at the last close (RF-CIC: resolution is as reported by the device)
 *   - momentary openings count (RF-ALR-05): a close reported after the opening, however soon, still
 *     leaves a (resolved) fault
 *
 * Events at the same instant: the data does not say which came first. `alarms` cannot even hold a
 * SET and a CLEAR of one device with the same code at the same `recorded_at` (primary key
 * hw_id, recorded_at, event_code), so a SET and a CLEAR of one fuse at one instant is not expected.
 * If it is given anyway, the order is not guessed from the events: the fuse is taken as open after
 * that instant, so an active fault is never hidden. Output never depends on the order of the input.
 */
export interface FuseEvent {
  /** `fuses_sets.id` of the fuse that reported. */
  fusesSetId: number;
  /** `fuses.custom_id`. */
  fuseId: string;
  /** `fuses.phase` as stored; classify it with `classifyFault`. */
  phase: string;
  /** SET = opened, CLEAR = closed (alarms.event_type). */
  type: 'SET' | 'CLEAR';
  at: Date;
}

export interface FuseOpening {
  fuseId: string;
  phase: string;
  openedAt: Date;
  /** null while the fuse has not reported its close. */
  closedAt: Date | null;
}

export type FaultState = 'OPEN' | 'RESOLVED';

export interface FuseFault {
  fusesSetId: number;
  /** In opening order. */
  openings: FuseOpening[];
  /** First opening. */
  startedAt: Date;
  /** Last close once every opening is closed; null while the fault is open. */
  endedAt: Date | null;
  state: FaultState;
}

const MINUTE_MS = 60_000;

/**
 * Faults of the given events, oldest first (ties by fuse set). Invalid input throws:
 * a non-positive or non-finite window, or an invalid date.
 * Two cases are ignored on purpose: a SET on a fuse that is already open (a repeated alarm must not
 * stretch a chain) and a CLEAR with no open SET before it (its opening is outside the events read).
 */
export function groupFuseFaults(
  events: readonly FuseEvent[],
  windowMinutes: number,
): FuseFault[] {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new RangeError(
      'The grouping window must be a positive number of minutes',
    );
  }
  const windowMs = windowMinutes * MINUTE_MS;

  const bySet = new Map<number, FuseEvent[]>();
  for (const event of events) {
    if (Number.isNaN(event.at.getTime())) {
      throw new RangeError(`Invalid date in the event of fuse ${event.fuseId}`);
    }
    const setEvents = bySet.get(event.fusesSetId);
    if (setEvents) setEvents.push(event);
    else bySet.set(event.fusesSetId, [event]);
  }

  const faults: FuseFault[] = [];
  for (const [fusesSetId, setEvents] of bySet) {
    faults.push(...faultsOfSet(fusesSetId, setEvents, windowMs));
  }
  return faults.sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      a.fusesSetId - b.fusesSetId,
  );
}

function faultsOfSet(
  fusesSetId: number,
  events: FuseEvent[],
  windowMs: number,
): FuseFault[] {
  // Same instant: CLEAR before SET, so a fuse with both ends open and its reopening is kept;
  // then by fuse and phase, so the result does not depend on the order of the input.
  const ordered = [...events].sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      Number(b.type === 'CLEAR') - Number(a.type === 'CLEAR') ||
      compareText(a.fuseId, b.fuseId) ||
      compareText(a.phase, b.phase),
  );

  const openings: FuseOpening[] = [];
  const stillOpen = new Map<string, FuseOpening>();
  for (const event of ordered) {
    const open = stillOpen.get(event.fuseId);
    if (event.type === 'SET') {
      if (open) continue;
      const opening: FuseOpening = {
        fuseId: event.fuseId,
        phase: event.phase,
        openedAt: new Date(event.at.getTime()),
        closedAt: null,
      };
      openings.push(opening);
      stillOpen.set(event.fuseId, opening);
    } else if (open) {
      open.closedAt = new Date(event.at.getTime());
      stillOpen.delete(event.fuseId);
    }
  }

  const faults: FuseFault[] = [];
  let current: FuseOpening[] = [];
  for (const opening of openings) {
    const previous = current[current.length - 1];
    if (
      previous &&
      opening.openedAt.getTime() - previous.openedAt.getTime() >= windowMs
    ) {
      faults.push(buildFault(fusesSetId, current));
      current = [];
    }
    current.push(opening);
  }
  if (current.length > 0) faults.push(buildFault(fusesSetId, current));
  return faults;
}

/** Code-unit order, the same in every environment (unlike localeCompare). */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildFault(fusesSetId: number, openings: FuseOpening[]): FuseFault {
  const closes = openings.map((opening) => opening.closedAt);
  const resolved = closes.every((closedAt) => closedAt !== null);
  const lastClose = resolved
    ? Math.max(...closes.map((closedAt) => (closedAt as Date).getTime()))
    : null;

  return {
    fusesSetId,
    openings,
    startedAt: openings[0].openedAt,
    endedAt: lastClose === null ? null : new Date(lastClose),
    state: resolved ? 'RESOLVED' : 'OPEN',
  };
}
