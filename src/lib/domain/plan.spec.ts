import { describe, expect, it } from 'vitest';
import {
	PLAN_STEPS,
	grindStep,
	planBaseline,
	planChanges,
	stepValue,
	suggestPours,
	type PlanInput
} from './plan';
import type { Pour } from './pours';

const pour = (volumeG: number, intervalS: number, bloom = false): Pour => ({
	volumeG,
	intervalS,
	bloom
});

/** 15 g, bloom 50 g, then two 100 g pours: 250 g, 1:16.7. */
const PREV = [pour(50, 0, true), pour(100, 45), pour(100, 30)];

describe('stepValue', () => {
	it('moves to the next multiple of the step, so values stay on a tidy grid', () => {
		expect(stepValue(16.7, 1, PLAN_STEPS.ratio)).toBe(17);
		expect(stepValue(16.7, -1, PLAN_STEPS.ratio)).toBe(16.5);
		expect(stepValue(17, 1, PLAN_STEPS.ratio)).toBe(17.5);
		expect(stepValue(17, -1, PLAN_STEPS.ratio)).toBe(16.5);
		expect(stepValue(93.5, 1, PLAN_STEPS.waterTempC)).toBe(94);
		expect(stepValue(93.5, -1, PLAN_STEPS.waterTempC)).toBe(93);
		expect(stepValue(24, 1, PLAN_STEPS.grindSetting)).toBe(25);
	});

	it('stops on the brew’s own value, so an off-grid value can be stepped back to', () => {
		const r = PLAN_STEPS.ratio;
		expect(stepValue(16.7, 1, r, 16.7)).toBe(17);
		expect(stepValue(17, -1, r, 16.7)).toBe(16.7);
		expect(stepValue(16.7, -1, r, 16.7)).toBe(16.5);
		expect(stepValue(16.5, 1, r, 16.7)).toBe(16.7);
		expect(stepValue(94.5, -1, PLAN_STEPS.waterTempC, 93.5)).toBe(94);
		expect(stepValue(94, -1, PLAN_STEPS.waterTempC, 93.5)).toBe(93.5);
	});

	it('stays within the limits', () => {
		expect(stepValue(5, 1, PLAN_STEPS.agitation)).toBe(5);
		expect(stepValue(0, -1, PLAN_STEPS.agitation)).toBe(0);
		expect(stepValue(1, -1, PLAN_STEPS.pourCount)).toBe(1);
		expect(stepValue(100, 1, PLAN_STEPS.waterTempC)).toBe(100);
	});

	it('steps a dial grinder by tenths without float noise', () => {
		const spec = grindStep(5.3);
		expect(spec.step).toBe(0.1);
		expect(stepValue(5.3, 1, spec)).toBe(5.4);
		expect(stepValue(5.3, -1, spec)).toBe(5.2);
		expect(grindStep(24).step).toBe(1);
		// The step comes from the brew's setting, so it stays 0.1 through whole numbers.
		expect(stepValue(stepValue(5.9, 1, spec), 1, spec)).toBe(6.1);
		expect(grindStep(null).step).toBe(1);
	});
});

describe('planChanges', () => {
	const baseline = planBaseline({
		waterTempC: 94,
		grindSetting: 24,
		doseG: 15,
		waterG: 250,
		agitation: 3,
		pourCount: 3
	});
	const plan = (p: Partial<PlanInput>): PlanInput => ({
		waterTempC: null,
		ratio: null,
		grindSetting: null,
		pourCount: null,
		agitation: null,
		notes: null,
		...p
	});

	it('compares the ratio as displayed (one decimal)', () => {
		expect(baseline.ratio).toBe(16.7);
	});

	it('drops values equal to the brew’s own and keeps real changes', () => {
		expect(planChanges(plan({ waterTempC: 94, grindSetting: 26, ratio: 16.7 }), baseline)).toEqual(
			plan({ grindSetting: 26 })
		);
	});

	it('is null when nothing is left', () => {
		expect(planChanges(plan({ agitation: 3, pourCount: 3 }), baseline)).toBeNull();
		expect(planChanges(null, baseline)).toBeNull();
		expect(planChanges(plan({ notes: 'Swirl less' }), baseline)).toEqual(
			plan({ notes: 'Swirl less' })
		);
	});

	it('keeps any agitation when the brew did not record one', () => {
		const legacy = { ...baseline, agitation: null };
		expect(planChanges(plan({ agitation: 3 }), legacy)).toEqual(plan({ agitation: 3 }));
	});
});

describe('suggestPours', () => {
	it('is null when the plan changes neither the water nor the pour count', () => {
		expect(suggestPours(PREV, 15, { ratio: null, pourCount: null })).toBeNull();
		expect(suggestPours(PREV, 15, { ratio: null, pourCount: 3 })).toBeNull();
		expect(suggestPours([], 15, { ratio: 17, pourCount: null })).toBeNull();
	});

	it('keeps the dose and puts a new ratio into the water, blooms fixed', () => {
		const s = suggestPours(PREV, 15, { ratio: 17, pourCount: null });
		expect(s).toEqual({
			pours: [pour(50, 0, true), pour(103, 45), pour(102, 30)],
			totalG: 255,
			added: 0,
			removed: 0
		});
	});

	it('appends a pour one previous gap later and shares the water evenly', () => {
		const s = suggestPours(PREV, 15, { ratio: null, pourCount: 4 });
		expect(s).toEqual({
			pours: [pour(50, 0, true), pour(67, 45), pour(67, 30), pour(66, 30)],
			totalG: 250,
			added: 1,
			removed: 0
		});
	});

	it('drops pours from the end', () => {
		const s = suggestPours(PREV, 15, { ratio: null, pourCount: 2 });
		expect(s).toEqual({
			pours: [pour(50, 0, true), pour(200, 45)],
			totalG: 250,
			added: 0,
			removed: 1
		});
	});

	it('combines a new ratio with a new pour count', () => {
		const s = suggestPours(PREV, 15, { ratio: 16, pourCount: 4 });
		expect(s?.totalG).toBe(240);
		expect(s?.pours.map((p) => p.volumeG)).toEqual([50, 64, 63, 63]);
	});

	it('keeps a fractional bloom exact and puts the remainder on the last pour', () => {
		const s = suggestPours([pour(45.5, 0, true), pour(204.5, 40)], 15, {
			ratio: 17,
			pourCount: 3
		});
		expect(s?.pours.map((p) => p.volumeG)).toEqual([45.5, 105, 104.5]);
		expect(s?.totalG).toBe(255);
	});

	it('uses 45 s for an added pour when the previous brew had a single pour', () => {
		const s = suggestPours([pour(250, 0)], 15, { ratio: null, pourCount: 2 });
		expect(s?.pours).toEqual([pour(125, 0), pour(125, 45)]);
	});

	it('gives up when the water would exceed what can be saved', () => {
		expect(suggestPours(PREV, 200, { ratio: 30, pourCount: null })).toBeNull();
	});

	it('gives up when the blooms alone reach the new total, or every pour is a bloom', () => {
		expect(
			suggestPours([pour(200, 0, true), pour(50, 30)], 10, { ratio: 15, pourCount: null })
		).toBeNull();
		expect(
			suggestPours([pour(50, 0, true), pour(200, 30)], 15, { ratio: null, pourCount: 1 })
		).toBeNull();
	});
});
