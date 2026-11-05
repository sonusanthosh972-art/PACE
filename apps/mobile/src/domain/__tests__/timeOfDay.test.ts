import { getGreeting, getGreetingTitle, getTimeOfDay, msUntilNextTimeOfDay } from '../timeOfDay';

describe('timeOfDay domain', () => {
  function makeDate(hour: number, minute = 0): Date {
    const d = new Date(2026, 10, 2, hour, minute);
    return d;
  }

  it('maps hours to correct time of day periods', () => {
    // Night / Deep night
    expect(getTimeOfDay(makeDate(0))).toBe('night');
    expect(getTimeOfDay(makeDate(4, 59))).toBe('night');

    // Morning
    expect(getTimeOfDay(makeDate(5, 0))).toBe('morning');
    expect(getTimeOfDay(makeDate(8, 30))).toBe('morning');
    expect(getTimeOfDay(makeDate(10, 59))).toBe('morning');

    // Afternoon
    expect(getTimeOfDay(makeDate(11, 0))).toBe('afternoon');
    expect(getTimeOfDay(makeDate(14, 0))).toBe('afternoon');
    expect(getTimeOfDay(makeDate(15, 59))).toBe('afternoon');

    // Evening
    expect(getTimeOfDay(makeDate(16, 0))).toBe('evening');
    expect(getTimeOfDay(makeDate(18, 59))).toBe('evening');

    // Night
    expect(getTimeOfDay(makeDate(19, 0))).toBe('night');
    expect(getTimeOfDay(makeDate(23, 59))).toBe('night');
  });

  it('generates natural, non-excessive greetings', () => {
    expect(getGreeting('morning')).toBe('Good morning · Today');
    expect(getGreeting('afternoon')).toBe('Good afternoon · Today');
    expect(getGreeting('evening')).toBe('Good evening · Today');
    expect(getGreeting('night')).toBe('Good evening · Tonight');
  });
});

describe('msUntilNextTimeOfDay', () => {
  const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 2, h, m, s);
  const MIN = 60_000;

  it('counts down to the next period start the same day', () => {
    expect(msUntilNextTimeOfDay(at(4, 30))).toBe(30 * MIN); // → 05:00 morning
    expect(msUntilNextTimeOfDay(at(10, 59, 30))).toBe(30_000); // → 11:00 afternoon
    expect(msUntilNextTimeOfDay(at(11, 0))).toBe(5 * 60 * MIN); // → 16:00 evening
    expect(msUntilNextTimeOfDay(at(18, 0))).toBe(60 * MIN); // → 19:00 night
  });

  it('rolls over midnight to 05:00 the next morning', () => {
    expect(msUntilNextTimeOfDay(at(19, 0))).toBe(10 * 60 * MIN);
    expect(msUntilNextTimeOfDay(at(23, 30))).toBe(5.5 * 60 * MIN);
  });

  it('always lands in a different period', () => {
    for (let h = 0; h < 24; h++) {
      const now = at(h, 17);
      const next = new Date(now.getTime() + msUntilNextTimeOfDay(now));
      expect(getTimeOfDay(next)).not.toBe(getTimeOfDay(now));
      expect(next.getMinutes()).toBe(0);
    }
  });
});

describe('getGreetingTitle', () => {
  it('greets by first name when known', () => {
    expect(getGreetingTitle('afternoon', 'Sonu Kumar')).toBe('Good afternoon, Sonu');
    expect(getGreetingTitle('morning', '  Asha ')).toBe('Good morning, Asha');
  });

  it('says good evening at night and works without a name', () => {
    expect(getGreetingTitle('night', null)).toBe('Good evening');
    expect(getGreetingTitle('evening', '')).toBe('Good evening');
  });
});
