import { describe,it,expect } from 'vitest';
import { validDeputyDates,deputyStatus,weekMonday } from './team-utils';
describe('Baustein 3B Regeln',()=>{
 it('erlaubt höchstens 180 inklusive Tage',()=>{expect(validDeputyDates('2026-01-01','2026-06-29')).toBe(true);expect(validDeputyDates('2026-01-01','2026-06-30')).toBe(false);});
 it('lehnt Bis vor Von ab',()=>{expect(validDeputyDates('2026-11-11','2026-11-10')).toBe(false);});
 it('beendet widerrufene Vertretungen sofort',()=>{expect(deputyStatus({date_from:'2026-11-01',date_to:'2026-11-30',revoked_at:'2026-11-11'},'2026-11-11')).toBe('Beendet');});
 it('normalisiert Mittwoch auf Montag',()=>{expect(weekMonday(new Date('2026-11-11T12:00:00'))).toBe('2026-11-09');});

});
