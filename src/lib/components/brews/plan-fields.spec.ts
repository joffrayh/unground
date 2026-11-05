import { describe, expect, it } from 'vitest';
import type { PlanBaseline } from '#lib/domain/plan.ts';
import {
	canStep,
	canStepTo,
	changeText,
	formatPlanNumber,
	parsePlanNumber,
	plannedChange,
	stepPlanField
} from './plan-fields.ts';

const current: PlanBaseline = {
	waterTempC: 92,
	ratio: 16.7,
	grindSetting: 24,
	pourCount: 4,
	agitation: null
};

describe('formatPlanNumber / parsePlanNumber', () => {
	it('formats without float noise', () => {
		expect(formatPlanNumber(0.1 + 0.2)).toBe('0.3');
		expect(formatPlanNumber(16.7)).toBe('16.7');
		expect(formatPlanNumber(null)).toBe('');
	});
	it('parses a decimal comma and rejects junk', () => {
		expect(parsePlanNumber(' 16,5 ')).toBe(16.5);
		expect(parsePlanNumber('')).toBeNull();
		expect(parsePlanNumber('abc')).toBeNull();
	});
});

describe('stepPlanField', () => {
	it('starts from the brew value when blank', () => {
		expect(stepPlanField('waterTempC', '', 1, current)).toBe('93');
		expect(stepPlanField('grindSetting', '', -1, current)).toBe('23');
	});
	it('moves onto the step grid and stops on the brew value', () => {
		expect(stepPlanField('ratio', '', 1, current)).toBe('17');
		expect(stepPlanField('ratio', '', -1, current)).toBe('16.5');
		// Back from 17 to the brew's own 16.7 means "no change".
		expect(stepPlanField('ratio', '17', -1, current)).toBe('');
	});
	it('clears the field when it reaches the brew value', () => {
		expect(stepPlanField('waterTempC', '93', -1, current)).toBe('');
	});
	it('steps grind by 0.1 when the brew setting has decimals', () => {
		const fine = { ...current, grindSetting: 5.3 };
		expect(stepPlanField('grindSetting', '', 1, fine)).toBe('5.4');
		expect(stepPlanField('grindSetting', '5.9', 1, fine)).toBe('6');
	});
	it('starts agitation from the default when not recorded', () => {
		expect(stepPlanField('agitation', '', 1, current)).toBe('4');
		expect(stepPlanField('agitation', '', -1, current)).toBe('2');
	});
	it('leaves the field when there is nothing to step from', () => {
		const none = { ...current, grindSetting: null };
		expect(canStep('grindSetting', none)).toBe(false);
		expect(stepPlanField('grindSetting', '', 1, none)).toBe('');
		expect(canStep('agitation', current)).toBe(true);
	});
});

describe('canStepTo', () => {
	it('is false at a limit', () => {
		const top = { ...current, agitation: 5 };
		expect(canStepTo('agitation', '', 1, top)).toBe(false);
		expect(canStepTo('agitation', '', -1, top)).toBe(true);
		expect(canStepTo('pourCount', '1', -1, current)).toBe(false);
	});
});

describe('plannedChange / changeText', () => {
	it('ignores blanks and the brew value', () => {
		expect(plannedChange('waterTempC', '', current)).toBeNull();
		expect(plannedChange('waterTempC', '92', current)).toBeNull();
		expect(plannedChange('waterTempC', '94', current)).toBe(94);
		expect(plannedChange('agitation', '3', current)).toBe(3);
	});
	it('describes a change with its unit', () => {
		expect(changeText('grindSetting', 24, 26, 'clicks')).toBe('24 → 26 clicks');
		expect(changeText('ratio', 16.7, 17)).toBe('1:16.7 → 1:17');
		expect(changeText('pourCount', 4, 3)).toBe('4 → 3');
		expect(changeText('agitation', null, 4)).toBe('— → 4 / 5');
	});
});
