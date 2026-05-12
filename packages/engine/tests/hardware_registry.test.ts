import { describe, expect, test } from 'bun:test';
import { RacingHardwareRegistry, type AxisMapping } from '../src/logic/hardware_registry';

describe('RacingHardwareRegistry', () => {
    test('findSchema returns specific hardware before fallback', () => {
        expect(RacingHardwareRegistry.findSchema('MOZA R5 Racing Wheel')?.id).toBe('moza-r-series');
        expect(RacingHardwareRegistry.findSchema('Generic USB Controller')?.id).toBe('standard-gamepad');
    });

    test('normalize applies deadzone, inversion, and clamping', () => {
        const mapping: AxisMapping = { index: 0, inverted: true, deadzone: 0.1, range: [-1, 1] };

        expect(RacingHardwareRegistry.normalize(0.05, mapping)).toBe(0);
        expect(RacingHardwareRegistry.normalize(0.5, mapping)).toBe(-0.5);
        expect(RacingHardwareRegistry.normalize(2, mapping)).toBe(-1);
    });

    test('normalizePedal converts axis range to zero-one pedal travel', () => {
        const mapping: AxisMapping = { index: 1, inverted: false, deadzone: 0, range: [-1, 1] };

        expect(RacingHardwareRegistry.normalizePedal(-1, mapping)).toBe(0);
        expect(RacingHardwareRegistry.normalizePedal(0, mapping)).toBe(0.5);
        expect(RacingHardwareRegistry.normalizePedal(1, mapping)).toBe(1);
    });

    test('normalizePedal supports calibrated rest and pressed values', () => {
        const mapping: AxisMapping = {
            index: 1,
            inverted: false,
            deadzone: 0,
            range: [-1, 1],
            rest: 0.2,
            pressed: 0.8
        };

        expect(RacingHardwareRegistry.normalizePedal(0.2, mapping)).toBe(0);
        expect(RacingHardwareRegistry.normalizePedal(0.5, mapping)).toBeCloseTo(0.5);
        expect(RacingHardwareRegistry.normalizePedal(0.8, mapping)).toBe(1);
    });
});
