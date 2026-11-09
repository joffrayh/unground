/**
 * The core journey, in a real browser (phone viewport) against a production build:
 * sign up → set up a grinder, a bean and a dripper from the brew form → log a brew → rate it on the
 * radar → plan what to change → brew again (placeholders + the plan's suggestions) → export. Plus the
 * same logging flow with JavaScript disabled. The theme choice is covered both ways.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	installFakeScale,
	isScaleConnected,
	playScaleReadings,
	scaleCommandsSent,
	scaleConnectAttempts,
	sendScaleReading,
	setScalePower
} from './fake-scale';
import { fillPours, isoDate, logIn, signUp, uniqueEmail } from './helpers';

/** The scale card's live weight and, unless it's null, its target. */
async function expectReading(card: Locator, current: string, target: string | null) {
	await expect(card.locator('.current')).toHaveText(current);
	if (target === null) await expect(card.locator('.target')).toHaveCount(0);
	else await expect(card.locator('.target')).toHaveText(target);
}

/** CSV rows as objects (the export never quotes the fields this test reads). */
function csvRows(text: string): Record<string, string>[] {
	const [header, ...lines] = text.trim().split('\r\n');
	const cols = header.split(',');
	return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

/** Sign-ups are rate limited and the journeys use them all, so the theme tests reuse an account. */
const THEME_EMAIL = uniqueEmail('theme');
const LIGHT_BG = 'rgb(250, 245, 236)';
const DARK_BG = 'rgb(16, 17, 24)';

/** Picks each theme against the device's setting, checking the choice survives a reload. */
async function checkThemeChoice(page: Page) {
	const background = (colour: string) =>
		expect(page.locator('body')).toHaveCSS('background-color', colour);
	const choose = async (name: string) => {
		const button = page.getByRole('button', { name, exact: true });
		await button.click();
		await expect(button).toHaveAttribute('aria-pressed', 'true');
	};

	await page.emulateMedia({ colorScheme: 'light' });
	await logIn(page, THEME_EMAIL);
	await page.goto('/settings');
	await background(LIGHT_BG);

	await choose('Dark');
	await background(DARK_BG);
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101118');
	await page.reload();
	await background(DARK_BG);

	await page.emulateMedia({ colorScheme: 'dark' });
	await choose('Light');
	await background(LIGHT_BG);

	await choose('System');
	await background(DARK_BG);
	await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
}

async function setUpGrinderAndBean(page: Page, { js = true } = {}) {
	const main = page.getByRole('main');
	await page.goto('/brews/new');
	// A brand-new user is guided to set up equipment first, and returned to the brew form after each step.
	await main
		.getByRole('link', { name: /grinder/i })
		.first()
		.click();
	await expect(page).toHaveURL(/\/equipment\?return=/);
	await page.locator('#new-grinder-name').fill('E2E Comandante');
	await page.locator('#new-grinder-unit').fill('clicks');
	await page.getByRole('button', { name: 'Add grinder' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*grinder=/);

	await main.getByRole('link', { name: /bean/i }).first().click();
	await expect(page).toHaveURL(/\/beans\/new\?return=/);
	await page.locator('[name="name"]').fill('E2E Kochere');
	await page.locator('[name="roasterName"]').fill('E2E Roasters');
	await page.locator('[name="country"]').selectOption('ET');
	await page.locator('[name="process"]').selectOption('washed');
	await page.locator('[name="roastLevel"]').selectOption('light');
	await page.locator('[name="roastDate"]').fill(isoDate(10));
	await page.locator('[name="bagWeightG"]').fill('250');
	if (js) {
		// Tag search is a JS enhancement (without JS the notes are checkboxes under "Browse all").
		const notes = page.getByRole('combobox', { name: /tasting notes/i });
		await notes.fill('peach');
		await expect(page.getByRole('option', { name: /^Peach/ })).toBeVisible();
		await notes.press('Enter');
		await expect(page.getByRole('button', { name: 'Remove Peach' })).toBeVisible();
	}
	await page.getByRole('button', { name: 'Save bean' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*bean=/);
}

/** On the brew form the nav's centre button saves, and scrolling leaves only that button. */
async function checkNavFolds(page: Page) {
	const nav = page.getByRole('navigation', { name: 'Main' });
	const brews = nav.getByRole('link', { name: 'Brews' });
	const scrollTo = (y: number) => page.evaluate((top) => window.scrollTo(0, top), y);

	await expect(nav.getByRole('button', { name: 'Save brew' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Add Brew' })).toHaveCount(0);
	await expect(brews).toBeVisible();

	await scrollTo(400);
	await expect(brews).toBeHidden();
	await expect(nav.getByRole('button', { name: 'Save brew' })).toBeVisible();

	await scrollTo(0);
	await expect(brews).toBeVisible();
}

async function logBrew(page: Page) {
	await page.locator('[name="grindSetting"]').fill('24');
	await page.locator('[name="doseG"]').fill('15');
	await page.locator('[name="waterTempC"]').fill('94');
	await fillPours(page, [
		['0:00', '50'],
		['0:45', '150'],
		['1:15', '250']
	]);
	await page.locator('[name="totalTime"]').fill('3:15');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
}

test('signed-out visitors are sent to log in, keeping where they were going', async ({ page }) => {
	await page.goto('/brews');
	await expect(page).toHaveURL('/login?next=%2Fbrews');
	const res = await page.request.get('/export/brews.csv', { maxRedirects: 0 });
	expect(res.status()).toBe(303);
});

test('log, rate, plan, repeat and export a brew', async ({ page }) => {
	await signUp(page, uniqueEmail('flow'));
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	await setUpGrinderAndBean(page);

	await checkNavFolds(page);

	// The dripper is added from the set-up card like a grinder, and comes back selected.
	await page.getByRole('main').getByRole('link', { name: '+ Add a dripper' }).click();
	await expect(page).toHaveURL(/\/equipment\?return=/);
	await page.locator('#new-dripper-name').fill('E2E V60 02');
	await page.locator('#new-dripper-material').selectOption('plastic');
	await page.getByRole('button', { name: 'Add dripper' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?.*dripper=/);
	await expect(page.locator('[name="dripperId"] option:checked')).toHaveText('E2E V60 02');

	// A first brew starts with pour 0 ticked as the bloom; agitation defaults to 3.
	await expect(page.locator('input[name="pourBloom"]').first()).toBeChecked();
	await expect(page.getByRole('slider', { name: 'Agitation', exact: true })).toHaveValue('3');
	await expect(page.getByText('What changed')).toHaveCount(0);
	await expect(page.getByRole('slider', { name: 'Overall', exact: true })).toBeVisible();

	await logBrew(page);
	const brewUrl = page.url();
	await expect(page.getByText('E2E Kochere').first()).toBeVisible();
	await expect(page.getByText('1:16.7')).toBeVisible();
	await expect(page.getByText('250 g').first()).toBeVisible();

	// Rate it afterwards, the sub-scores on the radar.
	await page.getByRole('slider', { name: 'Overall', exact: true }).fill('8');
	const acidity = page.getByRole('slider', { name: 'Acidity intensity' });
	await acidity.focus();
	await acidity.press('End');
	for (let i = 0; i < 2; i++) await acidity.press('ArrowDown');
	await expect(acidity).toHaveAttribute('aria-valuenow', '8');
	// The slider under the radar moves the axis last touched.
	await page.getByRole('slider', { name: 'Acidity', exact: true }).fill('7');
	await expect(acidity).toHaveAttribute('aria-valuenow', '7');
	const sweetness = page.getByRole('slider', { name: 'Sweetness intensity' });
	await sweetness.focus();
	await sweetness.press('Home');
	await expect(page.getByRole('slider', { name: 'Sweetness', exact: true })).toHaveValue('1');
	await sweetness.press('Delete');
	// Tasting notes are tags picked from a search; a tap on a match adds it.
	await page.getByRole('combobox', { name: /tasting notes/i }).fill('blueb');
	await page.getByRole('option', { name: /^Blueberry/ }).click();
	await page.getByRole('button', { name: 'Save rating' }).first().click();
	await expect(page.getByLabel('Overall 8 of 10')).toBeVisible();
	// (The edit form further down holds the same name, folded away.)
	await expect(page.getByText('Blueberry', { exact: true }).first()).toBeVisible();

	// Dropdowns slide: open at once, closed only when the slide ends.
	const editRating = page.locator('#rate > details');
	const sliding = () => editRating.evaluate((el) => el.getAnimations().length > 0);
	expect(
		await editRating.evaluate((el) => {
			el.querySelector('summary')?.click();
			return (el as HTMLDetailsElement).open && el.getAnimations().length > 0;
		})
	).toBe(true);
	await expect.poll(sliding).toBe(false);
	await editRating.getByText('Edit', { exact: true }).click();
	await expect(editRating).not.toHaveAttribute('open');

	// Plan the next one: ratio 1:16.7 → 1:17, grind 24 → 25, 3 → 4 pours, agitation 3 → 4.
	const next = page.locator('#next');
	// With no plan yet, its toggle shares the heading's row.
	const headingBox = await next.getByRole('heading', { name: 'Next time' }).boundingBox();
	const toggleBox = await next.getByText('Plan the next brew').boundingBox();
	expect(toggleBox!.y + toggleBox!.height / 2).toBeCloseTo(
		headingBox!.y + headingBox!.height / 2,
		-1
	);
	expect(toggleBox!.x).toBeGreaterThan(headingBox!.x);
	await next.getByRole('button', { name: 'Raise ratio' }).click();
	await expect(next.locator('[name="nextRatio"]')).toHaveValue('17');
	await next.getByRole('button', { name: 'Raise grind setting' }).click();
	await next.getByRole('button', { name: 'Raise number of pours' }).click();
	await next.getByRole('button', { name: 'Raise agitation' }).click();
	await next.getByRole('button', { name: 'Save plan' }).click();
	await expect(next.getByText('24 → 25')).toBeVisible();

	// Brew again: the recipe shows as placeholders, the plan as green suggestions (D25, D26).
	await page.getByRole('link', { name: 'Brew again' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?from=/);
	const dose = page.locator('[name="doseG"]');
	await expect(dose).toHaveValue('');
	await expect(dose).toHaveAttribute('placeholder', '15');
	await expect(page.locator('[name="pourScale"]').nth(2)).toHaveAttribute('placeholder', '250');
	await expect(page.locator('[name="totalTime"]')).toHaveValue('');
	await expect(page.locator('input[name="overall"]')).toHaveValue('');
	await expect(page.locator('[name="dripperId"] option:checked')).toHaveText('E2E V60 02');

	await page.getByRole('button', { name: 'Use 25 clicks, as planned last time' }).click();
	await expect(page.locator('[name="grindSetting"]')).toHaveValue('25');
	// The planned agitation level is offered, not picked, and a tap applies it.
	const agitation = page.getByRole('slider', { name: 'Agitation', exact: true });
	await expect(agitation).toHaveValue('3');
	await page.getByRole('button', { name: 'Use 4, as planned last time' }).click();
	await expect(agitation).toHaveValue('4');
	await agitation.fill('3');

	// The pour card offers the reshaped pours: one added (green), the water at 1:17.
	await expect(page.getByLabel('Suggested pour 3')).toBeVisible();
	// A reading typed before accepting survives it.
	await page.locator('[name="pourTime"]').nth(1).fill('0:45');
	await page.getByRole('button', { name: 'Accept' }).click();
	await expect(page.locator('[name="pourTime"]').nth(1)).toHaveValue('0:45');
	await expect(page.getByText(/Plan applied/)).toBeVisible();
	// A new dose reshapes the plan, so it is offered again; back to 15 g it is applied as it was.
	await dose.fill('20');
	await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
	await expect(page.getByText('› 340 g', { exact: true })).toBeVisible();
	await dose.fill('');
	await expect(page.getByText(/Plan applied/)).toBeVisible();
	const scales = page.locator('[name="pourScale"]');
	await expect(scales).toHaveCount(4);
	expect(await scales.evaluateAll((els) => els.map((e) => e.getAttribute('placeholder')))).toEqual([
		'50',
		'119',
		'187',
		'255'
	]);
	await expect(page.getByText('Ratio 1:17')).toBeVisible();

	// Only the measurements are typed; blank fields save their placeholders.
	await page.locator('[name="totalTime"]').fill('3:30');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	const secondUrl = page.url();
	await expect(page.getByText('1:17', { exact: true })).toBeVisible();

	// Export carries both brews with derived values, the plan and the new columns.
	const brews = csvRows(await (await page.request.get('/export/brews.csv')).text());
	expect(brews).toHaveLength(2);
	// Both brews are logged within the same minute, so find them by id rather than by order.
	const firstId = brewUrl.split('/').pop();
	const secondId = secondUrl.split('/').pop();
	const byId = (id: string | undefined) => brews.find((b) => b.brew_id === id);
	expect(byId(firstId)).toMatchObject({
		bean_name: 'E2E Kochere',
		roaster_name: 'E2E Roasters',
		country: 'ET',
		roast_age_days: '10',
		bag_weight_g: '250',
		dripper_name: 'E2E V60 02',
		dripper_material: 'plastic',
		dose_g: '15',
		water_g: '250',
		ratio: '16.7',
		agitation: '3',
		pour_count: '3',
		bloom_pours: '1',
		bloom_time_s: '45',
		changed: '',
		rating_overall: '8',
		rating_acidity: '7',
		rating_sweetness: '',
		roaster_notes: 'fruity.other_fruit.peach',
		next_ratio: '17',
		next_grind_setting: '25',
		next_pour_count: '4',
		next_agitation: '4',
		next_water_temp_c: '',
		perceived_notes: 'fruity.berry.blueberry'
	});
	expect(byId(secondId)).toMatchObject({
		grind_setting: '25',
		dose_g: '15',
		water_temp_c: '94',
		water_g: '255',
		ratio: '17',
		pour_count: '4',
		bloom_pours: '1',
		dripper_name: 'E2E V60 02'
	});
	const pours = csvRows(await (await page.request.get('/export/pours.csv')).text());
	const poursOf = (id: string | undefined) => pours.filter((p) => p.brew_id === id);
	expect(poursOf(firstId).map((p) => [p.pour_number, p.cumulative_g, p.bloom])).toEqual([
		['0', '50', 'true'],
		['1', '150', 'false'],
		['2', '250', 'false']
	]);
	expect(poursOf(secondId).map((p) => [p.pour_number, p.cumulative_g, p.bloom])).toEqual([
		['0', '50', 'true'],
		['1', '119', 'false'],
		['2', '187', 'false'],
		['3', '255', 'false']
	]);
	// The home screen tracks the bag: 250 g − 2 × 15 g, brews left at the latest dose.
	await page.goto('/');
	const bags = page.getByRole('region', { name: 'Your beans' });
	await expect(bags.getByText('E2E Kochere')).toBeVisible();
	await expect(bags.getByText(/220 g left/)).toBeVisible();
	await expect(bags.getByText(/14 brews/)).toBeVisible();
});

test('brew again survives a new-grinder detour, and never copies grind across grinders', async ({
	page
}) => {
	await signUp(page, uniqueEmail('detour'));
	await setUpGrinderAndBean(page);
	await logBrew(page);
	await page.getByRole('link', { name: 'Brew again' }).click();
	await expect(page).toHaveURL(/\/brews\/new\?from=/);
	const copyUrl = page.url();

	// Enter/Go on the phone keyboard moves on instead of saving a half-filled brew.
	await page.locator('[name="doseG"]').press('Enter');
	await expect(page.locator('[name="waterTempC"]')).toBeFocused();
	expect(page.url()).toBe(copyUrl);

	await page.locator('[name="waterTempC"]').fill('91');
	await page.getByRole('main').getByRole('link', { name: '+ Add a grinder' }).click();
	await page.locator('#new-grinder-name').fill('E2E Dial grinder');
	await page.locator('#new-grinder-unit').fill('dial');
	await page.getByRole('button', { name: 'Add grinder' }).click();

	// Back on the same copy (from= kept), with the new grinder selected and no grind placeholder.
	await expect(page).toHaveURL(/\/brews\/new\?from=[0-9a-f-]+&grinder=/);
	await expect(page.locator('[name="waterTempC"]')).toHaveValue('91');
	await expect(page.locator('[name="doseG"]')).toHaveAttribute('placeholder', '15');
	await expect(page.locator('[name="grindSetting"]')).toHaveValue('');
	await expect(page.locator('[name="grindSetting"]')).toHaveAttribute('placeholder', '');
	await expect(page.getByText(/different grinder/)).toBeVisible();
});

test('a blank pour time saves the time it shows, and the brew page leads back to the list', async ({
	page
}) => {
	await signUp(page, THEME_EMAIL);
	await setUpGrinderAndBean(page);
	await page.locator('[name="grindSetting"]').fill('24');
	await page.locator('[name="doseG"]').fill('15');
	await page.locator('[name="waterTempC"]').fill('94');
	// Only scale readings: the start times are estimated 0:45 apart and shown as placeholders.
	const times = page.locator('[name="pourTime"]');
	const scales = page.locator('[name="pourScale"]');
	await scales.nth(0).fill('50');
	await scales.nth(1).fill('150');
	await scales.nth(2).fill('250');
	await expect(times.nth(1)).toHaveAttribute('placeholder', '0:45');
	await expect(times.nth(2)).toHaveAttribute('placeholder', '1:30');
	await page.locator('[name="totalTime"]').fill('3:00');
	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('cell', { name: '0:45' })).toBeVisible();
	await expect(page.getByRole('cell', { name: '1:30' })).toBeVisible();

	await page.getByRole('main').getByRole('link', { name: 'Brews' }).click();
	await expect(page).toHaveURL('/brews');

	// An equipment row's Edit sits beside its name and opens the form under it.
	await page.goto('/equipment');
	const row = page.getByRole('listitem').filter({ hasText: 'E2E Comandante' });
	const name = await row.getByText('E2E Comandante').boundingBox();
	const edit = row.getByText('Edit', { exact: true });
	const editBox = await edit.boundingBox();
	expect(editBox!.y).toBeLessThan(name!.y + name!.height);
	expect(editBox!.x).toBeGreaterThan(name!.x + name!.width);
	await edit.click();
	await expect(row.getByLabel('Setting unit')).toBeVisible();
});

test('a brew in progress survives leaving the form, until it is cancelled', async ({ page }) => {
	await logIn(page, THEME_EMAIL);
	const nav = page.getByRole('navigation', { name: 'Main' });
	const addBrew = nav.getByRole('link', { name: 'Add Brew' });
	const dose = page.locator('[name="doseG"]');
	const notes = page.locator('[name="notes"]');
	const agitation = page.getByRole('slider', { name: 'Agitation', exact: true });
	const pours = page.locator('[name="pourScale"]');
	await addBrew.click();
	await expect(dose).toHaveAttribute('placeholder', '15');

	// Buttons that set values without an input event are kept too.
	await page.getByRole('button', { name: /add pour/i }).click();
	const added = await pours.count();
	await pours.last().fill('300');
	await dose.fill('17');
	await notes.fill('half done');
	await agitation.fill('5');
	await page.locator('[name="pourTime"]').nth(1).fill('0:50');

	await nav.getByRole('link', { name: 'Beans' }).click();
	await expect(page).toHaveURL('/beans');
	await addBrew.click();
	await expect(dose).toHaveValue('17');
	await expect(notes).toHaveValue('half done');
	await expect(agitation).toHaveValue('5');
	await expect(pours).toHaveCount(added);
	await expect(page.locator('[name="pourTime"]').nth(1)).toHaveValue('0:50');

	// It survives a reload too.
	await page.reload();
	await expect(dose).toHaveValue('17');

	// Declining the prompt keeps it; accepting clears it and goes home.
	const cancel = page.getByRole('link', { name: 'Cancel brew' });
	page.once('dialog', (dialog) => dialog.dismiss());
	await cancel.click();
	await expect(page).toHaveURL('/brews/new');
	await expect(dose).toHaveValue('17');

	page.once('dialog', (dialog) => dialog.accept());
	await cancel.click();
	await expect(page).toHaveURL('/');
	await addBrew.click();
	await expect(dose).toHaveValue('');
	await expect(notes).toHaveValue('');

	// A saved brew doesn't come back.
	await dose.fill('16');
	await page.locator('[name="totalTime"]').fill('3:10');
	await nav.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	await nav.getByRole('link', { name: 'Add Brew' }).click();
	await expect(dose).toHaveValue('');
});

test('choosing a theme', async ({ page }) => {
	await checkThemeChoice(page);
});

test('a new page is animating from its first frame and leaves nothing behind', async ({ page }) => {
	await logIn(page, THEME_EMAIL);
	await page.waitForLoadState('networkidle');

	// requestAnimationFrame runs just before each paint, so this sees what the first frame shows.
	const splitOnFirstFrame = page.evaluate(
		() =>
			new Promise<boolean>((resolve) => {
				const onFrame = () => {
					const heading = document.querySelector('main h1');
					if (heading?.textContent?.includes('Beans')) {
						resolve(heading.querySelector('[aria-hidden]') !== null);
					} else {
						requestAnimationFrame(onFrame);
					}
				};
				onFrame();
			})
	);
	await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Beans' }).click();
	expect(await splitOnFirstFrame).toBe(true);

	const heading = page.getByRole('heading', { name: 'Beans', level: 1 });
	await expect(heading.locator('span')).toHaveCount(0);
	await expect(heading).toHaveText('Beans');
	await expect
		.poll(() =>
			page.evaluate(() => document.querySelector('main')?.getAnimations({ subtree: true }).length)
		)
		.toBe(0);
});

test('a paired scale connects by itself', async ({ page }) => {
	await installFakeScale(page);
	await page.clock.install();
	await logIn(page, THEME_EMAIL);
	await page.goto('/equipment');
	await page.locator('#new-scale-name').fill('Kitchen scale');
	await page.getByRole('button', { name: 'Add scale' }).click();

	const row = page.getByRole('listitem').filter({ hasText: 'Kitchen scale' });
	await expect(row).toContainText('Not paired');
	await row.getByRole('button', { name: 'Pair' }).click();
	await expect(row).toContainText('Connected');

	// Saving a form reloads the page's data, which mustn't touch the connection.
	const attempts = await scaleConnectAttempts(page);
	await page.locator('#new-scale-name').fill('Spare scale');
	await page.getByRole('button', { name: 'Add scale' }).click();
	await expect(page.getByRole('listitem').filter({ hasText: 'Spare scale' })).toBeVisible();
	expect(await isScaleConnected(page)).toBe(true);
	expect(await scaleConnectAttempts(page)).toBe(attempts);

	// Turned off, then on again: picked up at the next 20-second retry.
	await setScalePower(page, false);
	await expect(row).toContainText('Looking for it');
	await setScalePower(page, true);
	await page.clock.fastForward(18_000);
	await expect(row).toContainText('Looking for it');
	await page.clock.fastForward(3_000);
	await expect(row).toContainText('Connected');

	// A fresh open needs no tap.
	await page.reload();
	await expect(row).toContainText('Connected');

	await row.getByRole('button', { name: 'Unpair' }).click();
	await expect(row).toContainText('Not paired');
	expect(await isScaleConnected(page)).toBe(false);
	await page.reload();
	await expect(row).toContainText('Not paired');
	expect(await isScaleConnected(page)).toBe(false);

	// Archiving a paired scale forgets the pairing.
	await row.getByRole('button', { name: 'Pair' }).click();
	await expect(row).toContainText('Connected');
	await row.getByText('Edit').click();
	await row.getByRole('button', { name: 'Archive' }).click();
	await expect(row).toContainText('Not paired');
	await expect(row.getByRole('button', { name: 'Pair' })).toHaveCount(0);
	expect(await isScaleConnected(page)).toBe(false);
});

test('the scale card shows the live reading against pour 0', async ({ page }) => {
	await installFakeScale(page);
	await logIn(page, THEME_EMAIL);
	await page.goto('/equipment');
	await page.locator('#new-scale-name').fill('Brew scale');
	await page.getByRole('button', { name: 'Add scale' }).click();
	const row = page.getByRole('listitem').filter({ hasText: 'Brew scale' });
	await row.getByRole('button', { name: 'Pair' }).click();
	await expect(row).toContainText('Connected');

	// The connection carries over to the brew form.
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Add Brew' })
		.click();
	const card = page.getByRole('region', { name: 'Scale' });
	await expect(card).toContainText('Brew scale');
	const enter = card.getByRole('button', { name: 'Enter' });
	await expect(enter).toHaveCSS('background-color', 'rgb(86, 171, 250)');

	const scales = page.locator('[name="pourScale"]');
	await scales.first().fill('45');
	const before = await page
		.locator('form.brew-form')
		.evaluate((f: HTMLFormElement) =>
			JSON.stringify([...new FormData(f).entries()].filter(([k]) => k !== 'brewedAt'))
		);

	await enter.click();
	await expect
		.poll(() => scaleCommandsSent(page))
		.toEqual([
			[3, 10, 1, 0, 0, 8],
			[3, 10, 6, 0, 0, 15]
		]);
	await expect
		.poll(() =>
			card.evaluate((el) => {
				const box = el.getBoundingClientRect();
				return Math.abs(box.top + box.height / 2 - innerHeight / 2);
			})
		)
		.toBeLessThan(40);

	const readout = card.locator('.readout');
	await sendScaleReading(page, 12.34, 3);
	await expectReading(card, '12.3g', '45.0g');
	await expect(card.locator('.arrow')).toBeVisible();
	await expect(readout).not.toContainText('>');
	await sendScaleReading(page, -0.04);
	await expectReading(card, '0.0g', '45.0g');

	// The target follows the form.
	await scales.first().fill('50');
	await expectReading(card, '0.0g', '50.0g');
	await scales.first().fill('45');

	// It only reads: the form posts exactly what it did before.
	await card.getByRole('button', { name: 'Exit' }).click();
	await expect(readout).toHaveCount(0);
	const after = await page
		.locator('form.brew-form')
		.evaluate((f: HTMLFormElement) =>
			JSON.stringify([...new FormData(f).entries()].filter(([k]) => k !== 'brewedAt'))
		);
	expect(after).toBe(before);

	await setScalePower(page, false);
	await expect(card).toHaveCount(0);
});

test('the scale card guides a brew from the first pour to the lift', async ({ page }) => {
	await installFakeScale(page);
	await logIn(page, THEME_EMAIL);
	await page.goto('/equipment');
	await page.locator('#new-scale-name').fill('Guide scale');
	await page.getByRole('button', { name: 'Add scale' }).click();
	const row = page.getByRole('listitem').filter({ hasText: 'Guide scale' });
	await row.getByRole('button', { name: 'Pair' }).click();
	await expect(row).toContainText('Connected');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Add Brew' })
		.click();

	const scales = page.locator('[name="pourScale"]');
	const times = page.locator('[name="pourTime"]');
	await scales.nth(0).fill('45');
	await times.nth(1).fill('0:45');
	await scales.nth(1).fill('150');
	await page.getByRole('button', { name: /remove pour 2/i }).click();

	const card = page.getByRole('region', { name: 'Scale' });
	await card.getByRole('button', { name: 'Enter' }).click();
	await expect.poll(async () => (await scaleCommandsSent(page)).length).toBe(2);

	let timer = 0;
	let weight = 0;
	/** Readings every 100 ms of scale time, for this long, towards a weight. */
	const play = async (ms: number, to = weight, flow = 0) => {
		const rows: [number, number, number][] = [];
		const from = weight;
		const steps = ms / 100;
		for (let i = 1; i <= steps; i++) {
			timer += 100;
			weight = from + ((to - from) * i) / steps;
			rows.push([timer, weight, flow]);
		}
		await playScaleReadings(page, rows);
	};

	await play(500);
	await expect(card.locator('.label')).toHaveText('Pour 0');
	await expectReading(card, '0.0g', '45.0g');

	await play(3000, 46.2, 10);
	await expectReading(card, '46.2g', '45.0g');

	await play(1000);
	await expect(card.locator('.label')).toHaveText('Pour 1');
	await expectReading(card, '46.2g', '150.0g');
	await expect(card.locator('.countdown')).toHaveCSS('font-family', /Corben/);
	await expect(card.locator('.elapsed')).toHaveCSS('font-family', /Corben/);
	await expect(card.locator('.countdown')).toHaveText('0:42');

	await play(41_100);
	await expect(card.locator('.countdown')).toHaveText('Pour');

	await play(1000);
	await play(3000, 153.5, 10);
	await play(1000);
	await expect(card.locator('.label')).toHaveText('Drawdown');
	await expectReading(card, '153.5g', null);

	weight = -240;
	await play(3000);
	await expect(card.locator('.label')).toHaveText('Done');
	await expect
		.poll(async () => (await scaleCommandsSent(page)).at(-1))
		.toEqual([3, 10, 5, 0, 0, 12]);
	// Nothing to confirm once the brew is over.
	await card.getByRole('button', { name: 'Exit' }).click();
	await expect(card.locator('.label')).toHaveCount(0);

	// The form now holds what happened, and the adjustments start from the measured water (15 g dose).
	await expect(scales.nth(0)).toHaveValue('46.2');
	await expect(scales.nth(1)).toHaveValue('153.5');
	await expect(times.nth(1)).toHaveValue('0:46');
	await expect(page.locator('[name="totalTime"]')).toHaveValue('0:50');
	await page.locator('[name="doseG"]').fill('15');
	await expect(page.locator('[name="nextRatio"]')).toHaveAttribute('placeholder', '10.2');

	await page.getByRole('button', { name: 'Save brew' }).click();
	await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('cell', { name: '0:46' })).toBeVisible();

	// The next brew starts from the plan, not from what was measured (D51). Copied by id: brew times
	// are to the minute, so "latest" could be this account's earlier brew.
	await page.goto(`/brews/new?from=${page.url().split('/').pop()}`);
	await expect(scales.nth(0)).toHaveAttribute('placeholder', '45');
	await expect(scales.nth(1)).toHaveAttribute('placeholder', '150');
	await expect(times.nth(1)).toHaveAttribute('placeholder', '0:45');
});

test('stopping short waits for a top-up, and leaving a brew asks first', async ({ page }) => {
	await installFakeScale(page);
	await logIn(page, THEME_EMAIL);
	await page.goto('/equipment');
	await page.locator('#new-scale-name').fill('Short scale');
	await page.getByRole('button', { name: 'Add scale' }).click();
	const row = page.getByRole('listitem').filter({ hasText: 'Short scale' });
	await row.getByRole('button', { name: 'Pair' }).click();
	await expect(row).toContainText('Connected');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Add Brew' })
		.click();
	await page.locator('[name="pourScale"]').nth(0).fill('45');

	const card = page.getByRole('region', { name: 'Scale' });
	await card.getByRole('button', { name: 'Enter' }).click();
	await expect.poll(async () => (await scaleCommandsSent(page)).length).toBe(2);

	const rows: [number, number, number][] = [];
	for (let i = 1; i <= 5; i++) rows.push([i * 100, 0, 0]);
	for (let i = 1; i <= 30; i++) rows.push([500 + i * 100, i, 10]);
	for (let i = 1; i <= 10; i++) rows.push([3500 + i * 100, 30, 0]);
	await playScaleReadings(page, rows);
	await expect(card.locator('.label')).toHaveText('Pour 0');
	await expect(card.locator('.short')).toHaveText('15.0g short');

	await card.getByRole('button', { name: 'Next' }).click();
	await expect(card.locator('.label')).toHaveText('Pour 1');

	page.once('dialog', (dialog) => dialog.dismiss());
	await card.getByRole('button', { name: 'Exit' }).click();
	await expect(card.locator('.label')).toHaveText('Pour 1');

	page.once('dialog', (dialog) => dialog.accept());
	await card.getByRole('button', { name: 'Exit' }).click();
	await expect(card.getByRole('button', { name: 'Enter' })).toBeVisible();
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('choosing a theme', async ({ page }) => {
		await checkThemeChoice(page);
	});

	test('a first brew saves with only scale readings, at the estimated times', async ({ page }) => {
		await signUp(page, uniqueEmail('nojs-times'));
		await setUpGrinderAndBean(page, { js: false });
		await page.locator('[name="grindSetting"]').fill('22');
		await page.locator('[name="doseG"]').fill('15');
		await page.locator('[name="waterTempC"]').fill('93');
		const times = page.locator('[name="pourTime"]');
		await expect(times.nth(1)).toHaveAttribute('placeholder', '0:45');
		await expect(times.nth(2)).toHaveAttribute('placeholder', '1:30');
		await page.locator('[name="pourScale"]').nth(0).fill('50');
		await page.locator('[name="pourScale"]').nth(1).fill('150');
		await page.locator('[name="pourScale"]').nth(2).fill('250');
		await page.locator('[name="totalTime"]').fill('3:00');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByRole('cell', { name: '0:45' })).toBeVisible();
		await expect(page.getByRole('cell', { name: '1:30' })).toBeVisible();
	});

	test('a failed submit keeps the input, and the fixed brew saves', async ({ page }) => {
		const email = uniqueEmail('nojs');
		await signUp(page, email);
		await setUpGrinderAndBean(page, { js: false });

		await page.locator('[name="grindSetting"]').fill('22');
		// Dose left blank on purpose.
		await page.locator('[name="waterTempC"]').fill('93');
		await page.locator('[name="pourScale"]').nth(0).fill('45');
		await page.locator('[name="pourTime"]').nth(1).fill('0:40');
		await page.locator('[name="pourScale"]').nth(1).fill('240');
		await page.locator('[name="totalTime"]').fill('3:00');
		await page.getByRole('button', { name: 'Save brew' }).click();

		await expect(page.getByRole('alert').first()).toBeVisible();
		await expect(page.locator('[name="doseG"]')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('[name="grindSetting"]')).toHaveValue('22');
		await expect(page.locator('[name="pourScale"]').nth(1)).toHaveValue('240');
		await expect(page.locator('[name="totalTime"]')).toHaveValue('3:00');

		await page.locator('[name="doseG"]').fill('15');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByText('1:16', { exact: true })).toBeVisible();

		// Brew again without JavaScript: blank fields save last brew's values (D26).
		await page.getByRole('link', { name: 'Brew again' }).click();
		await expect(page.locator('[name="doseG"]')).toHaveAttribute('placeholder', '15');
		await page.locator('[name="totalTime"]').fill('3:05');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		await expect(page.getByText('240 g').first()).toBeVisible();

		// ...and a placeholder pour can be left out with its "drop" box.
		await page.getByRole('link', { name: 'Brew again' }).click();
		await page.getByLabel('Leave out pour 1').check();
		await page.locator('[name="totalTime"]').fill('2:30');
		await page.getByRole('button', { name: 'Save brew' }).click();
		await expect(page).toHaveURL(/\/brews\/[0-9a-f-]{36}$/);
		// Only pour 0 (45 g) is left.
		await expect(page.getByRole('cell', { name: 'Pour 1' })).toHaveCount(0);
		await expect(page.getByText('1:3', { exact: true })).toBeVisible();

		// Signing in again (fresh session) shows the brew in the list.
		await page.context().clearCookies();
		await logIn(page, email);
		await page.goto('/brews');
		await expect(page.getByRole('main').getByText('E2E Kochere').first()).toBeVisible();
	});
});
